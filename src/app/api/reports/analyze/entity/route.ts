import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { openRouterChat, parseJsonObject } from "@/lib/openrouter";

const rowSchema = z.object({
  raw: z.string().max(1500),
  amount: z.number(),
  direction: z.enum(["IN", "OUT", "UNKNOWN"]),
  date: z.string().nullable(),
  entity: z.string().nullable(),
  reference: z.string().nullable().optional(),
  transactionType: z.string().nullable().optional(),
  balance: z.number().nullable().optional(),
  counterpartyAccount: z.string().nullable().optional(),
});

const payloadSchema = z.object({
  query: z.string().min(2).max(120),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  rows: z.array(rowSchema).min(1).max(500),
});

const insightSchema = z.object({
  summary: z.string().min(20).max(900),
  findings: z.array(z.string().min(5).max(220)).min(2).max(6),
  recommendations: z.array(z.string().min(5).max(220)).min(2).max(6),
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function localEntityInsight(input: z.infer<typeof payloadSchema>) {
  const received = input.rows
    .filter((row) => row.direction === "IN")
    .reduce((total, row) => total + row.amount, 0);
  const sent = input.rows
    .filter((row) => row.direction === "OUT")
    .reduce((total, row) => total + row.amount, 0);
  const largest = input.rows.reduce((max, row) => Math.max(max, row.amount), 0);
  const typeCounts = Array.from(
    input.rows.reduce<Map<string, number>>((counts, row) => {
      const type = row.transactionType?.replace(/_/g, " ") ?? row.direction;
      counts.set(type, (counts.get(type) ?? 0) + 1);
      return counts;
    }, new Map()),
  ).sort((a, b) => b[1] - a[1]);
  const topType = typeCounts[0]?.[0] ?? "transactions";

  return {
    query: input.query,
    provider: "local" as const,
    model: "rules/entity-cashflow-v1",
    summary: `${input.query} appears in ${input.rows.length} transactions. Received ${formatAmount(
      received,
    )}, sent/paid ${formatAmount(sent)}, net ${formatAmount(received - sent)}.`,
    findings: [
      `${topType} is the most common interaction type for this search.`,
      `The largest single movement linked to this search is ${formatAmount(largest)}.`,
      "Use the raw transaction rows below to confirm names, reference codes, and balances before acting.",
    ],
    recommendations: [
      "Review repeated transfers against the expected relationship or supplier pattern.",
      "Check the largest movement and recent transactions for unusual timing or unexpected references.",
    ],
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid entity analysis payload" }, { status: 400 });
  }

  const fallback = localEntityInsight(parsed.data);

  try {
    const model = process.env.OPENROUTER_MODEL ?? "minimax/minimax-m2.5:free";
    const response = await openRouterChat({
      model,
      maxTokens: 850,
      messages: [
        {
          role: "system",
          content:
            "You are PesaPilot AI. Analyze one searched person/entity from an M-PESA statement. Return strict JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Explain this person's transaction relationship, cashflow direction, risk signals, and what the user should verify.",
            requiredShape: {
              summary: "one concise paragraph",
              findings: ["2-6 evidence-backed findings"],
              recommendations: ["2-6 practical actions"],
            },
            query: parsed.data.query,
            periodStart: parsed.data.periodStart,
            periodEnd: parsed.data.periodEnd,
            totals: {
              count: parsed.data.rows.length,
              received: parsed.data.rows
                .filter((row) => row.direction === "IN")
                .reduce((total, row) => total + row.amount, 0),
              sent: parsed.data.rows
                .filter((row) => row.direction === "OUT")
                .reduce((total, row) => total + row.amount, 0),
            },
            rows: parsed.data.rows.slice(0, 80),
          }),
        },
      ],
    });
    const insight = insightSchema.safeParse(
      parseJsonObject<z.infer<typeof insightSchema>>(response),
    );

    if (!insight.success) return NextResponse.json(fallback);

    return NextResponse.json({
      query: parsed.data.query,
      provider: "openrouter",
      model,
      ...insight.data,
    });
  } catch (error) {
    console.warn("Entity OpenRouter analysis failed:", error);
    return NextResponse.json(fallback);
  }
}
