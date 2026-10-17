import { describe, expect, it } from "vitest";
import { normalizePhoneContact } from "../client/src/lib/contact-format";

describe("normalizePhoneContact", () => {
  it("normalizes local Brazilian numbers with common separators", () => {
    expect(normalizePhoneContact("(11) 99999-0000")).toBe("11999990000");
  });

  it("preserves one leading plus for international numbers", () => {
    expect(normalizePhoneContact("+55 (11) 99999-0000")).toBe("+5511999990000");
  });

  it("rejects free text and extensions rather than treating them as a phone", () => {
    expect(normalizePhoneContact("Ramal 12345678")).toBeNull();
    expect(normalizePhoneContact("11999990000 ramal 123")).toBeNull();
  });

  it("rejects invalid lengths and misplaced plus signs", () => {
    expect(normalizePhoneContact("1234567")).toBeNull();
    expect(normalizePhoneContact("+55+11999990000")).toBeNull();
  });
});
