import {
  type AIInsight,
  AgentName,
  FraudStatus,
  InsightKind,
  InsightSeverity,
  type Prisma,
  ReportPeriod,
  TransactionDirection,
  TransactionType,
} from "@prisma/client";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";

import { prisma } from "@/lib/db";

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { category: true; account: true; alerts: true };
}>;

type AlertSeed = {
  transactionId: string;
  rule: string;
  score: number;
  explanation: string;
};

type InsightSeed = {
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  body: string;
  evidenceTxIds: string[];
  generatedBy: AgentName;
  modelId: string;
  metadata?: Prisma.InputJsonValue;
};

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function signedAmount(tx: Pick<TransactionWithRelations, "amount" | "direction">) {
  const amount = toNumber(tx.amount);
  return tx.direction === TransactionDirection.IN ? amount : amount * -1;
}

function withinRange(date: Date, start: Date, end: Date) {
  return !isBefore(date, start) && !isAfter(date, end);
}

function titleCase(input: string | null | undefined) {
  if (!input) return "Unknown";
  return input
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function categorizeTransaction(input: {
  merchant?: string | null;
  counterpartyName?: string | null;
  type: TransactionType;
  direction: TransactionDirection;
  rawText?: string | null;
}) {
  const haystack = [input.merchant, input.counterpartyName, input.rawText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (input.direction === TransactionDirection.IN) {
    if (haystack.includes("salary") || haystack.includes("payroll")) return "salary";
    if (input.type === TransactionType.LOAN) return "loans";
    return "other-income";
  }

  if (input.type === TransactionType.AIRTIME) return "airtime";
  if (input.type === TransactionType.LOAN) return "loans";
  if (input.type === TransactionType.FEE) return "fees";
  if (
    haystack.includes("naivas") ||
    haystack.includes("quickmart") ||
    haystack.includes("carrefour")
  )
    return "food";
  if (
    haystack.includes("kplc") ||
    haystack.includes("tokens") ||
    haystack.includes("zuku") ||
    haystack.includes("safaricom home")
  )
    return "utilities";
  if (
    haystack.includes("uber") ||
    haystack.includes("bolt") ||
    haystack.includes("matatu") ||
    haystack.includes("fuel")
  )
    return "transport";
  if (haystack.includes("landlord") || haystack.includes("rent")) return "rent";
  if (haystack.includes("odibets") || haystack.includes("betika") || haystack.includes("sportpesa"))
    return "betting";
  if (haystack.includes("cinema") || haystack.includes("showmax") || haystack.includes("netflix"))
    return "entertainment";
  if (
    haystack.includes("mom") ||
    haystack.includes("dad") ||
    haystack.includes("family") ||
    haystack.includes("school fees")
  )
    return "family";
  if (haystack.includes("chama") || haystack.includes("sacco") || haystack.includes("money market"))
    return "savings";
  if (
    haystack.includes("office") ||
    haystack.includes("inventory") ||
    haystack.includes("supplier")
  )
    return "business";
  if (input.type === TransactionType.PAYBILL || input.type === TransactionType.TILL)
    return "shopping";
  if (input.type === TransactionType.WITHDRAWAL || input.type === TransactionType.TRANSFER)
    return "family";
  return "other";
}

function monthTransactions(transactions: TransactionWithRelations[], now = new Date()) {
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  return transactions.filter((tx) => withinRange(tx.occurredAt, start, end));
}

function previousMonthTransactions(transactions: TransactionWithRelations[], now = new Date()) {
  const lastMonth = subMonths(now, 1);
  const start = startOfMonth(lastMonth);
  const end = endOfMonth(lastMonth);
  return transactions.filter((tx) => withinRange(tx.occurredAt, start, end));
}

function buildWeeklySeries(transactions: TransactionWithRelations[], now = new Date()) {
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const pivot = subDays(now, (7 - index) * 7);
    const start = startOfWeek(pivot, { weekStartsOn: 1 });
    const end = endOfWeek(pivot, { weekStartsOn: 1 });
    const window = transactions.filter((tx) => withinRange(tx.occurredAt, start, end));
    const income = window
      .filter((tx) => tx.direction === TransactionDirection.IN)
      .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    const expenses = window
      .filter((tx) => tx.direction === TransactionDirection.OUT)
      .reduce((sum, tx) => sum + toNumber(tx.amount) + toNumber(tx.fee), 0);

    return {
      label: format(start, "dd MMM"),
      income,
      expenses,
      net: income - expenses,
    };
  });

  return weeks;
}

