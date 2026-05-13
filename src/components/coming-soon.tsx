import { Construction } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="grid place-items-center px-6 py-24">
      <Card className="max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-3 p-10">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/10 text-amber-300">
            <Construction className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Lands in Phase {phase}</h2>
          <p className="text-sm text-muted-foreground">{what}</p>
        </CardContent>
      </Card>
    </div>
  );
}
