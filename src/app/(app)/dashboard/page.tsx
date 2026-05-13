import { ArrowUpRight, ShieldAlert, Sparkles, Wallet } from "lucide-react";

import { BurnRateChart, CashflowChart, CategoryDonut } from "@/components/dashboard-charts";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/finance";
import { formatKES } from "@/lib/utils";

export const metadata = { title: "Dashboard · PesaPilot AI" };

export default async function DashboardPage() {
  const session = await auth();
  const data = await getWorkspaceData(session!.user.id);
  const { snapshot, alerts } = data;

  const metricCards = [
    {
      label: "Monthly income",
      value: formatKES(snapshot.monthlyIncome),
      detail: "Money received from salary, clients, and transfers",
    },
    {
      label: "Monthly expenses",
      value: formatKES(snapshot.monthlyExpenses),
      detail: "Outgoing money across all imported channels",
    },
    {
      label: "Money sent",
      value: formatKES(snapshot.sent),
      detail: "Direct person-to-person transfers this month",
    },
    {
      label: "Money received",
      value: formatKES(snapshot.received),
      detail: "Direct transfers received this month",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your AI financial operating system in one view: inflows, outflows, risk, forecast, and recommendations."
      />
      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="glass overflow-hidden border-white/10">
            <CardContent className="relative p-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.14),transparent_28%)]" />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Badge variant="accent" className="mb-4">
                    AI Financial Operating System
                  </Badge>
                  <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-white">
                    PesaPilot is tracking your cashflow, surfacing risk, and forecasting next moves.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm text-slate-300">
                    Imported transaction data is being normalized into structured intelligence with
                    explainable agent decisions.
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <div className="flex items-center gap-2 text-sm text-emerald-200">
                      <Wallet className="h-4 w-4" />
                      Net cashflow
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {formatKES(snapshot.net)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4">
                    <div className="flex items-center gap-2 text-sm text-sky-200">
                      <ShieldAlert className="h-4 w-4" />
                      Financial score
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {snapshot.financialScore}/100
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-foreground">AI insight feed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.insights.map((insight) => (
                <div key={insight.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Badge variant={insight.severity === "HIGH" ? "danger" : "accent"}>
                      {insight.kind}
                    </Badge>
                    <Sparkles className="h-4 w-4 text-emerald-300" />
                  </div>
                  <h3 className="text-sm font-medium text-white">{insight.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{insight.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((metric) => (
            <Card key={metric.label} className="glass border-white/10">
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  {metric.label}
                </div>
                <div className="mt-3 text-3xl font-semibold text-white">{metric.value}</div>
                <p className="mt-2 text-sm text-slate-400">{metric.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-foreground">Weekly cashflow</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CashflowChart data={snapshot.weeklySeries} />
            </CardContent>
          </Card>
          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-foreground">Spending breakdown</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CategoryDonut data={snapshot.categoryBreakdown} />
              <div className="mt-3 space-y-2">
                {snapshot.categoryBreakdown.slice(0, 5).map((category) => (
                  <div key={category.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.label}
                    </div>
                    <span className="font-medium text-white">{formatKES(category.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-foreground">Risk alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4"
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <Badge variant="danger">{alert.rule}</Badge>
                    <span className="text-rose-200">{Math.round(alert.score * 100)}%</span>
                  </div>
                  <p className="text-sm text-slate-100">{alert.explanation}</p>
                  <p className="mt-2 text-xs text-slate-300">
                    {alert.transaction.counterpartyName ??
                      alert.transaction.merchant ??
                      "Unknown counterparty"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-foreground">14-day spend velocity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <BurnRateChart data={snapshot.dailyBurn} />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {snapshot.topCounterparties.slice(0, 3).map((counterparty) => (
                  <div
                    key={counterparty.label}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Top flow
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-200">{counterparty.label}</span>
                      <ArrowUpRight className="h-4 w-4 text-emerald-300" />
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {formatKES(counterparty.value)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
