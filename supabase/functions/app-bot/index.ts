import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the intelligent assistant for the Cashflow Companion (Staffing Global) web platform.
Your main job is to help users (employees and admins) get summaries, check statuses, and navigate the web platform to view their reports.

RULES:
1. Respond in a professional, clear, and friendly manner in English.
2. If the user asks for a report, financial summary, or to approve expenses, respond with useful information and provide a direct link to the corresponding view in the app (e.g., /reports or /invoices).
3. You are an AI integrated into the web app, so you can tell the user to navigate to sections using the left sidebar.
4. Keep your answers structured using bullet points or bold text for easy reading.`;

Deno.serve(async (req) => {
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const question = body.question;
    const history = body.history || [];

    if (!question) {
      return new Response(JSON.stringify({ error: "No question provided" }), { status: 400, headers: corsHeaders });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    let botReply = "Hello. You need to configure the OpenAI API key in Supabase so I can assist you.";

    if (OPENAI_API_KEY) {
      try {
        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.slice(-10),
          { role: "user", content: question }
        ];

        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: messages
          }),
        });
        
        const aiData = await aiResponse.json();
        if (aiData.choices && aiData.choices.length > 0) {
          botReply = aiData.choices[0].message.content;
        } else {
          console.error("OpenAI Error:", aiData);
        }
      } catch (err) {
        console.error("AI execution error:", err);
        botReply = "Sorry, I had trouble connecting to the AI service.";
      }
    }

    return new Response(JSON.stringify({ answer: botReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
  }
});
