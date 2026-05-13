import { CopilotClient } from "@/components/copilot-client";
import { PageHeader } from "@/components/page-header";
import { auth } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/finance";

export const metadata = { title: "Copilot · PesaPilot AI" };

export default async function CopilotPage() {
  const session = await auth();
  const data = await getWorkspaceData(session!.user.id);
  const latestSession = data.sessions[0];
  const initialMessages =
    latestSession?.messages.map((message) => ({
      role: (message.role === "USER" ? "USER" : "ASSISTANT") as "USER" | "ASSISTANT",
      content: message.content,
      citedTxIds: message.citedTxIds,
    })) ?? [];

  return (
    <>
      <PageHeader
        title="Copilot"
        description="Ask anything. The AI reasons over your transactions and cites the rows it used."
      />
      <div className="px-6 py-6">
        <CopilotClient initialMessages={initialMessages} />
      </div>
    </>
  );
}
