import { format } from "date-fns";

type ParsedLine = {
  raw: string;
  amount: number;
  direction: "IN" | "OUT" | "UNKNOWN";
  date: Date | null;
  entity: string | null;
  reference?: string | null;
  transactionType?: string | null;
  balance?: number | null;
  counterpartyAccount?: string | null;
  confidence?: number;
};

export type FinancialReportAnalysis = {
  extracted: {
    title: string;
    currency: string;
    periodStart: string | null;
    periodEnd: string | null;
    transactionCount: number;
    totalIncome: number;
    totalExpenses: number;
    netCashflow: number;
    largestAmount: number;
    averageAmount: number;
    recurringEntities: Array<{ name: string; count: number; total: number }>;
  };
  analysis: {
    financialHealthScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    summary: string;
    executiveSummary: string;
    findings: string[];
    recommendations: string[];
  };
  visuals: {
    headline: string;
    cashflowBars: Array<{ label: string; value: number; tone: "income" | "expense" | "net" }>;
    riskGauge: { score: number; label: string };
    visualNotes: string[];
  };
  intelligence: {
    provider: "local" | "openrouter";
    model: string;
  };
  rows: ParsedLine[];
};

const CURRENCY_RE = /\b(KES|KSH|Ksh|USD|EUR|GBP)\b/;
const AMOUNT_RE =
  /(?:KES|KSH|Ksh|\$)?\s*([+-]?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|[+-]?\d+(?:\.\d{1,2})?)/g;
const DATE_RE =
  /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i;
const MPESA_RECORD_RE = /^([A-Z0-9]{10})\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(.+)/;
const MPESA_AMOUNT_RE = /\bCompleted\s+([+-]?\d[\d,]*\.\d{2})\s+([\d,]+\.\d{2})\b/i;

