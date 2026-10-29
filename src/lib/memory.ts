import type { Db } from "./db";
import { normalize } from "./policy";

/**
 * Two kinds of long-lived memory, both stored in Postgres:
 *  - facts: what the customer told us about themselves ("calça 42", "prefere Pix"),
 *    written by the model through the saveCustomerFact tool;
 *  - episodes: what happened in past conversations ("abriu troca do pedido 1042"),
 *    written by the code itself when a request is opened, never by the model.
 * Short-term memory is the conversation itself, trimmed in context.ts.
 */
export interface MemoryItem {
  id: number;
  kind: "fact" | "episode";
  content: string;
  createdAt: string;
}

export const MAX_FACTS = 15;

/** Data that must never be stored, even if the customer types it. */
const SENSITIVE = [
  { pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, label: "CPF" },
  { pattern: /\b(?:\d[ -]?){13,19}\b/, label: "número de cartão" },
  { pattern: /senha|password|cvv|c[oó]digo de seguran[cç]a/i, label: "senha ou código de segurança" },
];

/**
 * Memory poisoning: text that reads like an order to the assistant. Stored as
 * a "fact", it would come back in every future conversation, looking trusted.
 */
const INSTRUCTION_LIKE = /\b(ignore|ignorar|desconsidere|instru[cç][aã]o|regra|pol[ií]tica|sistema|system|prompt|sempre (aprove|aceite|autorize)|aprove|autorize|exce[cç][aã]o)\b/i;

export type SaveResult = { saved: true; content: string } | { saved: false; reason: string };

export function validateFact(content: string): SaveResult {
  const fact = content.trim().replace(/\s+/g, " ");
  if (fact.length < 3 || fact.length > 200) return { saved: false, reason: "O fato precisa ter entre 3 e 200 caracteres." };
  const sensitive = SENSITIVE.find(({ pattern }) => pattern.test(fact));
  if (sensitive) return { saved: false, reason: `Não guardamos ${sensitive.label} na memória.` };
  if (INSTRUCTION_LIKE.test(fact)) return { saved: false, reason: "A memória guarda fatos sobre o cliente, não instruções ou pedidos de exceção." };
  return { saved: true, content: fact };
}

export async function listMemories(db: Db, visitorId: string, customerId: string) {
  const rows = await db.query<{ id: number; kind: "fact" | "episode"; content: string; created_at: string | Date }>(
    "SELECT id, kind, content, created_at FROM memories WHERE visitor_id = $1 AND customer_id = $2 ORDER BY created_at DESC, id DESC",
    [visitorId, customerId],
  );
  const items: MemoryItem[] = rows.map((r) => ({ id: r.id, kind: r.kind, content: r.content, createdAt: new Date(r.created_at).toISOString() }));
  return { facts: items.filter((m) => m.kind === "fact"), episodes: items.filter((m) => m.kind === "episode") };
}

export async function saveFact(db: Db, visitorId: string, customerId: string, content: string): Promise<SaveResult> {
  const result = validateFact(content);
  if (!result.saved) return result;

  const { facts } = await listMemories(db, visitorId, customerId);
  if (facts.some((f) => normalize(f.content) === normalize(result.content))) return result; // already known

  await db.query("INSERT INTO memories (visitor_id, customer_id, kind, content) VALUES ($1, $2, 'fact', $3)", [visitorId, customerId, result.content]);
  // Bounded memory: past the limit, the oldest fact is forgotten.
  await db.query(
    `DELETE FROM memories WHERE id IN (
       SELECT id FROM memories WHERE visitor_id = $1 AND customer_id = $2 AND kind = 'fact'
       ORDER BY created_at DESC, id DESC OFFSET $3)`,
    [visitorId, customerId, MAX_FACTS],
  );
  return result;
}

export async function addEpisode(db: Db, visitorId: string, customerId: string, content: string) {
  await db.query("INSERT INTO memories (visitor_id, customer_id, kind, content) VALUES ($1, $2, 'episode', $3)", [visitorId, customerId, content]);
}

/** "Esquecer meus dados": the right to deletion, one button away. */
export async function forgetCustomer(db: Db, visitorId: string, customerId: string) {
  await db.query("DELETE FROM memories WHERE visitor_id = $1 AND customer_id = $2", [visitorId, customerId]);
}
