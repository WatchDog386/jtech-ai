import type { Context } from "@netlify/functions";

export default async (request: Request, _context: Context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secretKey =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.VITE_PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    return Response.json(
      { error: "Paystack secret key not configured on server" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { reference } = body as { reference: string };

    if (!reference) {
      return Response.json(
        { error: "Missing transaction reference" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    if (!response.ok) {
      return Response.json(
        { error: `Paystack API error: ${response.status} ${response.statusText}` },
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