function buildMonthlySeries(transactions: TransactionWithRelations[], now = new Date()) {
  return Array.from({ length: 6 }, (_, index) => {
    const pivot = subMonths(now, 5 - index);
    const start = startOfMonth(pivot);
    const end = endOfMonth(pivot);
    const window = transactions.filter((tx) => withinRange(tx.occurredAt, start, end));
    const income = window
      .filter((tx) => tx.direction === TransactionDirection.IN)
      .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    const expenses = window
      .filter((tx) => tx.direction === TransactionDirection.OUT)
      .reduce((sum, tx) => sum + toNumber(tx.amount) + toNumber(tx.fee), 0);

    return {
      label: format(start, "MMM"),
      income,
      expenses,
      net: income - expenses,
    };
  });
}

function buildCategoryBreakdown(transactions: TransactionWithRelations[], now = new Date()) {
  const buckets = new Map<
    string,
    { label: string; color: string; value: number; txIds: string[] }
  >();

  for (const tx of monthTransactions(transactions, now)) {
    if (tx.direction !== TransactionDirection.OUT) continue;
    const key = tx.category?.slug ?? "other";
    const existing = buckets.get(key) ?? {
      label: tx.category?.name ?? "Other",
      color: tx.category?.color ?? "#64748b",
      value: 0,
      txIds: [],
    };
    existing.value += toNumber(tx.amount) + toNumber(tx.fee);
    existing.txIds.push(tx.id);
    buckets.set(key, existing);
  }

  return [...buckets.values()].sort((a, b) => b.value - a.value);
}

function buildDailyBurn(transactions: TransactionWithRelations[], now = new Date()) {
  const days = eachDayOfInterval({ start: subDays(now, 13), end: now });
  return days.map((day) => {
    const window = transactions.filter((tx) => isSameDay(tx.occurredAt, day));
    const spend = window
      .filter((tx) => tx.direction === TransactionDirection.OUT)
      .reduce((sum, tx) => sum + toNumber(tx.amount) + toNumber(tx.fee), 0);
    return { label: format(day, "dd MMM"), spend };
  });
}

export function detectFraudAlerts(transactions: TransactionWithRelations[]) {
  const alerts: AlertSeed[] = [];
  const ordered = [...transactions].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  for (let index = 0; index < ordered.length; index += 1) {
    const tx = ordered[index];
    if (!tx) continue;
    if (tx.direction !== TransactionDirection.OUT) continue;

    const amount = toNumber(tx.amount);
    const prior = ordered[index - 1];
    if (
      prior &&
      prior.direction === tx.direction &&
      prior.counterpartyName === tx.counterpartyName &&
      Math.abs(toNumber(prior.amount) - amount) < 1 &&
      Math.abs(tx.occurredAt.getTime() - prior.occurredAt.getTime()) < 1000 * 60 * 90
    ) {
      alerts.push({
        transactionId: tx.id,
        rule: "duplicate-transfer-window",
        score: 0.88,
        explanation: `A near-duplicate transfer to ${titleCase(tx.counterpartyName)} landed within 90 minutes of a prior payment.`,
      });
    }

    const hour = tx.occurredAt.getHours();
    if (amount >= 10000 && amount % 1000 === 0 && (hour >= 23 || hour <= 5)) {
      alerts.push({
        transactionId: tx.id,
        rule: "late-night-round-number",
        score: 0.79,
        explanation: `A large round-number transfer of KES ${amount.toLocaleString()} occurred outside the user's normal active hours.`,
      });
    }
  }

  return alerts;
}

