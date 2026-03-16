import type { Context, Config } from "@netlify/functions";

// Configure Netlify function timeout (Max 26 seconds on paid tier, expanding to 60 for better margins on background)
export const config: Config = {
  timeout: 60,
};

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export default async (request: Request, _context: Context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const envKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const apiKey = envKey ? envKey.replace(/^"|"$/g, '').replace(/\r?\n|\r/g, '').trim() : undefined;

  if (!apiKey) {
    return Response.json(
      { error: "Gemini API key not configured on server" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { model, contents, generationConfig } = body as {
      model?: string;
      contents: unknown;
      generationConfig?: unknown;
    };

    const geminiModel = model || "gemini-1.5-flash";
    const url = `${GEMINI_API_BASE}/${geminiModel}:generateContent?key=${apiKey}`;

    const geminiBody: Record<string, unknown> = { contents };
    if (generationConfig) {
      geminiBody.generationConfig = generationConfig;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorText = await response.text().catch(() => "Unknown error");
      const geminiErrorMsg = errorData?.error?.message || errorText;
      return Response.json(
        { error: `Gemini API error: ${response.status} ${response.statusText}`, details: geminiErrorMsg },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
};
