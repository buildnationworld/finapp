import { ArrowRight, Bot, Brain, Eye, Radar, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Bot,
    title: "Multi-agent intelligence",
    body: "Extraction, categorization, fraud, and forecast agents reason over your transactions in parallel — each decision is logged with confidence and an explanation.",
  },
  {
    icon: Radar,
    title: "Fraud detection",
    body: "Statistical baselines plus an LLM pattern classifier flag duplicates, round-number scams, and unusual late-night transfers before they hurt you.",
  },
  {
    icon: TrendingUp,
    title: "Cashflow forecasting",
    body: "Per-category moving averages projected 30 days out, with a plain-English explanation of why your transport spend is drifting up.",
  },
  {
    icon: Brain,
    title: "Semantic copilot",
    body: "Ask anything. The copilot uses pgvector RAG over your transactions and shows the exact rows it cited — no hallucinated numbers.",
  },
  {
    icon: Eye,
    title: "Glass-box governance",
    body: "Every agent decision is auditable. Confidence scores, model IDs, latency, and a human-readable rationale — for every transaction.",
  },
  {
    icon: Sparkles,
    title: "Built for mobile money",
    body: "M-Pesa, Airtel Money, Equity, KCB — regex-first parsers with an LLM fallback for novel SMS formats.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-grid opacity-20" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[600px] bg-radial-fade" />

      <header className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">PesaPilot AI</span>
        </Link>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login/signup">Sign up</Link>
          </Button>
        </div>
      </header>

      <section className="container relative pt-16 pb-24 text-center">
        <Badge variant="accent" className="mb-6">
          AI Financial Operating System · Built for emerging markets
        </Badge>
        <h1 className="mx-auto max-w-3xl text-balance text-5xl font-semibold tracking-tight md:text-6xl">
          The <span className="gradient-text">AI financial analyst</span> for your mobile money.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          PesaPilot turns your M-Pesa, Airtel Money, and bank SMS into structured intelligence. It
          categorizes, forecasts, flags fraud, and answers questions with cited transactions — not
          vibes.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/login/signup">Sign up</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#features">See how it works</a>
          </Button>
        </div>

      </section>

      <section id="features" className="container pb-24">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass rounded-xl p-6 transition-colors hover:border-primary/40"
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-base font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Hackathon build · Kenya / KES · Gemini-powered · Source-available
      </footer>
    </div>
  );
}
