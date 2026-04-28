// Extract invoice fields from an uploaded receipt/invoice using Lovable AI Gateway.
// Accepts: { fileBase64: string, mimeType: string }
// Returns: { vendor, amount, invoice_date (YYYY-MM-DD), category, confidence }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIES = [
  "office_supplies", "travel", "meals", "transport",
  "utilities", "maintenance", "marketing", "other",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileBase64, mimeType, mode } = await req.json();
    const docMode: "invoice" | "transaction" = mode === "transaction" ? "transaction" : "invoice";
    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "fileBase64 and mimeType required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf";
    if (!isImage && !isPdf) {
      return new Response(JSON.stringify({ error: "Only images and PDFs supported" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = `data:${mimeType};base64,${fileBase64}`;
    const today = new Date().toISOString().slice(0, 10);

    const isTx = docMode === "transaction";
    const systemPrompt = isTx
      ? `You extract data from mobile banking / payment app transaction screenshots (Nequi, Daviplata, Bancolombia, PSE, etc.). Today's date is ${today}. Return ONLY a JSON object via the provided tool call. amount is a positive number with no currency symbol or thousands separators. description should be a short label (recipient, reference, or transaction concept). date in YYYY-MM-DD if visible.`
      : `You extract structured data from invoices and receipts. Today's date is ${today}. Return ONLY a JSON object via the provided tool call. Map the expense to one of: ${CATEGORIES.join(", ")}. Use "other" if uncertain. Date must be YYYY-MM-DD. Amount is a number (no currency symbol). Vendor is the merchant/supplier name.`;

    const txTool = {
      type: "function" as const,
      function: {
        name: "submit_transaction_fields",
        description: "Submit extracted transaction fields",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "number", description: "Transaction amount as a positive number" },
            description: { type: "string", description: "Short label: recipient, concept or reference" },
            date: { type: "string", description: "YYYY-MM-DD if visible" },
            confidence: { type: "number" },
          },
          required: ["amount"],
          additionalProperties: false,
        },
      },
    };

    const invoiceTool = {
      type: "function" as const,
      function: {
        name: "submit_invoice_fields",
        description: "Submit extracted invoice fields",
        parameters: {
          type: "object",
          properties: {
            vendor: { type: "string" },
            amount: { type: "number" },
            invoice_date: { type: "string" },
            category: { type: "string", enum: CATEGORIES },
            confidence: { type: "number" },
          },
          required: ["vendor", "amount", "invoice_date", "category"],
          additionalProperties: false,
        },
      },
    };

    const tool = isTx ? txTool : invoiceTool;
    const userText = isTx
      ? "Extract the transaction amount and description from this payment app screenshot."
      : "Extract the invoice fields from this document.";

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: tool.function.name } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("AI gateway error", resp.status, txt);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Could not extract fields" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fields = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(fields), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extract-invoice error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
