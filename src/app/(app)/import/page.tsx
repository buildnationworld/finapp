import { ImportSmsForm } from "@/components/import-sms-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/finance";

export const metadata = { title: "Import · PesaPilot AI" };

export default async function ImportPage() {
  const session = await auth();
  const data = await getWorkspaceData(session!.user.id);

  return (
    <>
      <PageHeader
        title="Import"
        description="Paste SMS messages or structured alerts and let the extraction and categorization agents convert them into financial intelligence."
      />
      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Imported transactions
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {data.transactions.length}
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Connected accounts
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {
                  new Set(
                    data.transactions
                      .map((transaction) => transaction.account?.provider)
                      .filter(Boolean),
                  ).size
                }
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Audit-ready pipeline
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="success">Extraction</Badge>
                <Badge variant="accent">Categorization</Badge>
                <Badge variant="outline">Refresh</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <ImportSmsForm />
      </div>
    </>
  );
}
