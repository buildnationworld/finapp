import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/finance";
import { formatKES } from "@/lib/utils";

export const metadata = { title: "Reports · PesaPilot AI" };

export default async function ReportsPage() {
  const session = await auth();
  const data = await getWorkspaceData(session!.user.id);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Daily, weekly, monthly, and yearly summaries — downloadable as PDF."
      />
      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Available reports
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">{data.reports.length}</div>
            </CardContent>
          </Card>
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Current month net
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatKES(data.snapshot.net)}
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Financial score
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {data.snapshot.financialScore}/100
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {data.reports.map((report) => {
            const summary = report.summary as {
              monthlyIncome: number;
              monthlyExpenses: number;
              net: number;
              financialScore: number;
              insights?: Array<{ title: string; body: string }>;
            };
            return (
              <Card key={report.id} className="glass border-white/10">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-foreground">{report.period} report</CardTitle>
                      <p className="mt-1 text-sm text-slate-400">
                        {report.periodStart.toLocaleDateString("en-KE")} to{" "}
                        {report.periodEnd.toLocaleDateString("en-KE")}
                      </p>
                    </div>
                    <Badge variant="accent">AI generated</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Income
                      </div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {formatKES(summary.monthlyIncome)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Expenses
                      </div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {formatKES(summary.monthlyExpenses)}
                      </div>
                    </div>
                  </div>

                  {summary.insights?.slice(0, 2).map((insight) => (
                    <div
                      key={insight.title}
                      className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    >
                      <div className="text-sm font-medium text-white">{insight.title}</div>
                      <p className="mt-2 text-sm text-slate-300">{insight.body}</p>
                    </div>
                  ))}

                  <Button asChild>
                    <Link href={`/api/reports/${report.id}`}>Open PDF report</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
