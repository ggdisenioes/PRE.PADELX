// supabase/functions/send-whatsapp/index.ts
// Procesa la cola whatsapp_queue y envía mensajes via Meta Cloud API
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");

const GRAPH_API_VERSION = "v21.0";

interface WhatsAppQueueItem {
  id: string;
  tenant_id: string;
  to_phone: string;
  template_name: string;
  template_language: string;
  template_params: string[];
  attempts: number;
}

Deno.serve(async (req) => {
  try {
    // Auth: verificar webhook secret (mismo patrón que process-email-queue)
    if (webhookSecret) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader !== `Bearer ${webhookSecret}`) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");

    if (!phoneNumberId || !accessToken) {
      return new Response(
        JSON.stringify({
          error: "WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Obtener mensajes pendientes
    const { data: messages, error: fetchError } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .eq("status", "pending")
      .lt("attempts", 3)
      .order("created_at", { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error("Error fetching WhatsApp queue:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch queue" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending WhatsApp messages" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const msg of messages as WhatsAppQueueItem[]) {
      try {
        // Construir body para Meta Cloud API (template message)
        const templateParams = Array.isArray(msg.template_params)
          ? msg.template_params
          : [];

        const body: Record<string, unknown> = {
          messaging_product: "whatsapp",
          to: msg.to_phone.replace(/[^0-9]/g, ""), // solo dígitos
          type: "template",
          template: {
            name: msg.template_name,
            language: { code: msg.template_language || "es" },
            ...(templateParams.length > 0 && {
              components: [
                {
                  type: "body",
                  parameters: templateParams.map((val: string) => ({
                    type: "text",
                    text: String(val),
                  })),
                },
              ],
            }),
          },
        };

        const response = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (response.ok) {
          const result = await response.json();
          const metaMessageId = result?.messages?.[0]?.id ?? null;

          await supabase
            .from("whatsapp_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              meta_message_id: metaMessageId,
            })
            .eq("id", msg.id);

          sentCount++;
        } else {
          const errorText = await response.text();
          console.error(`WhatsApp API error for ${msg.id}:`, errorText);

          const newAttempts = (msg.attempts || 0) + 1;
          await supabase
            .from("whatsapp_queue")
            .update({
              attempts: newAttempts,
              error_message: `HTTP ${response.status}: ${errorText}`,
              ...(newAttempts >= 3 && { status: "failed" }),
            })
            .eq("id", msg.id);

          failedCount++;
        }
      } catch (err) {
        console.error(`Error processing WhatsApp msg ${msg.id}:`, err);
        const newAttempts = (msg.attempts || 0) + 1;
        await supabase
          .from("whatsapp_queue")
          .update({
            attempts: newAttempts,
            error_message: String(err),
            ...(newAttempts >= 3 && { status: "failed" }),
          })
          .eq("id", msg.id);
        failedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        message: "WhatsApp processing complete",
        processed: messages.length,
        sent: sentCount,
        failed: failedCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
