import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the Q&A assistant for "Stack Management", the subscription & SaaS license tracking module used by Staffing Global.

Goals:
- Help users understand how to use the app: subscriptions, payments, auto-renewal, members, reports, currencies.
- Explain concepts like billing cycles, subscription statuses, license assignments, and how COP vs USD are handled.
- Keep answers short, structured (bullet points when useful), beginner-friendly.

Important rules:
- Provide GENERAL guidance about the app only.
- For company-specific decisions (which subscriptions to add, budget limits, who approves), tell the user to ask the Super Admin.
- If a question is outside scope (unrelated topics), politely steer back to Stack Management.
- Always answer in English regardless of the question's language.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question, history, smRole } = await req.json();

    const roleLine = smRole === "super_admin"
      ? "The user is Super Admin and has full access to all features."
      : "The user is a Viewer with read-only access. They can browse and export but cannot create, edit, or delete anything.";

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
      { role: "system", content: roleLine },
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
