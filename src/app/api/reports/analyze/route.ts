import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { analyzeAndPersistReport } from "@/lib/report-analyzer-service";

const payloadSchema = z.object({
  filename: z.string().min(1).max(140).default("financial-report.txt"),
  mime: z.string().min(1).max(120).default("text/plain"),
  text: z.string().min(20).max(120_000),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = performance.now();
  const body = await request.json();
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report payload" }, { status: 400 });
  }

  const result = await analyzeAndPersistReport({
    userId: session.user.id,
    filename: parsed.data.filename,
    mime: parsed.data.mime,
    text: parsed.data.text,
    source: "text",
    startedAt,
  });
  return NextResponse.json(result);
}
