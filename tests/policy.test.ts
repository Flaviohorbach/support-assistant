import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkEligibility, loadPolicy, parsePolicy, selectSections } from "@/lib/policy";

const { rules, sections } = loadPolicy();
const delivered = (days: number, category = "mens-shoes") => ({ status: "delivered" as const, deliveredDaysAgo: days, category });

describe("checkEligibility", () => {
  it("accepts regret inside 7 days and refuses after, with the reason", () => {
    expect(checkEligibility(delivered(7), "regret", rules)).toMatchObject({ eligible: true, daysLeft: 0 });
    const late = checkEligibility(delivered(8), "regret", rules);
    expect(late).toMatchObject({ eligible: false, rule: "arrependimento" });
    if (late.eligible === false) expect(late.reason).toContain("7 dias");
  });

  it("uses the 30-day window for exchanges", () => {
    expect(checkEligibility(delivered(30), "exchange", rules).eligible).toBe(true);
    expect(checkEligibility(delivered(45), "exchange", rules).eligible).toBe(false);
  });

  it("gives durable products 90 days for defects and the rest 30 (CDC art. 26)", () => {
    expect(checkEligibility(delivered(60, "laptops"), "defect", rules)).toMatchObject({ eligible: true, rule: "defeito (produto durável)" });
    expect(checkEligibility(delivered(60, "tops"), "defect", rules)).toMatchObject({ eligible: false, rule: "defeito (produto não durável)" });
  });

  it("asks whether a perfume is sealed before deciding a regret return", () => {
    expect(checkEligibility(delivered(2, "fragrances"), "regret", rules).eligible).toBe("needs_info");
    expect(checkEligibility(delivered(2, "fragrances"), "regret", rules, true).eligible).toBe(true);
    expect(checkEligibility(delivered(2, "fragrances"), "regret", rules, false).eligible).toBe(false);
    // A defect does not depend on the seal.
    expect(checkEligibility(delivered(2, "fragrances"), "defect", rules).eligible).toBe(true);
  });

  it("refuses returns for orders not delivered yet, pointing to cancellation", () => {
    const result = checkEligibility({ status: "in_transit", deliveredDaysAgo: null, category: "laptops" }, "regret", rules);
    expect(result.eligible).toBe(false);
    if (result.eligible === false) expect(result.reason).toContain("cancelamento");
  });
});

describe("policy sections", () => {
  it("parses every section of the policy file with its topics", () => {
    expect(sections.map((s) => s.id)).toEqual(["base", "arrependimento", "troca", "defeito", "entrega"]);
    expect(sections.find((s) => s.id === "base")?.always).toBe(true);
    expect(sections.find((s) => s.id === "defeito")?.topics).toContain("quebrou");
  });

  it("sends only the sections the customer is talking about, plus the base", () => {
    const { selected, matchedTopics } = selectSections(sections, "Meu notebook QUEBROU, não liga mais");
    expect(selected.map((s) => s.id)).toEqual(["base", "defeito"]);
    expect(matchedTopics).toContain("quebrou");
  });

  it("sends the whole policy when no topic is detected", () => {
    expect(selectSections(sections, "Oi, tudo bem?").selected).toHaveLength(sections.length);
  });

  it("keeps the markdown file and the parser in sync", () => {
    const raw = readFileSync("policies/politica-de-trocas.md", "utf8");
    expect(parsePolicy(raw).length).toBe((raw.match(/<!--\s*section:/g) ?? []).length);
  });
});
