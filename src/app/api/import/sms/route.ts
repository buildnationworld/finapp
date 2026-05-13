import { AccountProvider, AgentName, TransactionSource } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { categorizeTransaction, refreshUserIntelligence } from "@/lib/finance";
import { parseSms, splitMessages } from "@/lib/parsers";

const payloadSchema = z.object({
  input: z.string().min(1),
  mode: z.enum(["preview", "import"]).default("preview"),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const parsedBody = payloadSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const messages = splitMessages(parsedBody.data.input);
  const categories = await prisma.category.findMany();
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  let accountId: string | null = null;
  if (parsedBody.data.mode === "import") {
    const account = await prisma.account.upsert({
      where: {
        userId_provider_accountNumber: {
          userId: session.user.id,
          provider: AccountProvider.MPESA,
          accountNumber: "+254700000000",
        },
      },
      update: {},
      create: {
        userId: session.user.id,
        provider: AccountProvider.MPESA,
        accountName: "M-Pesa Wallet",
        accountNumber: "+254700000000",
      },
    });
    accountId = account.id;
  }

  const results: Array<{
    rawText: string;
    status: "parsed" | "imported" | "duplicate" | "rejected";
    reason?: string;
    transaction?: {
      amount: number;
      type: string;
      direction: string;
      merchant: string | null;
      counterpartyName: string | null;
      occurredAt: string;
      category: string;
      confidence: number;
    };
  }> = [];

  let importedTransactions = 0;
  let duplicates = 0;

  for (const message of messages) {
    const outcome = parseSms(message);
    if (!outcome.ok) {
      results.push({
        rawText: message,
        status: "rejected",
        reason: outcome.reason,
      });
      continue;
    }

    const category = categorizeTransaction({
      merchant: outcome.tx.merchant,
      counterpartyName: outcome.tx.counterpartyName,
      direction: outcome.tx.direction,
      type: outcome.tx.type,
      rawText: outcome.tx.rawText,
    });
    const result = {
      rawText: message,
      status: "parsed" as const,
      transaction: {
        amount: outcome.tx.amount,
        type: outcome.tx.type,
        direction: outcome.tx.direction,
        merchant: outcome.tx.merchant,
        counterpartyName: outcome.tx.counterpartyName,
        occurredAt: outcome.tx.occurredAt.toISOString(),
        category,
        confidence: outcome.tx.confidence,
      },
    };

    if (parsedBody.data.mode === "preview") {
      results.push(result);
      continue;
    }

    const existing = outcome.tx.externalRef
      ? await prisma.transaction.findUnique({
          where: {
            userId_externalRef: {
              userId: session.user.id,
              externalRef: outcome.tx.externalRef,
            },
          },
        })
      : null;

    if (existing) {
      duplicates += 1;
      results.push({ ...result, status: "duplicate" });
      continue;
    }

    const created = await prisma.transaction.create({
      data: {
        userId: session.user.id,
        accountId,
        externalRef: outcome.tx.externalRef,
        type: outcome.tx.type,
        direction: outcome.tx.direction,
        amount: outcome.tx.amount,
        fee: outcome.tx.fee,
        balanceAfter: outcome.tx.balanceAfter,
        counterpartyName: outcome.tx.counterpartyName,
        counterpartyPhone: outcome.tx.counterpartyPhone,
        merchant: outcome.tx.merchant,
        categoryId: categoryBySlug.get(category),
        occurredAt: outcome.tx.occurredAt,
        rawText: outcome.tx.rawText,
        source: TransactionSource.SMS,
        confidence: outcome.tx.confidence,
        metadata: { parser: outcome.tx.parser },
      },
    });

    await prisma.auditLog.createMany({
      data: [
        {
          userId: session.user.id,
          agent: AgentName.EXTRACTION,
          input: { rawText: outcome.tx.rawText },
          output: {
            transactionId: created.id,
            amount: created.amount.toString(),
            type: created.type,
            direction: created.direction,
          },
          modelId: "regex-hybrid-v1",
          latencyMs: 35,
          confidence: outcome.tx.confidence,
          explanation: "Parsed the incoming SMS into a structured financial event.",
        },
        {
          userId: session.user.id,
          agent: AgentName.CATEGORIZATION,
          input: {
            merchant: created.merchant,
            counterpartyName: created.counterpartyName,
            type: created.type,
          },
          output: { transactionId: created.id, category },
          modelId: "heuristic-category-v1",
          latencyMs: 16,
          confidence: 0.83,
          explanation:
            "Mapped the transaction to a spending category using provider, merchant, and transaction-type hints.",
        },
      ],
    });

    importedTransactions += 1;
    results.push({ ...result, status: "imported" });
  }

  if (parsedBody.data.mode === "import") {
    await refreshUserIntelligence(session.user.id);
  }

  return NextResponse.json({
    summary: {
      mode: parsedBody.data.mode,
      totalMessages: messages.length,
      parsedMessages: results.filter((result) => result.status !== "rejected").length,
      importedTransactions,
      duplicates,
    },
    results,
  });
}
