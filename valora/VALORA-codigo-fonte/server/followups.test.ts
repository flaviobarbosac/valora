import { describe, expect, it } from "vitest";
import type { ClientRecord } from "../client/src/lib/client-types";
import { addDaysISO, needsCallReminder, outcomeOf } from "../client/src/lib/followups";

const record = (overrides: Partial<ClientRecord> = {}): ClientRecord => ({
  id: 1, reference: "VLR-1", name: "Fulano de Tal", contact: null, contactDate: "2026-10-10",
  saleStatus: "pending", lastProductSold: null, objection: null, objectionNotes: null,
  stage: "new", followUpDate: null, remindAfter: null, productId: null, customerId: null, customFields: {},
  createdAt: "", updatedAt: "", ownerName: "Eu", isMine: true, canEdit: true, canReview: false, lastRating: null, noteCount: 0,
  ...overrides,
});

describe("blocos de Atendimentos", () => {
  it("classifies each client", () => {
    expect(outcomeOf(record())).toBe("waiting");
    expect(outcomeOf(record({ saleStatus: "sold" }))).toBe("success");
    expect(outcomeOf(record({ saleStatus: "not_sold", objection: "rate" }))).toBe("failed");
    expect(outcomeOf(record({ saleStatus: "not_sold", objection: "thinking" }))).toBe("callback");
    expect(outcomeOf(record({ objection: "later" }))).toBe("callback");
    expect(outcomeOf(record({ saleStatus: "sold", objection: "thinking" }))).toBe("success");
  });
});

describe("lembrete de 3 dias", () => {
  it("reminds 3 days after the last contact when no call is scheduled", () => {
    expect(needsCallReminder(record(), "2026-10-12")).toBe(false);
    expect(needsCallReminder(record(), "2026-10-13")).toBe(true);
    expect(needsCallReminder(record({ objection: "thinking", saleStatus: "not_sold" }), "2026-10-20")).toBe(true);
  });

  it("stays quiet when a call is scheduled, the deal is closed, the client is someone else's, or it was snoozed", () => {
    expect(needsCallReminder(record({ followUpDate: "2026-10-30" }), "2026-10-20")).toBe(false);
    expect(needsCallReminder(record({ saleStatus: "sold" }), "2026-10-20")).toBe(false);
    expect(needsCallReminder(record({ saleStatus: "not_sold", objection: "no_interest" }), "2026-10-20")).toBe(false);
    expect(needsCallReminder(record({ isMine: false }), "2026-10-20")).toBe(false);
    expect(needsCallReminder(record({ remindAfter: "2026-10-16" }), "2026-10-15")).toBe(false);
    expect(needsCallReminder(record({ remindAfter: "2026-10-16" }), "2026-10-16")).toBe(true);
  });

  it("adds days across month boundaries", () => {
    expect(addDaysISO("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("lembrete configurável", () => {
  it("uses the workspace's days and the product's callback reasons", () => {
    expect(needsCallReminder(record(), "2026-10-14", 5)).toBe(false);
    expect(needsCallReminder(record(), "2026-10-15", 5)).toBe(true);
    expect(needsCallReminder(record(), "2026-12-31", 0)).toBe(false);
    const custom = (key: string) => key === "sem_verba_agora";
    expect(outcomeOf(record({ saleStatus: "not_sold", objection: "sem_verba_agora" }), custom)).toBe("callback");
    expect(outcomeOf(record({ saleStatus: "not_sold", objection: "thinking" }), custom)).toBe("failed");
  });
});
