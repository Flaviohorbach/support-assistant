import { tool, type InferUITools, type UIMessage } from "ai";
import { z } from "zod";
import type { ContextSection } from "./context";
import type { Db } from "./db";
import { addEpisode, saveFact } from "./memory";
import { findOrder, listOrders } from "./orders";
import { checkEligibility, loadPolicy, type ReturnReason } from "./policy";

const REASONS = ["regret", "exchange", "defect", "damaged_on_arrival"] as const;
const REASON_LABEL: Record<ReturnReason, string> = {
  regret: "arrependimento",
  exchange: "troca de tamanho, cor ou modelo",
  defect: "defeito",
  damaged_on_arrival: "avaria na entrega",
};

const reasonSchema = z
  .enum(REASONS)
  .describe("regret = desistiu da compra; exchange = quer outro tamanho, cor ou modelo; defect = produto com defeito; damaged_on_arrival = chegou danificado");

/**
 * Tools are created per request, bound to the customer of the conversation:
 * the customer id never comes from the model.
 */
export function createTools({ db, visitorId, customerId }: { db: Db; visitorId: string; customerId: string }) {
  const { rules } = loadPolicy();

  async function decide(orderId: string, sku: number, reason: ReturnReason, sealed?: boolean) {
    const order = await findOrder(db, customerId, orderId);
    if (!order) return { error: `Pedido ${orderId} não encontrado para este cliente.` } as const;
    const item = order.items.find((i) => i.sku === sku) ?? (order.items.length === 1 ? order.items[0] : undefined);
    if (!item) return { error: `O item ${sku} não faz parte do pedido ${order.id}.` } as const;
    const decision = checkEligibility({ status: order.status, deliveredDaysAgo: order.deliveredDaysAgo, category: item.category }, reason, rules, sealed);
    return { order, item, reason, reasonLabel: REASON_LABEL[reason], decision } as const;
  }

  return {
    listOrders: tool({
      description: "Lista os pedidos do cliente desta conversa, do mais recente para o mais antigo.",
      inputSchema: z.object({}),
      execute: async () => ({ orders: await listOrders(db, customerId) }),
    }),

    getOrder: tool({
      description: "Mostra um pedido do cliente: status, datas, rastreio e itens.",
      inputSchema: z.object({ orderId: z.string().describe("Número do pedido, ex.: 1042") }),
      execute: async ({ orderId }) => {
        const order = await findOrder(db, customerId, orderId);
        return order ? { order } : { error: `Pedido ${orderId} não encontrado para este cliente.` };
      },
    }),

    checkReturnEligibility: tool({
      description:
        "Verifica, pela política da loja, se um item pode ser trocado ou devolvido. Use sempre antes de responder sobre troca ou devolução. " +
        "Para perfumes e cosméticos por arrependimento, informe sealed se o cliente já disse se está lacrado.",
      inputSchema: z.object({
        orderId: z.string(),
        sku: z.number().int().describe("sku do item, como aparece no pedido"),
        reason: reasonSchema,
        sealed: z.boolean().optional().describe("Se o produto está lacrado (só para beleza e perfumaria)"),
      }),
      execute: async ({ orderId, sku, reason, sealed }) => decide(orderId, sku, reason, sealed),
    }),

    openReturnRequest: tool({
      description: "Abre a solicitação de troca ou devolução e gera o protocolo. Use só depois que o cliente confirmar que quer seguir.",
      inputSchema: z.object({ orderId: z.string(), sku: z.number().int(), reason: reasonSchema, sealed: z.boolean().optional() }),
      execute: async ({ orderId, sku, reason, sealed }) => {
        // The decision is made again here: the model cannot open a request that the policy refuses.
        const result = await decide(orderId, sku, reason, sealed);
        if ("error" in result) return { ok: false as const, error: result.error };
        if (result.decision.eligible !== true) return { ok: false as const, error: "A política não permite esta solicitação." };

        const protocol = `VT-${result.order.id}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
        await db.query(
          "INSERT INTO tickets (protocol, visitor_id, customer_id, order_id, sku, reason, resolution) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [protocol, visitorId, customerId, result.order.id, result.item.sku, reason, result.decision.resolution],
        );
        // Episodic memory is written by the code, not by the model: a record of what happened, not an opinion.
        await addEpisode(db, visitorId, customerId, `Abriu ${result.reasonLabel} do pedido ${result.order.id} (${result.item.title}), protocolo ${protocol}.`);
        return { ok: true as const, protocol, order: result.order, item: result.item, reasonLabel: result.reasonLabel, resolution: result.decision.resolution };
      },
    }),

    saveCustomerFact: tool({
      description: "Guarda um fato duradouro sobre o cliente para as próximas conversas (ex.: 'usa tênis 41', 'prefere reembolso via Pix').",
      inputSchema: z.object({ fact: z.string().describe("O fato, em uma frase curta na terceira pessoa") }),
      execute: async ({ fact }) => saveFact(db, visitorId, customerId, fact),
    }),
  };
}

export type SupportTools = ReturnType<typeof createTools>;

/** Sent with each answer so the UI can show what the model received. */
export interface ContextMetadata {
  sections: ContextSection[];
  history: { messages: number; tokens: number; droppedMessages: number; prunedToolResults: number };
  totalTokens: number;
}

export type SupportUIMessage = UIMessage<{ context?: ContextMetadata }, never, InferUITools<SupportTools>>;
