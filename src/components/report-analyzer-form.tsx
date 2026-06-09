"use client";

import { FileText, FileUp, Loader2, ReceiptText, ScanSearch, Upload } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatKES } from "@/lib/utils";

export type AnalyzerResponse = {
  documentId: string;
  extractedTextPreview?: string;
  analysis: {
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
    rows: Array<{
      raw: string;
      amount: number;
      direction: "IN" | "OUT" | "UNKNOWN";
      date: string | null;
      entity: string | null;
      reference?: string | null;
      transactionType?: string | null;
      balance?: number | null;
      counterpartyAccount?: string | null;
      confidence?: number;
    }>;
  };
};

type EntityInsight = {
  query: string;
  provider: "local" | "openrouter";
  model: string;
  summary: string;
  findings: string[];
  recommendations: string[];
};

type TransactionRow = AnalyzerResponse["analysis"]["rows"][number];

const SAMPLE_REPORT = `01/05/2026 CREDIT Salary ACME KES 48,500.00
02/05/2026 DEBIT Rent Landlord KES 12,000.00
03/05/2026 DEBIT Naivas Groceries KES 3,850.00
04/05/2026 DEBIT KPLC Tokens KES 2,400.00
05/05/2026 DEBIT Bolt Transport KES 700.00
07/05/2026 DEBIT Quickmart Groceries KES 4,250.00
08/05/2026 DEBIT Unknown Dealer KES 18,000.00
09/05/2026 CREDIT Client Retainer KES 9,500.00`;

