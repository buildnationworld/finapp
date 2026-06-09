type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterCompletion = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function openRouterChat({
  messages,
  model = process.env.OPENROUTER_MODEL ?? "minimax/minimax-m2.5:free",
  temperature = 0.25,
  maxTokens = 900,
}: {
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.AUTH_URL ?? "http://localhost:3000",
      "X-Title": "PesaPilot AI",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenRouter request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OpenRouterCompletion;
  return data.choices?.[0]?.message?.content ?? null;
}

export function parseJsonObject<T>(input: string | null): T | null {
  if (!input) return null;

  try {
    return JSON.parse(input) as T;
  } catch {
    const match = /\{[\s\S]*\}/.exec(input);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
