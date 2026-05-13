import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/finance";

export const metadata = { title: "Audit log · PesaPilot AI" };

export default async function AuditPage() {
  const session = await auth();
  const data = await getWorkspaceData(session!.user.id);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every agent decision, with confidence, latency, model, and a human-readable rationale."
      />
      <div className="space-y-4 px-6 py-6">
        {data.auditLogs.map((log) => (
          <Card key={log.id} className="glass border-white/10">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="accent">{log.agent}</Badge>
                  <Badge variant="outline">{log.modelId ?? "n/a"}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{log.latencyMs}ms</span>
                  <span>·</span>
                  <span>
                    {log.confidence
                      ? `${Math.round(log.confidence * 100)}% confidence`
                      : "no confidence score"}
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-200">{log.explanation}</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-xs text-slate-300">
                  {JSON.stringify(log.input, null, 2)}
                </pre>
                <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-xs text-slate-300">
                  {JSON.stringify(log.output, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