export function generateInsights(transactions: TransactionWithRelations[], now = new Date()) {
  const currentMonth = monthTransactions(transactions, now);
  const previousMonth = previousMonthTransactions(transactions, now);
  const categoryBreakdown = buildCategoryBreakdown(transactions, now);
  const dailyBurn = buildDailyBurn(transactions, now);
  const latestBalanceTx = [...transactions]
    .filter((tx) => tx.balanceAfter !== null)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
  const alerts = detectFraudAlerts(transactions);
  const insights: InsightSeed[] = [];

  if (categoryBreakdown[0]) {
    const top = categoryBreakdown[0];
    insights.push({
      kind: InsightKind.TREND,
      severity: InsightSeverity.MEDIUM,
      title: `${top.label} is driving this month's burn`,
      body: `${top.label} accounts for KES ${Math.round(top.value).toLocaleString()} of outgoing spend this month, making it the clearest optimization target right now.`,
      evidenceTxIds: top.txIds.slice(0, 5),
      generatedBy: AgentName.CATEGORIZATION,
      modelId: "heuristic-category-v1",
    });
  }

  const salaryThisMonth = currentMonth
    .filter((tx) => tx.direction === TransactionDirection.IN && tx.category?.slug === "salary")
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const salaryLastMonth = previousMonth
    .filter((tx) => tx.direction === TransactionDirection.IN && tx.category?.slug === "salary")
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

  if (salaryThisMonth > 0 && salaryLastMonth > 0) {
    const delta = salaryThisMonth - salaryLastMonth;
    insights.push({
      kind: InsightKind.SUMMARY,
      severity: delta >= 0 ? InsightSeverity.INFO : InsightSeverity.MEDIUM,
      title:
        delta >= 0 ? "Income held steady month over month" : "Income softened versus last month",
      body:
        delta >= 0
          ? `Salary-linked inflows were KES ${Math.round(salaryThisMonth).toLocaleString()} this month, up KES ${Math.round(delta).toLocaleString()} from last month.`
          : `Salary-linked inflows were KES ${Math.round(salaryThisMonth).toLocaleString()} this month, down KES ${Math.round(Math.abs(delta)).toLocaleString()} from last month.`,
      evidenceTxIds: currentMonth
        .filter((tx) => tx.category?.slug === "salary")
        .map((tx) => tx.id)
        .slice(0, 3),
      generatedBy: AgentName.FORECAST,
      modelId: "heuristic-income-v1",
    });
  }

  const avgBurn = average(dailyBurn.map((item) => item.spend));
  const projectedWeekSpend = avgBurn * 7;
  insights.push({
    kind: InsightKind.FORECAST,
    severity: projectedWeekSpend > 25000 ? InsightSeverity.HIGH : InsightSeverity.INFO,
    title: "7-day cashflow forecast",
    body: `Based on the last 14 days, projected outgoing spend for the next week is about KES ${Math.round(projectedWeekSpend).toLocaleString()}.`,
    evidenceTxIds: currentMonth.slice(0, 6).map((tx) => tx.id),
    generatedBy: AgentName.FORECAST,
    modelId: "heuristic-forecast-v1",
  });

  if (latestBalanceTx?.balanceAfter && toNumber(latestBalanceTx.balanceAfter) < avgBurn * 5) {
    insights.push({
      kind: InsightKind.ANOMALY,
      severity: InsightSeverity.HIGH,
      title: "Balance runway is tightening",
      body: `The most recent reported balance is KES ${Math.round(toNumber(latestBalanceTx.balanceAfter)).toLocaleString()}, which is less than five average burn-days.`,
      evidenceTxIds: [latestBalanceTx.id],
      generatedBy: AgentName.FORECAST,
      modelId: "heuristic-balance-v1",
    });
  }

  if (alerts[0]) {
    insights.push({
      kind: InsightKind.ANOMALY,
      severity: InsightSeverity.HIGH,
      title: "Suspicious transaction pattern detected",
      body: alerts[0].explanation,
      evidenceTxIds: [alerts[0].transactionId],
      generatedBy: AgentName.FRAUD,
      modelId: "heuristic-fraud-v1",
      metadata: { score: alerts[0].score, rule: alerts[0].rule },
    });
  }

  const currentOutgoing = currentMonth
    .filter((tx) => tx.direction === TransactionDirection.OUT)
    .reduce((sum, tx) => sum + toNumber(tx.amount) + toNumber(tx.fee), 0);
  const savingsSuggestion = Math.max(currentOutgoing * 0.08, 1500);
  insights.push({
    kind: InsightKind.RECOMMENDATION,
    severity: InsightSeverity.INFO,
    title: "Savings opportunity surfaced",
    body: `Redirecting even 8% of current outgoing spend would preserve about KES ${Math.round(savingsSuggestion).toLocaleString()} this month without changing income.`,
    evidenceTxIds: categoryBreakdown.flatMap((entry) => entry.txIds).slice(0, 6),
    generatedBy: AgentName.COPILOT,
    modelId: "heuristic-advisor-v1",
  });

  return insights;
}

