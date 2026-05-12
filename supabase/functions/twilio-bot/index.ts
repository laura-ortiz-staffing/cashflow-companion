import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Eres el asistente financiero inteligente de Staffing Global, interactuando con los usuarios a través de SMS o WhatsApp.
Tu objetivo es ayudar con el sistema "Cashflow Companion".

REGLAS:
1. Si el usuario hace una pregunta general sobre finanzas, contabilidad, o cómo usar la app, respóndele de manera útil y concisa (es un SMS, no te extiendas demasiado).
2. Si el usuario pide un REPORTE financiero (Excel o PDF) o pide aprobar gastos, infórmale que por seguridad esos archivos y acciones están disponibles en la plataforma web.
3. Para darles acceso rápido, siempre incluye este link cuando pidan reportes: "https://tudominio.com/reports" (reemplazarán esto luego).
4. No des asesoría legal o tributaria final, solo guía general.
5. Usa un tono profesional pero amable.`;

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

Deno.serve(async (req) => {
  // Manejo de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Leer los datos enviados por Twilio (application/x-www-form-urlencoded)
    const textData = await req.text();
    const params = new URLSearchParams(textData);
    const body = params.get("Body") || "";
    const fromPhone = params.get("From") || "";

    console.log(`Mensaje recibido de ${fromPhone}: ${body}`);

    if (!body) {
      return new Response("No body provided", { status: 400 });
    }

    // 2. Procesar con Inteligencia Artificial (OpenAI)
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    let botReply = "Hola. Soy el asistente de Staffing Global. Necesitas configurar la llave de OpenAI en Supabase para que pueda responderte de forma inteligente.";

    if (OPENAI_API_KEY) {
      try {
        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini", // Rápido y económico
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: `(Mensaje de ${fromPhone}): ${body}` }
            ]
          }),
        });
        
        const aiData = await aiResponse.json();
        if (aiData.choices && aiData.choices.length > 0) {
          botReply = aiData.choices[0].message.content;
        } else {
          console.error("Respuesta vacía de OpenAI:", aiData);
        }
      } catch (err) {
        console.error("Error conectando con la IA:", err);
        botReply = "Lo siento, tuve un problema procesando tu mensaje. Intenta de nuevo más tarde.";
      }
    }

    // 3. Responder a Twilio usando formato XML (TwiML)
    // Twilio automáticamente tomará este XML y se lo enviará como SMS al usuario.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${escapeXml(botReply)}</Message>
</Response>`;

    return new Response(twiml, {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
