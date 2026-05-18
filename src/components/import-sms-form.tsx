"use client";

import { Loader2, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatKES } from "@/lib/utils";

type ImportResponse = {
  summary: {
    mode: "preview" | "import";
    totalMessages: number;
    parsedMessages: number;
    importedTransactions: number;
    duplicates: number;
  };
  results: Array<{
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
  }>;
};

const SAMPLE_INPUT = `RXT123ABC1 Confirmed. Ksh 2,400.00 paid to QUICKMART KAREN. on 11/5/26 at 7:10 PM. New M-PESA balance is Ksh 54,000.00.

RXT123ABC2 Confirmed. Ksh 1,250.00 paid to UBER TRIPS. on 12/5/26 at 9:05 PM. New M-PESA balance is Ksh 52,750.00.

RXT123ABC3 Confirmed. Ksh 9,500.00 received from CLIENT RETAINER 0722556677 on 13/5/26 at 10:15 AM. New M-PESA balance is Ksh 62,250.00.`;

export function ImportSmsForm() {
  const [input, setInput] = useState(SAMPLE_INPUT);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (mode: "preview" | "import") => {
    startTransition(async () => {
      const res = await fetch("/api/import/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, mode }),
      });

      if (!res.ok) {
        toast.error("Import failed");
        return;
      }

      const payload = (await res.json()) as ImportResponse;
      setResponse(payload);
      toast.success(mode === "import" ? "Transactions imported" : "Preview ready");
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="text-foreground">SMS ingestion workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="min-h-[320px] bg-slate-950/40"
            placeholder="Paste M-Pesa, Airtel Money, or bank SMS messages here..."
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => submit("preview")} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Preview extraction
            </Button>
            <Button variant="outline" onClick={() => submit("import")} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              Import and refresh intelligence
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="glass border-white/10">
          <CardHeader>
            <CardTitle className="text-foreground">Privacy posture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
              <p>
                Only the pasted message bodies are parsed. No contact list, inbox sync, or
                background SMS access is required in this web application.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
              <p>
                Every extraction and categorization decision is recorded in the audit log with
                confidence and rationale.
              </p>
            </div>
          </CardContent>
        </Card>

        {response ? (
          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-foreground">Pipeline output</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Messages</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {response.summary.totalMessages}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Parsed</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {response.summary.parsedMessages}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {response.results.map((result, index) => (
                  <div
                    key={`${result.status}-${index}`}
                    className="rounded-xl border border-white/10 bg-slate-950/30 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Badge
                        variant={
                          result.status === "imported"
                            ? "success"
                            : result.status === "duplicate"
                              ? "warning"
                              : result.status === "rejected"
                                ? "danger"
                                : "accent"
                        }
                      >
                        {result.status}
                      </Badge>
                      {result.transaction ? (
                        <div className="text-sm font-medium text-slate-200">
                          {formatKES(result.transaction.amount)}
                        </div>
                      ) : null}
                    </div>
                    <p className="line-clamp-3 text-sm text-slate-300">{result.rawText}</p>
                    {result.transaction ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                        <span>{result.transaction.category}</span>
                        <span>{result.transaction.direction}</span>
                        <span>{result.transaction.type}</span>
                        <span>{Math.round(result.transaction.confidence * 100)}% confidence</span>
                      </div>
                    ) : null}
                    {result.reason ? (
                      <p className="mt-2 text-xs text-rose-300">{result.reason}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
