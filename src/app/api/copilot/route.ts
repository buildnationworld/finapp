import { ChatRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { answerCopilotQuestion } from "@/lib/finance";

const payloadSchema = z.object({
  question: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const answer = await answerCopilotQuestion(session.user.id, parsed.data.question);
  const sessionRecord =
    (await prisma.chatSession.findFirst({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await prisma.chatSession.create({
      data: {
        userId: session.user.id,
        title: parsed.data.question.slice(0, 48),
      },
    }));

  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: sessionRecord.id,
        role: ChatRole.USER,
        content: parsed.data.question,
        citedTxIds: [],
      },
      {
        sessionId: sessionRecord.id,
        role: ChatRole.ASSISTANT,
        content: answer.answer,
        citedTxIds: answer.citedTxIds,
        modelId: "heuristic-copilot-v1",
      },
    ],
  });

  return NextResponse.json(answer);
}