export function buildFinancialScore(transactions: TransactionWithRelations[], now = new Date()) {
  const currentMonth = monthTransactions(transactions, now);
  const incoming = currentMonth
    .filter((tx) => tx.direction === TransactionDirection.IN)
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const outgoing = currentMonth
    .filter((tx) => tx.direction === TransactionDirection.OUT)
    .reduce((sum, tx) => sum + toNumber(tx.amount) + toNumber(tx.fee), 0);
  const savingsRate = incoming > 0 ? Math.max(0, (incoming - outgoing) / incoming) : 0;
  const fraudPenalty = detectFraudAlerts(transactions).length * 6;
  const balanceCoverage =
    [...transactions]
      .filter((tx) => tx.balanceAfter !== null)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0]?.balanceAfter ?? null;
  const liquidityBonus = toNumber(balanceCoverage) > outgoing / 2 ? 8 : 0;

  return Math.max(
    34,
    Math.min(94, Math.round(55 + savingsRate * 28 + liquidityBonus - fraudPenalty)),
  );
}

export function buildWorkspaceSnapshot(
  transactions: TransactionWithRelations[],
  insights: AIInsight[],
  now = new Date(),
) {
  const currentMonth = monthTransactions(transactions, now);
  const monthlyIncome = currentMonth
    .filter((tx) => tx.direction === TransactionDirection.IN)
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const monthlyExpenses = currentMonth
    .filter((tx) => tx.direction === TransactionDirection.OUT)
    .reduce((sum, tx) => sum + toNumber(tx.amount) + toNumber(tx.fee), 0);
  const sent = currentMonth
    .filter(
      (tx) => tx.direction === TransactionDirection.OUT && tx.type === TransactionType.TRANSFER,
    )
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const received = currentMonth
    .filter(
      (tx) => tx.direction === TransactionDirection.IN && tx.type === TransactionType.TRANSFER,
    )
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const topCounterparty = [...transactions]
    .filter((tx) => tx.counterpartyName)
    .reduce<Record<string, number>>((acc, tx) => {
      const key = titleCase(tx.counterpartyName);
      acc[key] = (acc[key] ?? 0) + toNumber(tx.amount);
      return acc;
    }, {});
  const counterparties = Object.entries(topCounterparty).sort((a, b) => b[1] - a[1]);

  return {
    monthlyIncome,
    monthlyExpenses,
    sent,
    received,
    net: monthlyIncome - monthlyExpenses,
    financialScore: buildFinancialScore(transactions, now),
    weeklySeries: buildWeeklySeries(transactions, now),
    monthlySeries: buildMonthlySeries(transactions, now),
    categoryBreakdown: buildCategoryBreakdown(transactions, now),
    dailyBurn: buildDailyBurn(transactions, now),
    topCounterparties: counterparties.slice(0, 5).map(([label, value]) => ({ label, value })),
    insights: insights.slice(0, 5),
  };
}

