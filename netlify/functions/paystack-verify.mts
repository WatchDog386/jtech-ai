import type { Context, Config } from "@netlify/functions";

export default async (request: Request, _context: Context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference");

  if (!reference) {
    return Response.json({ error: "Missing transaction reference" }, { status: 400 });
  }

  const secretKey =
    process.env.VITE_PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.NEXT_PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    return Response.json({ error: "Paystack secret key is not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: `Paystack API error: ${response.status} ${response.statusText}`, details: errorText },
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
