import { describe, expect, it } from "vitest";
import { buildContext, estimateTokens, fitToBudget, trimHistory } from "@/lib/context";
import type { MemoryItem } from "@/lib/memory";
import { loadPolicy } from "@/lib/policy";

const fact = (id: number, content: string): MemoryItem => ({ id, kind: "fact", content, createdAt: "2026-10-20T12:00:00.000Z" });

describe("fitToBudget", () => {
  it("keeps the newest items that fit and counts the rest as dropped", () => {
    const items = [fact(3, "a".repeat(400)), fact(2, "b".repeat(400)), fact(1, "c".repeat(400))];
    const { kept, dropped } = fitToBudget(items, 250);
    expect(kept.map((i) => i.id)).toEqual([3, 2]);
    expect(dropped).toBe(1);
  });
});

describe("buildContext", () => {
  const { sections } = loadPolicy();
  const context = buildContext({
    customer: { id: "ana", name: "Ana Souza", city: "Porto Alegre" },
    facts: [fact(1, "Usa tênis 37")],
    episodes: [],
    policySections: sections.slice(0, 2),
    matchedTopics: ["devolver"],
    today: new Date("2026-10-29T12:00:00Z"),
  });

  it("puts each part inside its own labelled tag", () => {
    for (const tag of ["papel", "politica_da_loja", "cliente", "memoria_do_cliente", "historico_de_atendimentos"]) {
      expect(context.system).toContain(`<${tag}>`);
    }
    expect(context.system).toContain("Usa tênis 37");
    expect(context.system).toContain("29 de outubro de 2026");
  });

  it("orders stable content first, so the cacheable prefix stays the same between customers", () => {
    // Block openings sit on their own line; the role text also mentions some tag names inline.
    const block = (tag: string) => context.system.search(new RegExp(`(^|\\n)<${tag}>\\n`));
    expect(block("papel")).toBeLessThan(block("cliente"));
    expect(block("politica_da_loja")).toBeLessThan(block("memoria_do_cliente"));
    expect(block("memoria_do_cliente")).toBeGreaterThan(0);
  });

  it("describes every section with its token estimate for the inspector", () => {
    expect(context.sections.map((s) => s.id)).toEqual(["role", "policy", "customer", "facts", "episodes"]);
    for (const s of context.sections) expect(s.tokens).toBe(estimateTokens(s.content));
  });
});

describe("trimHistory", () => {
  const msg = (role: string, ...types: string[]) => ({ role, parts: types.map((type) => ({ type })) });

  it("keeps only the last turns and strips tool results from older assistant turns", () => {
    const messages = [
      msg("user", "text"),
      msg("assistant", "tool-getOrder", "text"),
      msg("user", "text"),
      msg("assistant", "tool-getOrder"),
      msg("user", "text"),
      msg("assistant", "tool-listOrders", "text"),
    ];
    const result = trimHistory(messages, { keep: 5, fullDetail: 2 });
    expect(result.droppedMessages).toBe(1);
    // The assistant turn made only of a tool call disappears; the recent one keeps its tool part.
    expect(result.messages.map((m) => m.parts.map((p) => p.type).join("+"))).toEqual(["text", "text", "text", "tool-listOrders+text"]);
    expect(result.prunedToolResults).toBe(2);
  });
});
