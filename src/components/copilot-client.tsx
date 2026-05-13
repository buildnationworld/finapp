"use client";

import { Bot, Loader2, Send, User2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Message = {
  role: "USER" | "ASSISTANT";
  content: string;
  citedTxIds?: string[];
};

const SUGGESTIONS = [
  "How much did I spend on food this month?",
  "What is my biggest expense?",
  "Did my salary increase?",
  "Predict my expenses next week.",
  "Detect suspicious transactions.",
] as const;

export function CopilotClient({
  initialMessages,
}: {
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const renderedMessages = useMemo(
    () =>
      messages.length
        ? messages
        : [
            {
              role: "ASSISTANT" as const,
              content:
                "Ask about spending, salary, fraud, forecasts, or transaction categories. I answer against your imported financial history and return cited rows.",
            },
          ],
    [messages],
  );

  const ask = (question: string) => {
    if (!question.trim()) return;

    const userMessage: Message = { role: "USER", content: question.trim() };
    setMessages((current) => [...current, userMessage]);
    setInput("");

    startTransition(async () => {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      if (!res.ok) return;
      const payload = (await res.json()) as { answer: string; citedTxIds: string[] };
      setMessages((current) => [
        ...current,
        { role: "ASSISTANT", content: payload.answer, citedTxIds: payload.citedTxIds },
      ]);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.72fr_0.28fr]">
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="text-foreground">Financial copilot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[560px] space-y-4 overflow-y-auto pr-2 scrollbar-thin">
            {renderedMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-2xl border p-4 ${message.role === "ASSISTANT" ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/10 bg-white/5"}`}
              >
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                  {message.role === "ASSISTANT" ? (
                    <Bot className="h-3.5 w-3.5" />
                  ) : (
                    <User2 className="h-3.5 w-3.5" />
                  )}
                  {message.role === "ASSISTANT" ? "Copilot" : "You"}
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-100">{message.content}</p>
                {message.citedTxIds?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.citedTxIds.slice(0, 6).map((txId) => (
                      <Badge
                        key={txId}
                        variant="outline"
                        className="border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
                      >
                        {txId.slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-500/30 hover:text-white"
                onClick={() => ask(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about spend, income trends, suspicious activity, or forecasts..."
              className="min-h-[120px] bg-slate-950/40"
            />
            <Button onClick={() => ask(input)} disabled={isPending || !input.trim()}>
              {isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Ask copilot
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="text-foreground">How it reasons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            It queries structured transactions first, not raw language alone.
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            Answers cite transaction IDs so the user can audit the numbers.
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            Forecast and anomaly prompts reuse the same financial intelligence layer that powers the
            dashboard and reports.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
