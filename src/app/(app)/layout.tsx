import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { auth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <AppSidebar user={{ email: session.user.email, name: session.user.name }} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
