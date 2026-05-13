import { describe, expect, it } from "vitest";

import { parseSms, splitMessages } from "./index";

describe("splitMessages", () => {
  it("splits multi-message pastes on blank lines", () => {
    const input = `RXT123ABC1 Confirmed. Ksh 2,400.00 paid to QUICKMART KAREN. on 11/5/26 at 7:10 PM. New M-PESA balance is Ksh 54,000.00.

RXT123ABC2 Confirmed. Ksh 1,250.00 paid to UBER TRIPS. on 12/5/26 at 9:05 PM. New M-PESA balance is Ksh 52,750.00.`;

    expect(splitMessages(input)).toHaveLength(2);
  });
});

describe("parseSms", () => {
  it("parses an incoming deposit", () => {
    const outcome = parseSms(
      "QAA11BB35R Confirmed. You have deposited Ksh 4,850.00 to your M-PESA account on 1/5/26 at 8:08 AM. New M-PESA balance is Ksh 79,100.00.",
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.tx.direction).toBe("IN");
    expect(outcome.tx.amount).toBe(4850);
    expect(outcome.tx.type).toBe("DEPOSIT");
  });

  it("parses an outgoing utility paybill", () => {
    const outcome = parseSms(
      "QAA11BB39V Confirmed. Ksh 2,400.00 sent to KPLC PREPAID for account 771245 on 5/5/26 at 9:30 AM. New M-PESA balance is Ksh 60,150.00. Transaction cost, Ksh 0.00.",
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.tx.type).toBe("PAYBILL");
    expect(outcome.tx.direction).toBe("OUT");
    expect(outcome.tx.merchant).toContain("KPLC PREPAID");
  });
});