function parseAmount(value: string) {
  const cleaned = value.replace(/,/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function parseSignedAmount(value: string) {
  const cleaned = value.replace(/,/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: string) {
  const match = DATE_RE.exec(value);
  if (!match?.[1]) return null;
  const parsed = new Date(match[1]);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function titleCase(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanMpesaEntity(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value
    .replace(/\bCompleted\b.*$/i, "")
    .replace(/\bAcc\.\s*[\w-]+$/i, "")
    .replace(/\s+-\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? titleCase(cleaned) : null;
}

function inferMpesaType(raw: string) {
  if (/Pay Bill Charge/i.test(raw)) return "PAYBILL_CHARGE";
  if (/Withdrawal Charge/i.test(raw)) return "WITHDRAWAL_CHARGE";
  if (/Charge Completed/i.test(raw)) return "CHARGE";
  if (/Pay Bill Online/i.test(raw)) return "PAYBILL";
  if (/Merchant Payment/i.test(raw)) return "TILL_PAYMENT";
  if (/Customer Payment to Small Business/i.test(raw)) return "SMALL_BUSINESS_PAYMENT";
  if (/Customer Transfer/i.test(raw)) return "SEND_MONEY";
  if (/Customer Withdrawal At Agent/i.test(raw)) return "AGENT_WITHDRAWAL";
  if (/Airtime Purchase/i.test(raw)) return "AIRTIME";
  if (/Recharge for Customer/i.test(raw)) return "DATA_OR_AIRTIME";
  if (/KCB M-PESA Loan/i.test(raw)) return "LOAN";
  if (/\bReceived\b|\bFunds received\b/i.test(raw)) return "RECEIVED_MONEY";
  return "MPESA_TRANSACTION";
}

function inferMpesaEntity(raw: string) {
  const paybill = /Pay Bill Online to\s+(\d+)\s*-\s*(.+?)(?:\s+Acc\.|\s+Completed)/i.exec(raw);
  if (paybill) {
    return {
      entity: cleanMpesaEntity(paybill[2]) ?? `Paybill ${paybill[1]}`,
      account: paybill[1] ?? null,
    };
  }

  const merchant = /Merchant Payment(?: Online)? to\s+(\d+)\s*-\s*(.+?)\s+Completed/i.exec(raw);
  if (merchant) {
    return {
      entity: cleanMpesaEntity(merchant[2]) ?? `Till ${merchant[1]}`,
      account: merchant[1] ?? null,
    };
  }

  const smallBusiness =
    /Customer Payment to Small\s+Business to\s+-\s+(\S+)\s+(.+?)\s+Completed/i.exec(raw);
  if (smallBusiness) {
    return {
      entity: cleanMpesaEntity(smallBusiness[2]) ?? "Small Business",
      account: smallBusiness[1] ?? null,
    };
  }

  const transfer = /Customer Transfer(?: of Funds| to\s+-)?\s+(.+?)\s+Completed/i.exec(raw);
  if (transfer) {
    const value = transfer[1]?.trim() ?? "";
    const nameAfterPhone = /(?:\+?254|0)?7\*+\d+\s+(.+)/i.exec(value);
    return {
      entity: cleanMpesaEntity(nameAfterPhone?.[1] ?? value) ?? "Send Money",
      account: /(?:\+?254|0)?7\*+\d+/i.exec(value)?.[0] ?? null,
    };
  }

  const withdrawal = /Customer Withdrawal At Agent\s+Till\s+(\d+)\s*-\s*(.+?)\s+Completed/i.exec(
    raw,
  );
  if (withdrawal) {
    return {
      entity: cleanMpesaEntity(withdrawal[2]) ?? `Agent Till ${withdrawal[1]}`,
      account: withdrawal[1] ?? null,
    };
  }

  const recharge = /Recharge for Customer to\s+(.+?)\s+by\s+-\s+(.+?)\s+Completed/i.exec(raw);
  if (recharge) {
    return {
      entity: cleanMpesaEntity(recharge[1]) ?? "Safaricom Recharge",
      account: recharge[2]?.trim() ?? null,
    };
  }

  if (/Airtime Purchase/i.test(raw)) return { entity: "Safaricom Airtime", account: null };
  if (/Pay Bill Charge/i.test(raw)) return { entity: "Paybill Charge", account: null };
  if (/Withdrawal Charge/i.test(raw)) return { entity: "Withdrawal Charge", account: null };
  if (/\bCharge Completed/i.test(raw)) return { entity: "M-Pesa Charge", account: null };

  const beforeCompleted = /^(.+?)\s+Completed\b/i.exec(raw);
  return {
    entity: cleanMpesaEntity(beforeCompleted?.[1] ?? raw),
    account: null,
  };
}

function extractMpesaStatementRows(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (MPESA_RECORD_RE.test(line)) {
      if (current.length) blocks.push(current.join(" "));
      current = [line];
      continue;
    }

    if (current.length) {
      current.push(line);
    }
  }

  if (current.length) blocks.push(current.join(" "));

  return blocks
    .map((block): ParsedLine | null => {
      const record = MPESA_RECORD_RE.exec(block);
      const amounts = MPESA_AMOUNT_RE.exec(block);
      if (!record || !amounts) return null;

      const signedAmount = parseSignedAmount(amounts[1] ?? "0");
      const amount = Math.abs(signedAmount);
      const balance = parseAmount(amounts[2] ?? "");
      if (!amount) return null;

      const rawDate = `${record[2]}T${record[3]}+03:00`;
      const date = new Date(rawDate);
      const { entity, account } = inferMpesaEntity(block);

      return {
        raw: block,
        amount,
        direction: signedAmount > 0 ? ("IN" as const) : ("OUT" as const),
        date: Number.isFinite(date.getTime()) ? date : null,
        entity,
        reference: record[1] ?? null,
        transactionType: inferMpesaType(block),
        balance,
        counterpartyAccount: account,
        confidence: entity && entity !== "Completed" ? 0.94 : 0.72,
      } satisfies ParsedLine;
    })
    .filter((row): row is ParsedLine => Boolean(row));
}

function inferDirection(line: string) {
  const normalized = line.toLowerCase();
  if (
    /\b(credit|deposit|received|salary|income|inflow|paid in|receipt|revenue)\b/.test(normalized)
  ) {
    return "IN" as const;
  }
  if (
    /\b(debit|withdrawal|paid|payment|sent|purchase|expense|charge|fee|outflow)\b/.test(normalized)
  ) {
    return "OUT" as const;
  }
  return "UNKNOWN" as const;
}

function inferEntity(line: string) {
  const withoutDate = line.replace(DATE_RE, " ");
  const withoutAmounts = withoutDate.replace(AMOUNT_RE, " ");
  const words = withoutAmounts
    .replace(/[|,;:()[\]{}]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 && !/^(debit|credit|paid|sent|from|with|balance|amount)$/i.test(word),
    );

  if (!words.length) return null;
  return words.slice(0, 4).join(" ");
}

function extractRows(text: string) {
  const mpesaRows = extractMpesaStatementRows(text);
  if (mpesaRows.length >= 3) return mpesaRows;

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ParsedLine | null => {
      const amounts = [...line.matchAll(AMOUNT_RE)]
        .map((match) => parseAmount(match[1] ?? ""))
        .filter((amount) => amount > 0);
      const amount = amounts.at(-1) ?? 0;
      if (!amount) return null;

      return {
        raw: line,
        amount,
        direction: inferDirection(line),
        date: parseDate(line),
        entity: inferEntity(line),
        reference: null,
        transactionType: null,
        balance: null,
        counterpartyAccount: null,
        confidence: 0.55,
      } satisfies ParsedLine;
    })
    .filter((row): row is ParsedLine => Boolean(row));
}

function buildRecurringEntities(rows: ParsedLine[]) {
  const buckets = new Map<string, { name: string; count: number; total: number }>();

  for (const row of rows) {
    if (!row.entity) continue;
    const key = row.entity.toLowerCase();
    const existing = buckets.get(key) ?? { name: row.entity, count: 0, total: 0 };
    existing.count += 1;
    existing.total += row.amount;
    buckets.set(key, existing);
  }

  return [...buckets.values()]
    .filter((entity) => entity.count > 1)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

function scoreReport(totalIncome: number, totalExpenses: number, riskSignals: number) {
  const savingsRate =
    totalIncome > 0 ? Math.max(0, (totalIncome - totalExpenses) / totalIncome) : 0;
  return Math.max(30, Math.min(95, Math.round(55 + savingsRate * 30 - riskSignals * 7)));
}

function buildVisuals(input: {
  currency: string;
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recurringEntities: Array<{ name: string; count: number; total: number }>;
}) {
  const recurringNote = input.recurringEntities[0]
    ? `${input.recurringEntities[0].name} is the largest recurring signal.`
    : "No strong recurring entity was detected.";

  return {
    headline:
      input.netCashflow >= 0
        ? `Positive ${input.currency} cashflow with controlled risk`
        : `Negative ${input.currency} cashflow needs attention`,
    cashflowBars: [
      { label: "Income", value: input.totalIncome, tone: "income" as const },
      { label: "Expenses", value: input.totalExpenses, tone: "expense" as const },
      { label: "Net", value: input.netCashflow, tone: "net" as const },
    ],
    riskGauge: { score: input.score, label: input.riskLevel },
    visualNotes: [
      recurringNote,
      "Largest line-item movement should be reviewed against normal monthly behavior.",
      "Score uses extracted cashflow balance, ambiguity, and concentration risk.",
    ],
  };
}

export function analyzeFinancialReport(input: { title?: string; text: string }) {
  const rows = extractRows(input.text);
  const datedRows = rows.filter((row) => row.date);
  const sortedDates = datedRows
    .map((row) => row.date as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  const totalIncome = rows
    .filter((row) => row.direction === "IN")
    .reduce((sum, row) => sum + row.amount, 0);
  const totalExpenses = rows
    .filter((row) => row.direction === "OUT")
    .reduce((sum, row) => sum + row.amount, 0);
  const unknownTotal = rows
    .filter((row) => row.direction === "UNKNOWN")
    .reduce((sum, row) => sum + row.amount, 0);
  const netCashflow = totalIncome - totalExpenses;
  const largestAmount = Math.max(0, ...rows.map((row) => row.amount));
  const averageAmount =
    rows.length > 0 ? rows.reduce((sum, row) => sum + row.amount, 0) / rows.length : 0;
  const recurringEntities = buildRecurringEntities(rows);
  const riskSignals = [
    totalExpenses > totalIncome && totalIncome > 0,
    unknownTotal > totalIncome + totalExpenses,
    recurringEntities.some((entity) => entity.total > Math.max(totalIncome, totalExpenses) * 0.35),
    largestAmount > averageAmount * 5 && rows.length > 3,
  ].filter(Boolean).length;
  const score = scoreReport(totalIncome, totalExpenses, riskSignals);
  const riskLevel = score < 55 ? "HIGH" : score < 72 ? "MEDIUM" : "LOW";
  const currency = CURRENCY_RE.exec(input.text)?.[1]?.toUpperCase().replace("KSH", "KES") ?? "KES";

  const findings = [
    rows.length
      ? `Extracted ${rows.length} financial line items from the report.`
      : "No transaction-like line items were detected.",
    `Detected ${currency} ${Math.round(totalIncome).toLocaleString()} in income-like entries and ${currency} ${Math.round(totalExpenses).toLocaleString()} in expense-like entries.`,
    netCashflow >= 0
      ? `The report shows a positive net cashflow of ${currency} ${Math.round(netCashflow).toLocaleString()}.`
      : `The report shows a negative net cashflow of ${currency} ${Math.round(Math.abs(netCashflow)).toLocaleString()}.`,
  ];

  if (unknownTotal > 0) {
    findings.push(
      `${currency} ${Math.round(unknownTotal).toLocaleString()} could not be confidently classified as income or expense.`,
    );
  }

  const recommendations = [
    totalExpenses > totalIncome && totalIncome > 0
      ? "Reduce the largest recurring outflow first because expenses exceed income in this report."
      : "Keep the current cashflow spread visible and monitor recurring entities month over month.",
    recurringEntities[0]
      ? `Review ${recurringEntities[0].name}; it appears ${recurringEntities[0].count} times and totals ${currency} ${Math.round(recurringEntities[0].total).toLocaleString()}.`
      : "Add more dated statement lines to improve recurring merchant detection.",
    unknownTotal > 0
      ? "Reformat ambiguous rows with labels such as debit, credit, paid, received, or salary to improve extraction confidence."
      : "Use this extracted report as evidence in the copilot or monthly report workflow.",
  ];

  return {
    extracted: {
      title: input.title?.trim() || "Financial report",
      currency,
      periodStart: sortedDates[0] ? format(sortedDates[0], "yyyy-MM-dd") : null,
      periodEnd: sortedDates.at(-1) ? format(sortedDates.at(-1) as Date, "yyyy-MM-dd") : null,
      transactionCount: rows.length,
      totalIncome,
      totalExpenses,
      netCashflow,
      largestAmount,
      averageAmount,
      recurringEntities,
    },
    analysis: {
      financialHealthScore: score,
      riskLevel,
      summary:
        rows.length > 0
          ? `This report indicates ${riskLevel.toLowerCase()} financial risk with a ${score}/100 health score.`
          : "There was not enough financial detail to generate a reliable report analysis.",
      executiveSummary:
        rows.length > 0
          ? `The extracted report shows ${currency} ${Math.round(totalIncome).toLocaleString()} in income, ${currency} ${Math.round(totalExpenses).toLocaleString()} in expenses, and net cashflow of ${currency} ${Math.round(netCashflow).toLocaleString()}.`
          : "The report did not contain enough transaction-like rows for a reliable summary.",
      findings,
      recommendations,
    },
    visuals: buildVisuals({
      currency,
      totalIncome,
      totalExpenses,
      netCashflow,
      score,
      riskLevel,
      recurringEntities,
    }),
    intelligence: {
      provider: "local",
      model: "report-analysis-v1",
    },
    rows,
  } satisfies FinancialReportAnalysis;
}