export async function getWorkspaceData(userId: string) {
  const [transactions, insights, alerts, reports, auditLogs, sessions] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      include: { category: true, account: true, alerts: true },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.aIInsight.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.fraudAlert.findMany({
      where: { userId },
      include: { transaction: { include: { category: true, account: true } } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 12,
    }),
    prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.chatSession.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    transactions,
    insights,
    alerts,
    reports,
    auditLogs,
    sessions,
    snapshot: buildWorkspaceSnapshot(transactions, insights),
  };
}

export async function refreshUserIntelligence(userId: string) {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: { category: true, account: true, alerts: true },
    orderBy: { occurredAt: "desc" },
  });

  const alerts = detectFraudAlerts(transactions);
  const insights = generateInsights(transactions);
  const snapshot = buildWorkspaceSnapshot(
    transactions,
    insights.map((insight) => ({
      ...insight,
      id: "",
      userId,
      createdAt: new Date(),
    })) as AIInsight[],
  );
  const periodStart = startOfMonth(new Date());
  const periodEnd = endOfMonth(new Date());

  await prisma.$transaction(async (tx) => {
    await tx.fraudAlert.deleteMany({ where: { userId } });
    if (alerts.length) {
      await tx.fraudAlert.createMany({
        data: alerts.map((alert) => ({
          userId,
          transactionId: alert.transactionId,
          rule: alert.rule,
          score: alert.score,
          status: FraudStatus.OPEN,
          explanation: alert.explanation,
        })),
      });
    }

    await tx.aIInsight.deleteMany({ where: { userId } });
    if (insights.length) {
      await tx.aIInsight.createMany({
        data: insights.map((insight) => ({
          userId,
          kind: insight.kind,
          severity: insight.severity,
          title: insight.title,
          body: insight.body,
          evidenceTxIds: insight.evidenceTxIds,
          generatedBy: insight.generatedBy,
          modelId: insight.modelId,
          metadata: insight.metadata,
        })),
      });
    }

    await tx.report.upsert({
      where: {
        userId_period_periodStart: {
          userId,
          period: ReportPeriod.MONTHLY,
          periodStart,
        },
      },
      update: {
        periodEnd,
        summary: snapshot as Prisma.InputJsonValue,
      },
      create: {
        userId,
        period: ReportPeriod.MONTHLY,
        periodStart,
        periodEnd,
        summary: snapshot as Prisma.InputJsonValue,
      },
    });
  });
}

