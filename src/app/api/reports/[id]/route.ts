import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { createElement } from "react";

import { ReportPdf } from "@/components/report-pdf";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const report = await prisma.report.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const summary = report.summary as {
    monthlyIncome: number;
    monthlyExpenses: number;
    net: number;
    financialScore: number;
    categoryBreakdown?: Array<{ label: string; value: number }>;
    insights?: Array<{ title: string; body: string }>;
  };

  const buffer = await renderToBuffer(
    createElement(ReportPdf, {
      title: "PesaPilot AI Financial Intelligence Report",
      period: report.period,
      summary,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pesapilot-${report.period.toLowerCase()}-${report.id}.pdf"`,
    },
  });
}
