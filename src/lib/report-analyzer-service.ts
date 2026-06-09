import { createHash } from "node:crypto";

import { AgentName, DocumentStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { openRouterChat, parseJsonObject } from "@/lib/openrouter";
import { type FinancialReportAnalysis, analyzeFinancialReport } from "@/lib/report-analysis";

const enhancementSchema = z.object({
  executiveSummary: z.string().min(20).max(900),
  visualHeadline: z.string().min(8).max(140),
  visualNotes: z.array(z.string().min(5).max(180)).min(2).max(5),
  recommendations: z.array(z.string().min(5).max(220)).min(2).max(5),
});

async function enhanceWithOpenRouter(analysis: FinancialReportAnalysis) {
  try {
    const model = process.env.OPENROUTER_MODEL ?? "minimax/minimax-m2.5:free";
    const modelResponse = await openRouterChat({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are PesaPilot AI, a financial analyst for emerging-market users. Return strict JSON only. Do not include markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a concise financial summary and chart annotations from extracted report data.",
            requiredShape: {
              executiveSummary: "one paragraph",
              visualHeadline: "short title for the visual section",
              visualNotes: ["2-5 short labels explaining what the chart should highlight"],
              recommendations: ["2-5 concrete financial actions"],
            },
            extracted: analysis.extracted,
            rows: analysis.rows.slice(0, 12).map((row) => ({
              amount: row.amount,
              direction: row.direction,
              entity: row.entity,
              raw: row.raw,
            })),
          }),
        },
      ],
    });
    const parsedEnhancement = enhancementSchema.safeParse(
      parseJsonObject<z.infer<typeof enhancementSchema>>(modelResponse),
    );

    if (!parsedEnhancement.success) return analysis;

    return {
      ...analysis,
      analysis: {
        ...analysis.analysis,
        executiveSummary: parsedEnhancement.data.executiveSummary,
        recommendations: parsedEnhancement.data.recommendations,
      },
      visuals: {
        ...analysis.visuals,
        headline: parsedEnhancement.data.visualHeadline,
        visualNotes: parsedEnhancement.data.visualNotes,
      },
      intelligence: {
        provider: "openrouter" as const,
        model,
      },
    } satisfies FinancialReportAnalysis;
  } catch (error) {
    console.warn("OpenRouter report enhancement failed:", error);
    return analysis;
  }
}

export async function analyzeAndPersistReport(input: {
  userId: string;
  filename: string;
  mime: string;
  text: string;
  source: "text" | "pdf";
  startedAt?: number;
}) {
  let analysis: FinancialReportAnalysis = analyzeFinancialReport({
    title: input.filename,
    text: input.text,
  });
  analysis = await enhanceWithOpenRouter(analysis);

  const sha256 = createHash("sha256")
    .update(`${input.userId}:${input.filename}:${input.text}`)
    .digest("hex");
  const latencyMs = Math.max(
    1,
    Math.round(performance.now() - (input.startedAt ?? performance.now())),
  );
  const metadata = JSON.parse(JSON.stringify({ ...analysis, source: input.source }));

  const document = await prisma.importedDocument.upsert({
    where: {
      userId_sha256: {
        userId: input.userId,
        sha256,
      },
    },
    update: {
      filename: input.filename,
      mime: input.mime,
      rowCount: analysis.extracted.transactionCount,
      status: DocumentStatus.COMPLETED,
      error: null,
      metadata,
    },
    create: {
      userId: input.userId,
      filename: input.filename,
      mime: input.mime,
      sha256,
      rowCount: analysis.extracted.transactionCount,
      status: DocumentStatus.COMPLETED,
      metadata,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      agent: AgentName.EXTRACTION,
      input: {
        documentId: document.id,
        filename: input.filename,
        mime: input.mime,
        source: input.source,
        textLength: input.text.length,
      },
      output: {
        documentId: document.id,
        extracted: analysis.extracted,
        riskLevel: analysis.analysis.riskLevel,
        intelligence: analysis.intelligence,
      },
      modelId: analysis.intelligence.model,
      latencyMs,
      confidence: analysis.extracted.transactionCount > 0 ? 0.82 : 0.34,
      explanation:
        "Extracted transaction-like rows, amount totals, period boundaries, recurring entities, risk level, chart-ready visuals, and recommendations from an uploaded financial report.",
    },
  });

  return {
    documentId: document.id,
    analysis,
  };
}
