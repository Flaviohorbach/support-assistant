import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { z } from "zod";
import { customers } from "@/data/seed";
import { buildContext, estimateTokens, trimHistory } from "@/lib/context";
import { getDb } from "@/lib/db";
import { listMemories } from "@/lib/memory";
import { createShopModel } from "@/lib/model";
import { loadPolicy, selectSections } from "@/lib/policy";
import { createRateLimiter } from "@/lib/rate-limit";
import { createTools, type ContextMetadata, type SupportUIMessage } from "@/lib/tools";

const model = createShopModel();
const rateLimit = createRateLimiter({ limit: 12, windowMs: 10 * 60_000 });

const BodySchema = z.object({
  messages: z.array(z.any()).min(1),
  customerId: z.enum(customers.map((c) => c.id) as [string, ...string[]]),
  visitorId: z.string().min(8).max(64),
});

export const maxDuration = 30;

/** Text of the customer's last messages: what decides which policy sections are relevant. */
const recentUserText = (messages: SupportUIMessage[], count = 2) =>
  messages
    .filter((m) => m.role === "user")
    .slice(-count)
    .flatMap((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")))
    .join(" ");

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const { allowed, retryAfterMs } = rateLimit(client);
  if (!allowed) {
    return new Response(`Você enviou muitas mensagens seguidas. Tente de novo em ${Math.ceil(retryAfterMs / 60_000)} min.`, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) return new Response("Requisição inválida.", { status: 400 });
  const { customerId, visitorId } = parsed.data;
  const messages = parsed.data.messages as SupportUIMessage[];
  const customer = customers.find((c) => c.id === customerId)!;

  const db = await getDb();
  const { sections } = loadPolicy();
  const { facts, episodes } = await listMemories(db, visitorId, customerId);
  const { selected, matchedTopics } = selectSections(sections, recentUserText(messages));
  const context = buildContext({ customer, facts, episodes, policySections: selected, matchedTopics, today: new Date() });

  const history = trimHistory(messages);
  const modelMessages = await convertToModelMessages(history.messages);
  const historyTokens = estimateTokens(JSON.stringify(modelMessages));

  const metadata: ContextMetadata = {
    sections: context.sections,
    history: { messages: history.messages.length, tokens: historyTokens, droppedMessages: history.droppedMessages, prunedToolResults: history.prunedToolResults },
    totalTokens: context.sections.reduce((sum, s) => sum + s.tokens, 0) + historyTokens,
  };

  const result = streamText({
    model,
    maxRetries: 1,
    system: context.system,
    messages: modelMessages,
    tools: createTools({ db, visitorId, customerId }),
    stopWhen: stepCountIs(5),
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // The context goes to the browser with the answer, so the inspector shows exactly what the model saw.
    messageMetadata: ({ part }) => (part.type === "start" ? { context: metadata } : undefined),
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/per day|quota/i.test(message)) return "O atendimento atingiu o limite gratuito de hoje. Volte amanhã!";
      if (/high demand|overloaded|503/i.test(message)) return "O atendimento está sobrecarregado agora. Tente de novo em alguns segundos.";
      if (/api key is missing|GEMINI_API_KEY/i.test(message)) return "A demonstração está sem a chave da IA configurada no servidor.";
      if (/API_KEY_INVALID|API key not valid/i.test(message)) return "A chave da IA configurada no servidor é inválida.";
      console.error("chat error:", message);
      return "Algo deu errado do nosso lado. Tente de novo.";
    },
  });
}
