// Sends a branded petty-cash report PDF via Resend.
// POST body: { to, subject, body, signature, pdfBase64, filename }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM_EMAIL = Deno.env.get("REPORT_FROM_EMAIL") ?? "Petty Cash <noreply@staffingglobal.org>";

    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY not configured" }, 500);
    }

    const { to, subject, body, signature, pdfBase64, filename } = await req.json();

    if (!to || !pdfBase64) {
      return json({ error: "to and pdfBase64 are required" }, 400);
    }

    // Build full text body: message + signature + mandatory address
    const ADDRESS = "Calle 7 #42-145, Medellín 050021";
    const sigBlock = signature?.trim()
      ? `${signature.trim()}\n${ADDRESS}`
      : ADDRESS;
    const fullText = `${body ?? ""}\n\n${sigBlock}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: subject ?? "Staffing Global – Financial Report",
        text: fullText,
        attachments: [
          {
            filename: filename ?? "report.pdf",
            content: pdfBase64,
          },
        ],
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("Resend error:", result);
      return json({ error: result?.message ?? "Email delivery failed" }, 502);
    }

    return json({ ok: true, id: result.id });
  } catch (err) {
    console.error("send-report error:", err);
    return json({ error: String(err) }, 500);
  }
});