function rowMatchesQuery(row: TransactionRow, query: string) {
  return [row.entity, row.reference, row.transactionType, row.counterpartyAccount, row.raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function sumRows(rows: TransactionRow[], direction: TransactionRow["direction"]) {
  return rows
    .filter((row) => row.direction === direction)
    .reduce((total, row) => total + row.amount, 0);
}

function getEntityPeriod(rows: TransactionRow[]) {
  const timestamps = rows
    .map((row) => (row.date ? new Date(row.date).getTime() : null))
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);

  const first = timestamps.at(0) ?? null;
  const last = timestamps.at(-1) ?? null;

  return {
    first: first !== null ? new Date(first) : null,
    last: last !== null ? new Date(last) : null,
  };
}

export function ReportAnalyzerForm({
  initialResponse,
}: { initialResponse?: AnalyzerResponse | null }) {
  const [filename, setFilename] = useState("may-statement.txt");
  const [mime, setMime] = useState("text/plain");
  const [text, setText] = useState(SAMPLE_REPORT);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState("");
  const [response, setResponse] = useState<AnalyzerResponse | null>(initialResponse ?? null);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"ALL" | "IN" | "OUT" | "UNKNOWN">("ALL");
  const [entityInsight, setEntityInsight] = useState<EntityInsight | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPdfPending, startPdfTransition] = useTransition();
  const [isEntityPending, startEntityTransition] = useTransition();

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setFilename(file.name);
    setMime(file.type || "text/plain");
    const content = await file.text();
    setText(content);
  };

  const uploadPdf = () => {
    if (!pdfFile) return;

    startPdfTransition(async () => {
      const formData = new FormData();
      formData.append("file", pdfFile);
      if (pdfPassword.trim()) {
        formData.append("password", pdfPassword.trim());
      }

      const res = await fetch("/api/reports/analyze/pdf", {
        method: "POST",
        body: formData,
      });

      const payload = (await res.json()) as AnalyzerResponse | { error?: string };
      if (!res.ok) {
        toast.error("error" in payload && payload.error ? payload.error : "PDF analysis failed");
        return;
      }

      const analysisPayload = payload as AnalyzerResponse;
      setResponse(analysisPayload);
      setSelectedRowIndex(0);
      setTransactionSearch("");
      setDirectionFilter("ALL");
      setEntityInsight(null);
      setFilename(pdfFile.name);
      setMime(pdfFile.type || "application/pdf");
      if (analysisPayload.extractedTextPreview) {
        setText(analysisPayload.extractedTextPreview);
      }
      toast.success("PDF analyzed");
    });
  };

  const analyze = () => {
    startTransition(async () => {
      const res = await fetch("/api/reports/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, mime, text }),
      });

      if (!res.ok) {
        toast.error("Report analysis failed");
        return;
      }

      const payload = (await res.json()) as AnalyzerResponse;
      setResponse(payload);
      setSelectedRowIndex(0);
      setTransactionSearch("");
      setDirectionFilter("ALL");
      setEntityInsight(null);
      toast.success("Report analyzed");
    });
  };

  const analyzeEntity = () => {
    const query = transactionSearch.trim();
    if (!query || entityRows.length === 0) return;

    startEntityTransition(async () => {
      const res = await fetch("/api/reports/analyze/entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          periodStart: extracted?.periodStart ?? null,
          periodEnd: extracted?.periodEnd ?? null,
          rows: entityRows.slice(0, 500),
        }),
      });

      const payload = (await res.json()) as EntityInsight | { error?: string };
      if (!res.ok) {
        toast.error("error" in payload && payload.error ? payload.error : "Entity analysis failed");
        return;
      }

      setEntityInsight(payload as EntityInsight);
      toast.success("Entity analysis generated");
    });
  };

  const extracted = response?.analysis.extracted;
  const analysis = response?.analysis.analysis;
  const visuals = response?.analysis.visuals;
  const intelligence = response?.analysis.intelligence;
  const rows = response?.analysis.rows ?? [];
  const entityQuery = transactionSearch.trim().toLowerCase();
  const entityRows = entityQuery ? rows.filter((row) => rowMatchesQuery(row, entityQuery)) : [];
  const entityIncoming = sumRows(entityRows, "IN");
  const entityOutgoing = sumRows(entityRows, "OUT");
  const entityNet = entityIncoming - entityOutgoing;
  const entityBarMax = Math.max(1, entityIncoming, entityOutgoing);
  const entityPeriod = getEntityPeriod(entityRows);
  const entityLargest = entityRows.reduce<TransactionRow | null>(
    (largest, row) => (!largest || row.amount > largest.amount ? row : largest),
    null,
  );
  const entityTypes = Array.from(
    entityRows.reduce<Map<string, number>>((counts, row) => {
      const type = row.transactionType?.replace(/_/g, " ") ?? row.direction;
      counts.set(type, (counts.get(type) ?? 0) + 1);
      return counts;
    }, new Map()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const filteredRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const matchesDirection = directionFilter === "ALL" || row.direction === directionFilter;
      const matchesSearch = !entityQuery || rowMatchesQuery(row, entityQuery);
      return matchesDirection && matchesSearch;
    });
  const selectedRow = rows[selectedRowIndex] ?? rows[0] ?? null;
  const maxBarValue = Math.max(
    1,
    ...(visuals?.cashflowBars.map((bar) => Math.abs(bar.value)) ?? [1]),
  );
  const reportFlowMax = Math.max(1, extracted?.totalIncome ?? 0, extracted?.totalExpenses ?? 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FileText className="h-4 w-4 text-emerald-300" />
            Add financial report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <FileUp className="h-4 w-4 text-emerald-300" />
              Financial PDF upload
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
              />
              <Button onClick={uploadPdf} disabled={!pdfFile || isPdfPending}>
                {isPdfPending ? <Loader2 className="animate-spin" /> : <Upload />}
                Analyze PDF
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              <Label htmlFor="pdf-password">PDF password</Label>
              <Input
                id="pdf-password"
                type="password"
                value={pdfPassword}
                onChange={(event) => setPdfPassword(event.target.value)}
                placeholder="Leave blank if the PDF is not protected"
              />
            </div>
            {pdfFile ? (
              <div className="mt-3 text-xs text-emerald-100">
                {pdfFile.name} · {(pdfFile.size / 1024 / 1024).toFixed(2)}MB
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="report-file">Text or CSV report</Label>
              <Input
                id="report-file"
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-name">Name</Label>
              <Input
                id="report-name"
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                className="min-w-52"
              />
            </div>
          </div>

          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-[300px] bg-slate-950/40"
            placeholder="Paste a bank statement, financial report, CSV rows, or transaction summary..."
          />

          <Button onClick={analyze} disabled={isPending || text.trim().length < 20}>
            {isPending ? <Loader2 className="animate-spin" /> : <ScanSearch />}
            Extract details and analyze
          </Button>
        </CardContent>
      </Card>

      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Upload className="h-4 w-4 text-sky-300" />
            Extracted details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {extracted && analysis ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Income</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatKES(extracted.totalIncome)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Expenses</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatKES(extracted.totalExpenses)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Net</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatKES(extracted.netCashflow)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Score</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {analysis.financialHealthScore}/100
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={analysis.riskLevel === "HIGH" ? "danger" : "accent"}>
                  {analysis.riskLevel} risk
                </Badge>
                <Badge variant="outline">{extracted.transactionCount} rows</Badge>
                {intelligence ? (
                  <Badge variant={intelligence.provider === "openrouter" ? "success" : "outline"}>
                    {intelligence.provider === "openrouter" ? "OpenRouter Minimax" : "Local rules"}
                  </Badge>
                ) : null}
                {extracted.periodStart && extracted.periodEnd ? (
                  <Badge variant="outline">
                    {extracted.periodStart} to {extracted.periodEnd}
                  </Badge>
                ) : null}
                {initialResponse ? (
                  <Badge variant="success">Restored from saved report</Badge>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-sky-200">
                      Money movement graph
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-white">Income vs expenses</h3>
                  </div>
                  <Badge variant={extracted.netCashflow >= 0 ? "success" : "danger"}>
                    Net {formatKES(extracted.netCashflow)}
                  </Badge>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[0.58fr_0.42fr]">
                  <div className="grid h-56 grid-cols-2 items-end gap-4 rounded-xl border border-white/10 bg-black/20 px-5 pb-5 pt-8">
                    {[
                      {
                        label: "Money in",
                        value: extracted.totalIncome,
                        color: "from-emerald-400 via-lime-300 to-emerald-200",
                        text: "text-emerald-300",
                      },
                      {
                        label: "Money out",
                        value: extracted.totalExpenses,
                        color: "from-rose-500 via-orange-300 to-amber-200",
                        text: "text-rose-300",
                      },
                    ].map((item) => {
                      const height = `${Math.max(
                        item.value > 0 ? 12 : 0,
                        (item.value / reportFlowMax) * 100,
                      )}%`;

                      return (
                        <div key={item.label} className="flex h-full flex-col justify-end gap-3">
                          <div className={`text-center text-sm font-semibold ${item.text}`}>
                            {formatKES(item.value)}
                          </div>
                          <div className="flex min-h-0 flex-1 items-end rounded-2xl bg-white/5 p-2">
                            <div
                              className={`w-full rounded-xl bg-gradient-to-t ${item.color} shadow-lg`}
                              style={{ height }}
                            />
                          </div>
                          <div className="text-center text-xs uppercase tracking-[0.16em] text-slate-400">
                            {item.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
                    <div>
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                        <span>Money in</span>
                        <span className="font-medium text-emerald-300">
                          {formatKES(extracted.totalIncome)}
                        </span>
                      </div>
                      <div className="mt-2 h-4 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300"
                          style={{
                            width: `${Math.max(
                              extracted.totalIncome > 0 ? 8 : 0,
                              (extracted.totalIncome / reportFlowMax) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                        <span>Money out</span>
                        <span className="font-medium text-rose-300">
                          {formatKES(extracted.totalExpenses)}
                        </span>
                      </div>
                      <div className="mt-2 h-4 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-300"
                          style={{
                            width: `${Math.max(
                              extracted.totalExpenses > 0 ? 8 : 0,
                              (extracted.totalExpenses / reportFlowMax) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Cashflow direction
                      </div>
                      <div
                        className={`mt-2 text-2xl font-semibold ${
                          extracted.netCashflow >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {extracted.netCashflow >= 0 ? "+" : ""}
                        {formatKES(extracted.netCashflow)}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        This compares total money received against total money paid out in the
                        extracted report period.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  AI visual summary
                </div>
                <h3 className="mt-2 text-base font-semibold text-white">
                  {visuals?.headline ?? analysis.summary}
                </h3>
                <p className="mt-2 text-sm text-slate-200">{analysis.executiveSummary}</p>
              </div>

              {visuals ? (
                <div className="grid gap-4 lg:grid-cols-[0.62fr_0.38fr]">
                  <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="text-sm font-medium text-white">Cashflow visual</div>
                    {visuals.cashflowBars.map((bar) => {
                      const width = `${Math.max(8, (Math.abs(bar.value) / maxBarValue) * 100)}%`;
                      const color =
                        bar.tone === "income"
                          ? "bg-emerald-400"
                          : bar.tone === "expense"
                            ? "bg-rose-400"
                            : bar.value >= 0
                              ? "bg-sky-400"
                              : "bg-amber-400";

                      return (
                        <div key={bar.label} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                            <span>{bar.label}</span>
                            <span>{formatKES(bar.value)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <div className={`h-full rounded-full ${color}`} style={{ width }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="text-sm font-medium text-white">Risk gauge</div>
                    <div className="mt-4">
                      <div className="flex items-end justify-between">
                        <span className="text-4xl font-semibold text-white">
                          {visuals.riskGauge.score}
                        </span>
                        <Badge variant={analysis.riskLevel === "HIGH" ? "danger" : "accent"}>
                          {visuals.riskGauge.label}
                        </Badge>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400"
                          style={{ width: `${visuals.riskGauge.score}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {visuals.visualNotes.map((note) => (
                        <div key={note} className="text-xs text-slate-300">
                          {note}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white">Findings</h3>
                  {analysis.findings.map((finding) => (
                    <div
                      key={finding}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300"
                    >
                      {finding}
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white">Recommendations</h3>
                  {analysis.recommendations.map((recommendation) => (
                    <div
                      key={recommendation}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300"
                    >
                      {recommendation}
                    </div>
                  ))}
                </div>
              </div>

              {extracted.recurringEntities.length ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white">Recurring entities</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {extracted.recurringEntities.map((entity) => (
                      <div
                        key={entity.name}
                        className="rounded-xl border border-white/10 bg-slate-950/40 p-3"
                      >
                        <div className="text-sm font-medium text-white">{entity.name}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {entity.count} entries · {formatKES(entity.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {rows.length ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-white">
                      <ReceiptText className="h-4 w-4 text-sky-300" />
                      Extracted transactions
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{filteredRows.length} visible</Badge>
                      <Badge variant="outline">{rows.length} extracted</Badge>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    <Input
                      value={transactionSearch}
                      onChange={(event) => {
                        setTransactionSearch(event.target.value);
                        setEntityInsight(null);
                      }}
                      placeholder="Search name, till, paybill, reference, or type..."
                      className="bg-slate-950/40"
                    />
                    <div className="flex flex-wrap gap-2">
                      {(["ALL", "IN", "OUT", "UNKNOWN"] as const).map((direction) => (
                        <Button
                          key={direction}
                          type="button"
                          size="sm"
                          variant={directionFilter === direction ? "default" : "outline"}
                          onClick={() => setDirectionFilter(direction)}
                        >
                          {direction}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {transactionSearch.trim() ? (
                    <div className="space-y-4 rounded-xl border border-sky-400/20 bg-sky-400/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-sky-200">
                            Person / entity intelligence
                          </div>
                          <h3 className="mt-2 text-base font-semibold text-white">
                            {entityRows.length
                              ? `${entityRows.length} matching transactions for "${transactionSearch.trim()}"`
                              : `No matches for "${transactionSearch.trim()}"`}
                          </h3>
                          {entityPeriod.first && entityPeriod.last ? (
                            <p className="mt-1 text-xs text-slate-300">
                              {entityPeriod.first.toLocaleDateString("en-KE")} to{" "}
                              {entityPeriod.last.toLocaleDateString("en-KE")}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={analyzeEntity}
                          disabled={!entityRows.length || isEntityPending}
                        >
                          {isEntityPending ? <Loader2 className="animate-spin" /> : <ScanSearch />}
                          AI analyze
                        </Button>
                      </div>

                      {entityRows.length ? (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                              <div className="text-xs text-slate-400">Received</div>
                              <div className="mt-1 text-lg font-semibold text-emerald-300">
                                {formatKES(entityIncoming)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                              <div className="text-xs text-slate-400">Sent / paid</div>
                              <div className="mt-1 text-lg font-semibold text-rose-300">
                                {formatKES(entityOutgoing)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                              <div className="text-xs text-slate-400">Net with this entity</div>
                              <div className="mt-1 text-lg font-semibold text-white">
                                {formatKES(entityNet)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                              <div className="text-xs text-slate-400">Largest movement</div>
                              <div className="mt-1 text-lg font-semibold text-white">
                                {formatKES(entityLargest?.amount)}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-white">
                                  Money in vs money out
                                </div>
                                <div className="mt-1 text-xs text-slate-400">
                                  Visual comparison for the current search results.
                                </div>
                              </div>
                              <Badge variant={entityNet >= 0 ? "success" : "danger"}>
                                {entityNet >= 0 ? "Net positive" : "Net negative"} ·{" "}
                                {formatKES(entityNet)}
                              </Badge>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                                  <span>Money in</span>
                                  <span className="font-medium text-emerald-300">
                                    {formatKES(entityIncoming)}
                                  </span>
                                </div>
                                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300"
                                    style={{
                                      width: `${Math.max(
                                        entityIncoming > 0 ? 6 : 0,
                                        (entityIncoming / entityBarMax) * 100,
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                                  <span>Money out</span>
                                  <span className="font-medium text-rose-300">
                                    {formatKES(entityOutgoing)}
                                  </span>
                                </div>
                                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-300"
                                    style={{
                                      width: `${Math.max(
                                        entityOutgoing > 0 ? 6 : 0,
                                        (entityOutgoing / entityBarMax) * 100,
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {entityTypes.length ? (
                            <div className="flex flex-wrap gap-2">
                              {entityTypes.map(([type, count]) => (
                                <Badge key={type} variant="outline">
                                  {type} · {count}
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          {entityInsight ? (
                            <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={
                                    entityInsight.provider === "openrouter" ? "success" : "outline"
                                  }
                                >
                                  {entityInsight.provider === "openrouter"
                                    ? "OpenRouter Minimax"
                                    : "Local AI fallback"}
                                </Badge>
                                <span className="text-xs text-slate-400">
                                  {entityInsight.model}
                                </span>
                              </div>
                              <p className="text-sm leading-6 text-slate-200">
                                {entityInsight.summary}
                              </p>
                              <div className="grid gap-3 lg:grid-cols-2">
                                <div className="space-y-2">
                                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                    Findings
                                  </div>
                                  {entityInsight.findings.map((finding) => (
                                    <div key={finding} className="text-sm text-slate-300">
                                      {finding}
                                    </div>
                                  ))}
                                </div>
                                <div className="space-y-2">
                                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                    Recommendations
                                  </div>
                                  {entityInsight.recommendations.map((recommendation) => (
                                    <div key={recommendation} className="text-sm text-slate-300">
                                      {recommendation}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-[0.58fr_0.42fr]">
                    <div className="max-h-[420px] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/30 scrollbar-thin">
                      {filteredRows.map(({ row, index }) => {
                        const active = index === selectedRowIndex;
                        return (
                          <button
                            key={`${row.reference ?? row.raw}-${index}`}
                            type="button"
                            onClick={() => setSelectedRowIndex(index)}
                            className={`grid w-full grid-cols-[1fr_auto] gap-3 border-b border-white/10 px-4 py-3 text-left transition last:border-b-0 ${
                              active ? "bg-sky-400/10" : "hover:bg-white/5"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="truncate text-sm font-medium text-white">
                                  {row.entity ?? "Unknown entity"}
                                </div>
                                {row.transactionType ? (
                                  <Badge variant="outline" className="shrink-0">
                                    {row.transactionType.replace(/_/g, " ")}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                                {row.reference ? <span>{row.reference}</span> : null}
                                {row.date ? (
                                  <span>
                                    {new Date(row.date).toLocaleString("en-KE", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                ) : null}
                                {row.counterpartyAccount ? (
                                  <span>{row.counterpartyAccount}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-sm font-semibold ${
                                  row.direction === "IN"
                                    ? "text-emerald-300"
                                    : row.direction === "OUT"
                                      ? "text-rose-300"
                                      : "text-slate-300"
                                }`}
                              >
                                {row.direction === "IN" ? "+" : row.direction === "OUT" ? "-" : ""}
                                {formatKES(row.amount)}
                              </div>
                              {row.balance !== null && row.balance !== undefined ? (
                                <div className="mt-1 text-xs text-slate-500">
                                  Bal {formatKES(row.balance)}
                                </div>
                              ) : (
                                <div className="mt-1 text-xs text-slate-500">{row.direction}</div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {!filteredRows.length ? (
                        <div className="p-6 text-sm text-slate-400">
                          No transactions match the current filters.
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                      {selectedRow ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <Badge
                              variant={
                                selectedRow.direction === "IN"
                                  ? "success"
                                  : selectedRow.direction === "OUT"
                                    ? "danger"
                                    : "outline"
                              }
                            >
                              {selectedRow.direction}
                            </Badge>
                            <span className="text-sm font-semibold text-white">
                              {formatKES(selectedRow.amount)}
                            </span>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                              Entity
                            </div>
                            <div className="mt-1 text-sm text-white">
                              {selectedRow.entity ?? "Unknown"}
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Reference
                              </div>
                              <div className="mt-1 text-sm text-slate-200">
                                {selectedRow.reference ?? "Not detected"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Type
                              </div>
                              <div className="mt-1 text-sm text-slate-200">
                                {selectedRow.transactionType?.replace(/_/g, " ") ?? "Unknown"}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Time
                              </div>
                              <div className="mt-1 text-sm text-slate-200">
                                {selectedRow.date
                                  ? new Date(selectedRow.date).toLocaleString("en-KE", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    })
                                  : "Not detected"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Balance after
                              </div>
                              <div className="mt-1 text-sm text-slate-200">
                                {selectedRow.balance !== null && selectedRow.balance !== undefined
                                  ? formatKES(selectedRow.balance)
                                  : "Not detected"}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                              Account / till / paybill
                            </div>
                            <div className="mt-1 text-sm text-slate-200">
                              {selectedRow.counterpartyAccount ?? "Not detected"}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                              Raw extracted line
                            </div>
                            <p className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300">
                              {selectedRow.raw}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="grid min-h-[360px] place-items-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <div>
                <ScanSearch className="mx-auto h-8 w-8 text-slate-500" />
                <p className="mt-3 text-sm text-slate-400">
                  Upload or paste a report to view extracted values and analysis.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
