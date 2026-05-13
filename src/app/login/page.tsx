import { Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { auth } from "@/lib/auth";

export const metadata = { title: "Sign in · PesaPilot AI" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  if (session?.user) redirect(params.next ?? "/dashboard");

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-6">
      <div className="absolute inset-0 -z-10 bg-grid opacity-20" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[400px] bg-radial-fade" />

      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">PesaPilot AI</span>
        </Link>

        <div className="glass rounded-xl p-6">
          <h1 className="mb-1 text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mb-6 text-sm text-muted-foreground">Sign in to your AI financial OS.</p>
          <LoginForm next={params.next} />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo: <code className="rounded bg-secondary px-1.5 py-0.5">demo@pesapilot.ai</code> /{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5">demo1234</code>
        </p>
      </div>
    </div>
  );
}
