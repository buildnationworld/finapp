import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/finance";

export const metadata = { title: "Insights · PesaPilot AI" };

export default async function InsightsPage() {
  const session = await auth();
  const data = await getWorkspaceData(session!.user.id);

  return (
    <>
      <PageHeader
        title="Insights"
        description="AI-generated trends, anomalies, recommendations, and fraud alerts."
      />
      <div className="grid gap-6 px-6 py-6 xl:grid-cols-[0.65fr_0.35fr]">
        <Card className="glass border-white/10">
          <CardHeader>
            <CardTitle className="text-foreground">Insight stream</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.insights.map((insight) => (
              <div key={insight.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <Badge variant="accent">{insight.kind}</Badge>
                    <Badge variant={insight.severity === "HIGH" ? "danger" : "outline"}>
                      {insight.severity}
                    </Badge>
                  </div>
                  <span className="text-xs text-slate-400">{insight.generatedBy}</span>
                </div>
                <h3 className="text-base font-semibold text-white">{insight.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{insight.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {insight.evidenceTxIds.slice(0, 5).map((txId) => (
                    <Badge key={txId} variant="outline">
                      {txId.slice(0, 8)}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-foreground">Fraud and anomaly alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Badge variant="danger">{alert.rule}</Badge>
                    <span className="text-sm text-rose-200">{Math.round(alert.score * 100)}%</span>
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
              <CardTitle className="text-foreground">Governance posture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Every insight includes evidence transaction IDs and a generating agent.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Fraud alerts are reproducible because the underlying rules are deterministic and
                logged.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Reports, chat, and dashboard cards reuse the same intelligence layer to avoid metric
                drift.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
