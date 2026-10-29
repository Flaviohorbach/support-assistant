import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const POLICY_DIR = join(process.cwd(), "policies");

const RulesSchema = z.object({
  version: z.string(),
  regretDays: z.number(),
  exchangeDays: z.number(),
  defectDaysNonDurable: z.number(),
  defectDaysDurable: z.number(),
  damagedOnArrivalDays: z.number(),
  durableCategories: z.array(z.string()),
  sealedOnlyForRegretCategories: z.array(z.string()),
});
export type Rules = z.infer<typeof RulesSchema>;

export interface PolicySection {
  id: string;
  always: boolean;
  topics: string[];
  text: string;
}

/**
 * The policy lives in two files, edited by people, not developers:
 *  - politica-de-trocas.md: the text the assistant explains to the customer,
 *    split into sections marked with `<!-- section: id | topics: a, b -->`;
 *  - rules.json: the numbers the code uses to decide.
 */
export function parsePolicy(markdown: string): PolicySection[] {
  const parts = markdown.split(/<!--\s*section:\s*/).slice(1);
  return parts.map((part) => {
    const [header, ...body] = part.split("-->");
    const [id, ...flags] = header!.split("|").map((s) => s.trim());
    const topicsFlag = flags.find((f) => f.startsWith("topics:"));
    return {
      id: id!,
      always: flags.includes("always"),
      topics: topicsFlag ? topicsFlag.replace("topics:", "").split(",").map((t) => t.trim()) : [],
      text: body.join("-->").trim(),
    };
  });
}

let cache: { sections: PolicySection[]; rules: Rules } | null = null;

export function loadPolicy() {
  cache ??= {
    sections: parsePolicy(readFileSync(join(POLICY_DIR, "politica-de-trocas.md"), "utf8")),
    rules: RulesSchema.parse(JSON.parse(readFileSync(join(POLICY_DIR, "rules.json"), "utf8"))),
  };
  return cache;
}

export const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Picks the policy sections relevant to what the customer is talking about.
 * Sending only what matters saves tokens and, more importantly, keeps the
 * model from mixing up rules (the exchange window with the defect window).
 * When nothing matches, every section goes in: better spend tokens than miss a rule.
 */
export function selectSections(sections: PolicySection[], recentText: string): { selected: PolicySection[]; matchedTopics: string[] } {
  // Matching ignores case and accents ("devolucao" finds "devolução"); the topic keeps its spelling for display.
  const text = normalize(recentText);
  const matchedTopics = [...new Set(sections.flatMap((s) => s.topics.filter((t) => text.includes(normalize(t)))))];
  const topical = sections.filter((s) => !s.always && s.topics.some((t) => matchedTopics.includes(t)));
  const selected = topical.length > 0 ? sections.filter((s) => s.always || topical.includes(s)) : sections;
  return { selected, matchedTopics };
}

export type ReturnReason = "regret" | "exchange" | "defect" | "damaged_on_arrival";

export interface OrderForPolicy {
  status: "delivered" | "in_transit";
  deliveredDaysAgo: number | null;
  category: string;
}

export type Eligibility =
  | { eligible: true; rule: string; daysSinceDelivery: number; daysLeft: number; resolution: string }
  | { eligible: false; rule: string; reason: string; daysSinceDelivery?: number }
  | { eligible: "needs_info"; rule: string; question: string };

/**
 * The decision. Deterministic, testable, and identical for every customer:
 * the model calls it and explains the result, it never decides by itself.
 */
export function checkEligibility(order: OrderForPolicy, reason: ReturnReason, rules: Rules, sealed?: boolean): Eligibility {
  if (order.status !== "delivered" || order.deliveredDaysAgo === null) {
    return { eligible: false, rule: "entrega", reason: "O pedido ainda não foi entregue. Antes da entrega, o caminho é o cancelamento, não a troca ou devolução." };
  }
  const days = order.deliveredDaysAgo;
  const window = (limit: number, rule: string, resolution: string): Eligibility =>
    days <= limit
      ? { eligible: true, rule, daysSinceDelivery: days, daysLeft: limit - days, resolution }
      : { eligible: false, rule, daysSinceDelivery: days, reason: `O prazo é de ${limit} dias após a entrega e o pedido foi entregue há ${days} dias.` };

  switch (reason) {
    case "regret":
      if (rules.sealedOnlyForRegretCategories.includes(order.category)) {
        if (sealed === undefined) {
          return { eligible: "needs_info", rule: "arrependimento", question: "Este tipo de produto só pode ser devolvido por arrependimento se estiver lacrado. O produto ainda está lacrado?" };
        }
        if (!sealed) {
          return { eligible: false, rule: "arrependimento", daysSinceDelivery: days, reason: "Produtos de beleza e perfumaria abertos não podem ser devolvidos por arrependimento, por questões de higiene. Se houver defeito, a devolução é aceita." };
        }
      }
      return window(rules.regretDays, "arrependimento", "Reembolso integral, incluindo o frete, na forma de pagamento original.");
    case "exchange":
      return window(rules.exchangeDays, "troca", "Troca por outro tamanho, cor ou modelo, com frete grátis na primeira troca do pedido. Sem estoque, crédito na loja.");
    case "defect": {
      const durable = rules.durableCategories.includes(order.category);
      const limit = durable ? rules.defectDaysDurable : rules.defectDaysNonDurable;
      return window(limit, durable ? "defeito (produto durável)" : "defeito (produto não durável)", "Troca por um produto igual ou reembolso integral, à escolha do cliente.");
    }
    case "damaged_on_arrival":
      return window(rules.damagedOnArrivalDays, "avaria na entrega", "Troca ou reembolso integral, mediante foto da embalagem.");
  }
}