export async function answerCopilotQuestion(userId: string, question: string) {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: { category: true, account: true, alerts: true },
    orderBy: { occurredAt: "desc" },
  });

  const normalized = question.toLowerCase();
  const snapshot = buildWorkspaceSnapshot(transactions, []);
  const thisMonth = monthTransactions(transactions);

  if (normalized.includes("food")) {
    const food = thisMonth.filter((tx) => tx.category?.slug === "food");
    const total = food.reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    return {
      answer: `You spent KES ${Math.round(total).toLocaleString()} on food and groceries this month across ${food.length} transactions.`,
      citedTxIds: food.slice(0, 6).map((tx) => tx.id),
    };
  }

  if (normalized.includes("biggest expense")) {
    const largest = thisMonth
      .filter((tx) => tx.direction === TransactionDirection.OUT)
      .sort((a, b) => toNumber(b.amount) - toNumber(a.amount))[0];
    return {
      answer: largest
        ? `Your biggest single expense this month was KES ${Math.round(toNumber(largest.amount)).toLocaleString()} to ${titleCase(largest.counterpartyName ?? largest.merchant ?? largest.category?.name)} on ${format(largest.occurredAt, "dd MMM")}.`
        : "I do not have an outgoing expense for this month yet.",
      citedTxIds: largest ? [largest.id] : [],
    };
  }

  if (normalized.includes("salary")) {
    const current = thisMonth.filter((tx) => tx.category?.slug === "salary");
    const previous = previousMonthTransactions(transactions).filter(
      (tx) => tx.category?.slug === "salary",
    );
    const currentTotal = current.reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    const previousTotal = previous.reduce((sum, tx) => sum + toNumber(tx.amount), 0);
    const delta = currentTotal - previousTotal;
    return {
      answer:
        previousTotal > 0
          ? `Salary-linked income is ${delta >= 0 ? "up" : "down"} by KES ${Math.round(Math.abs(delta)).toLocaleString()} versus last month. Current month salary inflow is KES ${Math.round(currentTotal).toLocaleString()}.`
          : `This month salary-linked inflow is KES ${Math.round(currentTotal).toLocaleString()}. I do not have a prior month baseline yet.`,
      citedTxIds: current
        .concat(previous)
        .slice(0, 4)
        .map((tx) => tx.id),
    };
  }

  if (normalized.includes("predict") || normalized.includes("next week")) {
    return {
      answer: `Projected outgoing spend for the next 7 days is about KES ${Math.round(average(snapshot.dailyBurn.map((item) => item.spend)) * 7).toLocaleString()}. Transport and shopping are the main drivers in the recent burn pattern.`,
      citedTxIds: thisMonth.slice(0, 8).map((tx) => tx.id),
    };
  }

  if (normalized.includes("suspicious") || normalized.includes("fraud")) {
    const alerts = detectFraudAlerts(transactions);
    const strongestAlert = alerts[0];
    return {
      answer: strongestAlert
        ? `I flagged ${alerts.length} suspicious transaction pattern${alerts.length > 1 ? "s" : ""}. The strongest alert is "${strongestAlert.rule}" with a score of ${strongestAlert.score.toFixed(2)}.`
        : "I do not see a suspicious transaction pattern in the current data window.",
      citedTxIds: alerts.slice(0, 4).map((alert) => alert.transactionId),
    };
  }

  return {
    answer: `This month you have KES ${Math.round(snapshot.monthlyIncome).toLocaleString()} in inflows, KES ${Math.round(snapshot.monthlyExpenses).toLocaleString()} in outflows, and a financial score of ${snapshot.financialScore}/100. Ask about categories, salary, suspicious activity, or next-week spend for a tighter answer.`,
    citedTxIds: thisMonth.slice(0, 6).map((tx) => tx.id),
  };
}

