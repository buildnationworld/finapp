import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/finance";
import { formatKES } from "@/lib/utils";

export const metadata = { title: "Transactions · PesaPilot AI" };

export default async function TransactionsPage() {
  const session = await auth();
  const data = await getWorkspaceData(session!.user.id);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every parsed transaction, with the raw SMS and agent decisions one click away."
      />
      <div className="space-y-6 px-6 py-6">
        <Card className="glass overflow-hidden border-white/10">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Counterparty</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-t border-white/10">
                      <td className="px-4 py-4 text-slate-300">
                        {transaction.occurredAt.toLocaleDateString("en-KE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-white">
                          {transaction.counterpartyName ?? transaction.merchant ?? "Unknown"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {transaction.account?.provider ?? "Wallet"} ·{" "}
                          {transaction.externalRef ?? "No ref"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline">{transaction.category?.name ?? "Other"}</Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-300">{transaction.type}</td>
                      <td className="px-4 py-4 text-slate-300">
                        {Math.round(transaction.confidence * 100)}%
                      </td>
                      <td
                        className={`px-4 py-4 text-right font-medium ${transaction.direction === "IN" ? "text-emerald-300" : "text-rose-300"}`}
                      >
                        {transaction.direction === "IN" ? "+" : "-"}
                        {formatKES(Number(transaction.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {data.transactions.slice(0, 4).map((transaction) => (
            <Card key={transaction.id} className="glass border-white/10">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">
                      {transaction.counterpartyName ?? transaction.merchant ?? "Unknown"}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {transaction.externalRef ?? "No reference code"}
                    </div>
                  </div>
                  <Badge variant="accent">{transaction.type}</Badge>
                </div>
                <p className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
                  {transaction.rawText}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
