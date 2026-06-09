import { describe, expect, it } from "vitest";

import { analyzeFinancialReport } from "@/lib/report-analysis";

const MPESA_STATEMENT_SAMPLE = `UF71J74Z7F 2026-06-07 19:12:23 Customer Transfer to -
07******316 Andrew Nyaga
Completed -150.00 8,260.13
UF71J74MPT 2026-06-07 18:17:26 Recharge for Customer to
4093441SAFARICOM DATA
BUNDLES by - 2547******412
Daniel Mwihoti
Completed -20.00 8,410.13
UF71J74O3H 2026-06-07 18:12:33 Merchant Payment to 3689959 -
VIBES LOUNGE
Completed -70.00 8,430.13
UF71J73IEG 2026-06-07 13:38:32 Pay Bill Online to 222222 - ECITIZEN Acc. XZLPLEYN
Completed -121.00 9,325.13`;

describe("analyzeFinancialReport", () => {
  it("groups wrapped M-Pesa statement rows into real transactions", () => {
    const report = analyzeFinancialReport({
      title: "M-Pesa statement",
      text: MPESA_STATEMENT_SAMPLE,
    });

    expect(report.rows).toHaveLength(4);
    expect(report.extracted.totalExpenses).toBe(361);

    const transfer = report.rows.find((row) => row.reference === "UF71J74Z7F");
    expect(transfer).toMatchObject({
      entity: "Andrew Nyaga",
      amount: 150,
      direction: "OUT",
      transactionType: "SEND_MONEY",
      counterpartyAccount: "07******316",
      balance: 8260.13,
    });

    const merchant = report.rows.find((row) => row.reference === "UF71J74O3H");
    expect(merchant).toMatchObject({
      entity: "Vibes Lounge",
      amount: 70,
      transactionType: "TILL_PAYMENT",
      counterpartyAccount: "3689959",
    });

    const paybill = report.rows.find((row) => row.reference === "UF71J73IEG");
    expect(paybill).toMatchObject({
      entity: "Ecitizen",
      amount: 121,
      transactionType: "PAYBILL",
      counterpartyAccount: "222222",
    });
  });
});
