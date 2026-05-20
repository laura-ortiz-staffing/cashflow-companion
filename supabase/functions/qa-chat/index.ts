// Q&A assistant for Petty Cash app — answers questions about Colombian
// petty cash, accounting, invoices, and how to use the app. Uses Lovable AI.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the Q&A assistant for the "Petty Cash" app used by Staffing Global, a Colombian company.
Your audience includes international users (e.g. team members in India) who may not know Colombian financial concepts.

Goals:
- Explain Colombian petty cash, accounting basics, invoice/receipt requirements (factura electrónica, RUT, NIT, IVA, retención), and expense documentation in clear, simple English.
- Help users understand how to use this app: dashboard, cash inflows, invoices, requests, reports, approvals, audit log.
- Keep answers short, structured (bullet points when useful), beginner-friendly.

Important rules:
- Provide GENERAL guidance only. Do NOT give legal or tax advice as final authority.
- For company-specific decisions (limits, categories, who approves what), instruct the user to ask the Super Admin.
- If a question is outside scope (politics, unrelated topics), politely steer back.
- Always answer in English regardless of the question's language.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { question, history } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(Array.isArray(history) ? history.slice(-8) : []),
      { role: "user", content: question.slice(0, 2000) },
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages }),
    });

    if (!r.ok) {
      const text = await r.text();
      return new Response(JSON.stringify({ error: "ai_error", detail: text.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate an answer.";
    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
