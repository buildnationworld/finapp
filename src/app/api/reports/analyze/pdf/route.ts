import { NextResponse } from "next/server";
import { PDFParse, PasswordException } from "pdf-parse";

import { auth } from "@/lib/auth";
import { analyzeAndPersistReport } from "@/lib/report-analyzer-service";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 8 * 1024 * 1024;

async function extractPdfText(file: File, password?: string) {
  const data = new Uint8Array(await file.arrayBuffer());

  PDFParse.setWorker(new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString());

  const parser = new PDFParse({ data, password });

  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = performance.now();
  const formData = await request.formData();
  const file = formData.get("file");
  const password = formData.get("password");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF must be 8MB or smaller" }, { status: 413 });
  }

  let text = "";
  try {
    text = await extractPdfText(
      file,
      typeof password === "string" && password.trim() ? password.trim() : undefined,
    );
  } catch (error) {
    if (error instanceof PasswordException) {
      return NextResponse.json(
        { error: "This PDF is password protected. Enter the password and try again." },
        { status: 422 },
      );
    }
    throw error;
  }
  if (text.length < 20) {
    return NextResponse.json(
      { error: "Could not extract enough text from this PDF" },
      { status: 422 },
    );
  }

  const result = await analyzeAndPersistReport({
    userId: session.user.id,
    filename: file.name || "financial-report.pdf",
    mime: file.type || "application/pdf",
    text,
    source: "pdf",
    startedAt,
  });

  return NextResponse.json({
    ...result,
    extractedTextPreview: text.slice(0, 4000),
  });
}
