import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const resend = new Resend(resendApiKey);

interface EmailQueueItem {
  id: number;
  tenant_id: string;
  recipient_email: string;
  subject: string;
  body_html: string;
  template_type: string;
}

Deno.serve(async (req) => {
  try {
    // Get pending emails from queue
    const { data: emails, error: fetchError } = await supabase
      .from("email_queue")
      .select("*")
      .eq("status", "pending")
      .lt("attempts", 3) // Max 3 attempts
      .limit(10);

    if (fetchError) {
      console.error("Error fetching emails:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch emails" }),
        { status: 500 }
      );
    }

    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending emails" }),
        { status: 200 }
      );
    }

    let successCount = 0;
    let failureCount = 0;

    // Process each email
    for (const email of emails as EmailQueueItem[]) {
      try {
        // Send via Resend
        const response = await resend.emails.send({
          from: "TWINCO Pádel <noreply@twincopadelx.com>",
          to: email.recipient_email,
          subject: email.subject,
          html: email.body_html,
        });

        if (response.error) {
          // Mark as failed
          await supabase
            .from("email_queue")
            .update({
              status: "failed",
              error_message: response.error.message,
              attempts: email.attempts + 1,
            })
            .eq("id", email.id);
          failureCount++;
        } else {
          // Mark as sent
          await supabase
            .from("email_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", email.id);
          successCount++;
        }
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);
        // Increment attempts
        await supabase
          .from("email_queue")
          .update({
            attempts: email.attempts + 1,
            error_message: String(error),
          })
          .eq("id", email.id);
        failureCount++;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Email processing complete",
        processed: emails.length,
        success: successCount,
        failed: failureCount,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in process-email-queue:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500 }
    );
  }
});