export function demoSmsCorpus(now = new Date()) {
  const day = (offset: number, time: string) => {
    const base = subDays(now, offset);
    return `${base.getDate()}/${base.getMonth() + 1}/${String(base.getFullYear()).slice(2)} at ${time}`;
  };

  return [
    `QAA11BB22C Confirmed. Ksh 48,500.00 received from ACME SALARY 0712000000 on ${day(28, "8:10 AM")}. New M-PESA balance is Ksh 59,120.00.`,
    `QAA11BB23D Confirmed. Ksh 12,000.00 sent to LANDLORD RENT 0722000000 on ${day(27, "7:30 AM")}. New M-PESA balance is Ksh 46,980.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB24E Confirmed. Ksh 3,450.00 paid to NAIVAS KILIMANI. on ${day(26, "6:20 PM")}. New M-PESA balance is Ksh 43,530.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB25F Confirmed. Ksh 780.00 paid to BOLT KENYA. on ${day(25, "9:12 PM")}. New M-PESA balance is Ksh 42,750.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB26G Confirmed. Ksh 2,350.00 sent to KPLC PREPAID for account 771245 on ${day(24, "10:40 AM")}. New M-PESA balance is Ksh 40,400.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB27H Confirmed. Ksh 1,600.00 sent to MOM SUPPORT 0700112233 on ${day(22, "8:35 PM")}. New M-PESA balance is Ksh 38,800.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB28J Confirmed. Ksh 2,100.00 paid to QUICKMART NGONG. on ${day(21, "5:48 PM")}. New M-PESA balance is Ksh 36,700.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB29K Confirmed. Ksh 15,000.00 received from CLIENT RETAINER 0722556677 on ${day(19, "11:05 AM")}. New M-PESA balance is Ksh 51,700.00.`,
    `QAA11BB30L Confirmed. Ksh 8,400.00 sent to OFFICE SUPPLIER 0722111000 on ${day(18, "2:20 PM")}. New M-PESA balance is Ksh 43,300.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB31M Confirmed. You bought Ksh 500.00 of airtime on ${day(17, "7:00 AM")}. New M-PESA balance is Ksh 42,800.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB32N Confirmed. Ksh 2,950.00 paid to CARREFOUR JUNCTION. on ${day(16, "8:15 PM")}. New M-PESA balance is Ksh 39,850.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB33P Confirmed. Ksh 1,250.00 paid to UBER TRIPS. on ${day(15, "9:05 PM")}. New M-PESA balance is Ksh 38,600.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB34Q Confirmed. Ksh 8,000.00 sent to MONEY MARKET SACCO 0799001100 on ${day(14, "6:15 AM")}. New M-PESA balance is Ksh 30,600.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB35R Confirmed. Ksh 48,500.00 received from ACME SALARY 0712000000 on ${day(12, "8:08 AM")}. New M-PESA balance is Ksh 79,100.00.`,
    `QAA11BB36S Confirmed. Ksh 12,000.00 sent to LANDLORD RENT 0722000000 on ${day(11, "7:28 AM")}. New M-PESA balance is Ksh 67,100.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB37T Confirmed. Ksh 3,850.00 paid to NAIVAS WESTLANDS. on ${day(10, "6:31 PM")}. New M-PESA balance is Ksh 63,250.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB38U Confirmed. Ksh 700.00 paid to BOLT KENYA. on ${day(9, "10:41 PM")}. New M-PESA balance is Ksh 62,550.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB39V Confirmed. Ksh 2,400.00 sent to KPLC PREPAID for account 771245 on ${day(8, "9:30 AM")}. New M-PESA balance is Ksh 60,150.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB40W Confirmed. Ksh 1,900.00 sent to MOM SUPPORT 0700112233 on ${day(6, "8:42 PM")}. New M-PESA balance is Ksh 58,250.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB41X Confirmed. Ksh 4,250.00 paid to QUICKMART KAREN. on ${day(5, "7:10 PM")}. New M-PESA balance is Ksh 54,000.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB42Y Confirmed. Ksh 18,000.00 sent to UNKNOWN DEALER 0711223344 on ${day(4, "11:54 PM")}. New M-PESA balance is Ksh 36,000.00. Transaction cost, Ksh 0.00.`,
    `QAA11BB43Z Confirmed. Ksh 18,000.00 sent to UNKNOWN DEALER 0711223344 on ${day(4, "11:58 PM")}. New M-PESA balance is Ksh 18,000.00. Transaction cost, Ksh 0.00.`,
    `QAA11CC44A Confirmed. Ksh 2,200.00 paid to CARREFOUR JUNCTION. on ${day(3, "1:22 PM")}. New M-PESA balance is Ksh 15,800.00. Transaction cost, Ksh 0.00.`,
    `QAA11CC45B Confirmed. Ksh 3,100.00 sent to SAFARICOM HOME for account 884211 on ${day(2, "4:18 PM")}. New M-PESA balance is Ksh 12,700.00. Transaction cost, Ksh 0.00.`,
    `QAA11CC46C Confirmed. Ksh 9,500.00 received from CLIENT RETAINER 0722556677 on ${day(1, "10:15 AM")}. New M-PESA balance is Ksh 22,200.00.`,
  ];
}
