// Sends a branded petty-cash report PDF via Brevo (Sendinblue).
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
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    const FROM_EMAIL = Deno.env.get("REPORT_FROM_EMAIL") ?? "laura.ortiz@staffingglobal.org";
    const FROM_NAME = Deno.env.get("REPORT_FROM_NAME") ?? "Petty Cash";

    if (!BREVO_API_KEY) {
      return json({ error: "BREVO_API_KEY not configured" }, 500);
    }

    const { to, subject, body, signature, pdfBase64, filename } = await req.json();

    if (!to || !pdfBase64) {
      return json({ error: "to and pdfBase64 are required" }, 400);
    }

    const ADDRESS = "Calle 7 #42-145, Medellín 050021";
    const sigBlock = signature?.trim()
      ? `${signature.trim()}\n${ADDRESS}`
      : ADDRESS;
    const fullText = `${body ?? ""}\n\n${sigBlock}`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: to }],
        subject: subject ?? "Staffing Global – Financial Report",
        textContent: fullText,
        attachment: [
          {
            name: filename ?? "report.pdf",
            content: pdfBase64,
          },
        ],
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("Brevo error:", result);
      return json({ error: result?.message ?? "Email delivery failed" }, 502);
    }

    return json({ ok: true, messageId: result.messageId });
  } catch (err) {
    console.error("send-report error:", err);
    return json({ error: String(err) }, 500);
  }
});
