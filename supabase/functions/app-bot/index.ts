import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the intelligent assistant for the Cashflow Companion (Staffing Global) web platform.
Your main job is to help users check their invoices, get summaries, and navigate the web platform.

RULES:
1. Respond in a professional, clear, and friendly manner.
2. IMPORTANT: If the user asks about their invoices, records, or pending expenses, ALWAYS use the provided tools (like get_recent_invoices) to check the database and give them a factual answer. Do NOT just tell them to look at the UI.
3. If they ask to approve expenses, or view detailed reports, provide a direct link to the corresponding view in the app (e.g., /reports or /invoices).
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
    const accessContext: string = body.accessContext ?? "User role: unknown. Apply standard restrictions.";
    const permissions: string[] = body.permissions ?? [];

    if (!question) {
      return new Response(JSON.stringify({ error: "No question provided" }), { status: 400, headers: corsHeaders });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    let botReply = "Hello. You need to configure the OpenAI API key in Supabase so I can assist you.";
    let pdfParams: { from: string; to: string; category: string; status: string; periodLabel: string } | null = null;

    if (OPENAI_API_KEY) {
      const authHeader = req.headers.get("Authorization");
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader || "" } } }
      );

      const tools = [
        {
          type: "function",
          function: {
            name: "get_recent_invoices",
            description: "Fetch recent invoices for the user to check status or existence of records.",
            parameters: {
              type: "object",
              properties: {
                limit: { type: "number", description: "Number of invoices to fetch (default 5)" },
                status: { type: "string", description: "Filter by status", enum: ["submitted", "under_review", "approved", "rejected"] }
              }
            }
          }
        },
        {
          type: "function",
          function: {
            name: "download_report",
            description: "Generate a downloadable PDF report for a date range. Only call this if the user explicitly asks to download or generate a report PDF.",
            parameters: {
              type: "object",
              required: ["from_date", "to_date"],
              properties: {
                from_date: { type: "string", description: "Start date in YYYY-MM-DD format" },
                to_date: { type: "string", description: "End date in YYYY-MM-DD format" },
                category: { type: "string", description: "Category filter, use 'all' if not specified", default: "all" },
                status: { type: "string", description: "Status filter, use 'all' if not specified", default: "all" }
              }
            }
          }
        }
      ];

      // Only expose the invoices tool if the user has permission
      const visibleTools = permissions.includes("invoices") || body.role === "super_admin" ? tools : [];

      let messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `--- ACCESS CONTEXT ---\n${accessContext}\n--- END CONTEXT ---` },
        ...history.slice(-10),
        { role: "user", content: question }
      ];

      let finished = false;
      let attempts = 0;

      while (!finished && attempts < 4) {
        attempts++;
        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: messages,
            ...(visibleTools.length > 0 ? { tools: visibleTools, tool_choice: "auto" } : {})
          }),
        });
        
        const aiData = await aiResponse.json();
        if (aiData.error) {
          console.error("OpenAI Error:", aiData.error);
          botReply = "Sorry, I had an error connecting to the AI service.";
          break;
        }

        const responseMessage = aiData.choices[0].message;
        messages.push(responseMessage);

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          for (const toolCall of responseMessage.tool_calls) {
            if (toolCall.function.name === "get_recent_invoices") {
              const args = JSON.parse(toolCall.function.arguments);
              let query = supabaseClient.from("invoices").select("*").order("created_at", { ascending: false }).limit(args.limit || 5);
              if (args.status) query = query.eq("status", args.status);
              const { data: invs, error: invErr } = await query;
              messages.push({
                role: "tool", tool_call_id: toolCall.id,
                content: invErr ? JSON.stringify({ error: invErr.message }) : JSON.stringify(invs || [])
              });
            } else if (toolCall.function.name === "download_report") {
              const args = JSON.parse(toolCall.function.arguments);
              // Check reports permission
              const hasReportsPerm = body.role === "super_admin" || (Array.isArray(body.permissions) && body.permissions.includes("reports"));
              if (!hasReportsPerm) {
                messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ error: "User does not have permission to access Reports." }) });
              } else {
                // Fetch a quick summary so the AI can describe the report
                const { data: invs } = await supabaseClient.from("invoices").select("status,amount").gte("invoice_date", args.from_date).lte("invoice_date", args.to_date);
                const approved = (invs || []).filter((i: { status: string }) => i.status === "approved");
                const total = approved.reduce((s: number, i: { amount: number }) => s + Number(i.amount), 0);
                pdfParams = {
                  from: args.from_date, to: args.to_date,
                  category: args.category ?? "all", status: args.status ?? "all",
                  periodLabel: `${args.from_date} to ${args.to_date}`,
                };
                messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ ready: true, approvedCount: approved.length, approvedTotal: total, from: args.from_date, to: args.to_date }) });
              }
            }
          }
        } else {
          botReply = responseMessage.content;
          finished = true;
        }
      }
    }

    return new Response(JSON.stringify({ answer: botReply, ...(pdfParams ? { pdf_params: pdfParams } : {}) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
  }
});
