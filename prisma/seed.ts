import "dotenv/config";

import {
  AccountProvider,
  PrismaClient,
  TransactionDirection,
  TransactionSource,
  TransactionType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { subDays } from "date-fns";

import { CATEGORY_SEED } from "../src/lib/categories";
import { categorizeTransaction, demoSmsCorpus, refreshUserIntelligence } from "../src/lib/finance";
import { parseSms } from "../src/lib/parsers";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@pesapilot.ai";
const DEMO_PASSWORD = "demo1234";

async function seedCategories() {
  for (const cat of CATEGORY_SEED) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, color: cat.color, icon: cat.icon },
      create: { ...cat, isSystem: true },
    });
  }
}

async function seedDemoUser() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      name: "Demo User",
      currency: "KES",
      timezone: "Africa/Nairobi",
    },
  });

  await prisma.account.upsert({
    where: {
      userId_provider_accountNumber: {
        userId: user.id,
        provider: AccountProvider.MPESA,
        accountNumber: "+254700000000",
      },
    },
    update: {},
    create: {
      userId: user.id,
      provider: AccountProvider.MPESA,
      accountName: "M-Pesa Wallet",
      accountNumber: "+254700000000",
    },
  });

  return user;
}

async function seedDemoTransactions(userId: string) {
  const account = await prisma.account.findFirstOrThrow({
    where: { userId, provider: AccountProvider.MPESA },
  });
  const categories = await prisma.category.findMany();
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  for (const sms of demoSmsCorpus()) {
    const parsed = parseSms(sms);
    if (!parsed.ok) continue;

    const categorySlug = categorizeTransaction({
      merchant: parsed.tx.merchant,
      counterpartyName: parsed.tx.counterpartyName,
      type: parsed.tx.type,
      direction: parsed.tx.direction,
      rawText: parsed.tx.rawText,
    });

    if (!parsed.tx.externalRef) continue;

    await prisma.transaction.upsert({
      where: {
        userId_externalRef: {
          userId,
          externalRef: parsed.tx.externalRef,
        },
      },
      update: {
        accountId: account.id,
        type: parsed.tx.type,
        direction: parsed.tx.direction,
        amount: parsed.tx.amount,
        fee: parsed.tx.fee,
        balanceAfter: parsed.tx.balanceAfter,
        counterpartyName: parsed.tx.counterpartyName,
        counterpartyPhone: parsed.tx.counterpartyPhone,
        merchant: parsed.tx.merchant,
        categoryId: categoryBySlug.get(categorySlug),
        occurredAt: parsed.tx.occurredAt,
        rawText: parsed.tx.rawText,
        source: TransactionSource.SMS,
        confidence: parsed.tx.confidence,
        metadata: { parser: parsed.tx.parser, seeded: true },
      },
      create: {
        userId,
        accountId: account.id,
        externalRef: parsed.tx.externalRef,
        type: parsed.tx.type,
        direction: parsed.tx.direction,
        amount: parsed.tx.amount,
        fee: parsed.tx.fee,
        balanceAfter: parsed.tx.balanceAfter,
        counterpartyName: parsed.tx.counterpartyName,
        counterpartyPhone: parsed.tx.counterpartyPhone,
        merchant: parsed.tx.merchant,
        categoryId: categoryBySlug.get(categorySlug),
        occurredAt: parsed.tx.occurredAt,
        rawText: parsed.tx.rawText,
        source: TransactionSource.SMS,
        confidence: parsed.tx.confidence,
        metadata: { parser: parsed.tx.parser, seeded: true },
      },
    });
  }

  const manualInflows = [
    {
      externalRef: "SAL-2026-04",
      amount: 46500,
      counterpartyName: "ACME Salary",
      categorySlug: "salary",
      occurredAt: subDays(new Date(), 30),
    },
    {
      externalRef: "SAL-2026-05",
      amount: 48500,
      counterpartyName: "ACME Salary",
      categorySlug: "salary",
      occurredAt: subDays(new Date(), 12),
    },
    {
      externalRef: "CLI-2026-05",
      amount: 9500,
      counterpartyName: "Client Retainer",
      categorySlug: "other-income",
      occurredAt: subDays(new Date(), 1),
    },
  ];

  for (const inflow of manualInflows) {
    await prisma.transaction.upsert({
      where: {
        userId_externalRef: {
          userId,
          externalRef: inflow.externalRef,
        },
      },
      update: {
        accountId: account.id,
        type: TransactionType.DEPOSIT,
        direction: TransactionDirection.IN,
        amount: inflow.amount,
        fee: 0,
        counterpartyName: inflow.counterpartyName,
        categoryId: categoryBySlug.get(inflow.categorySlug),
        occurredAt: inflow.occurredAt,
        rawText: null,
        source: TransactionSource.MANUAL,
        confidence: 0.98,
        metadata: { seeded: true, kind: "manual-inflow" },
      },
      create: {
        userId,
        accountId: account.id,
        externalRef: inflow.externalRef,
        type: TransactionType.DEPOSIT,
        direction: TransactionDirection.IN,
        amount: inflow.amount,
        fee: 0,
        counterpartyName: inflow.counterpartyName,
        categoryId: categoryBySlug.get(inflow.categorySlug),
        occurredAt: inflow.occurredAt,
        rawText: null,
        source: TransactionSource.MANUAL,
        confidence: 0.98,
        metadata: { seeded: true, kind: "manual-inflow" },
      },
    });
  }
}

async function seedAuditTrail(userId: string) {
  await prisma.auditLog.deleteMany({ where: { userId } });

  const latestTransactions = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    take: 8,
  });

  for (const tx of latestTransactions) {
    await prisma.auditLog.create({
      data: {
        userId,
        agent: "EXTRACTION",
        input: { rawText: tx.rawText, source: tx.source },
        output: {
          transactionId: tx.id,
          externalRef: tx.externalRef,
          amount: tx.amount.toString(),
          direction: tx.direction,
          merchant: tx.merchant,
        },
        modelId: "regex-hybrid-v1",
        latencyMs: 42,
        confidence: tx.confidence,
        explanation:
          "Matched the provider-specific SMS template and extracted structured transaction fields.",
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        agent: "CATEGORIZATION",
        input: {
          merchant: tx.merchant,
          counterpartyName: tx.counterpartyName,
          type: tx.type,
        },
        output: { transactionId: tx.id, categoryId: tx.categoryId },
        modelId: "heuristic-category-v1",
        latencyMs: 18,
        confidence: 0.84,
        explanation:
          "Assigned a stable spending category using merchant and transaction-type heuristics.",
      },
    });
  }
}

async function main() {
  console.log("→ Seeding categories");
  await seedCategories();

  if (process.env.SEED_DEMO_DATA === "true") {
    console.log(`→ Seeding demo user (${DEMO_EMAIL} / ${DEMO_PASSWORD})`);
    const user = await seedDemoUser();
    console.log("→ Seeding demo transaction history");
    await seedDemoTransactions(user.id);
    console.log("→ Generating fraud alerts, insights, and report snapshot");
    await refreshUserIntelligence(user.id);
    console.log("→ Writing audit trail");
    await seedAuditTrail(user.id);
  } else {
    console.log("→ Skipping demo user and transaction seeding. Set SEED_DEMO_DATA=true to seed demo data.");
  }

  console.log("✓ Seed complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
