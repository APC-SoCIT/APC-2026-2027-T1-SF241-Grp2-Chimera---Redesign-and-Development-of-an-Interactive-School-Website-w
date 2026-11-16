// Author: Gian Mandac
// Modified Date: 20261116
// Trigger Outbound Status Email: sent only after the Registrar previews and confirms it.
// The email carries the processing status, the Registrar's remarks and the applicant's
// requirement checklist. Only a signed-in Registrar can trigger it. The recipient, status and remarks are read
// from the database through the Registrar's own session, never taken from the request.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requirementsFor, splitChecklist } from "../_shared/requirements.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Sto. Niño Catholic School <onboarding@resend.dev>";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "*";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const statusLabels: Record<string, string> = {
  pending: "Pending", for_review: "For Review", complete: "Complete", incomplete: "Incomplete",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed." });

  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer \S+$/i.test(authorization)) return reply(401, { error: "Sign in as a Registrar." });
  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) return reply(503, { error: "Email service is not configured." });

  let reference: unknown;
  try { reference = (await req.json())?.reference_no; }
  catch { return reply(400, { error: "Invalid request." }); }
  if (typeof reference !== "string" || !/^[A-Z0-9-]{1,64}$/.test(reference)) return reply(400, { error: "Invalid reference number." });

  // Use the caller's session so the database rechecks the Registrar role.
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: application, error } = await db.rpc("get_registrar_application", { p_reference: reference });
  if (error?.code === "42501") return reply(403, { error: "Registrar access required." });
  if (error) return reply(503, { error: "Could not read the application." });
  if (!application) return reply(404, { error: "Application not found." });

  const status = statusLabels[application.status] ?? application.status;
  const remarks = application.registrar_remarks
    ? `<p><strong>Registrar remarks:</strong><br/>${escapeHtml(application.registrar_remarks).replace(/\n/g, "<br/>")}</p>`
    : "";
  const { received, missing } = splitChecklist(requirementsFor(application), application.requirement_checks ?? {});
  const listItems = (items: { label: string }[]) => items.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("");
  const checklist = `
    <p style="margin-bottom: 4px;"><strong>Requirements received by the Registrar:</strong></p>
    ${received.length ? `<ul style="margin-top: 0;">${listItems(received)}</ul>` : "<p style=\"margin-top: 0;\">None recorded yet.</p>"}
    <p style="margin-bottom: 4px;"><strong>Requirements still needed:</strong></p>
    ${missing.length ? `<ul style="margin-top: 0;">${listItems(missing)}</ul>` : "<p style=\"margin-top: 0;\">None. All required documents have been received.</p>"}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [application.email],
      subject: `Enrollment Application Update - [${application.reference_no}]`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #990000; margin-top: 0;">Sto. Niño Catholic School, Inc.</h2>
          <p>Dear ${escapeHtml(application.first_name)} ${escapeHtml(application.surname)},</p>
          <p>The Registrar's Office has updated the processing status of your enrollment application.</p>
          <div style="background: #fdf2f2; padding: 15px; border-radius: 6px; border: 1px solid #f8d7d7; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Reference number:</strong> <code>${escapeHtml(application.reference_no)}</code></p>
            <p style="margin: 0;"><strong>Status:</strong> <span style="color: #990000; font-weight: bold;">${escapeHtml(status)}</span></p>
          </div>
          ${remarks}
          ${checklist}
          <p>This status tracks the completeness of your requirements; it is not an admission decision.
             Please contact or visit the Registrar's Office for your next enrollment steps.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 0.85rem; color: #64748b;">This is an automated notification from the SNCS Management System.</p>
        </div>`,
    }),
  });

  await db.rpc("record_status_email", { p_reference: reference, p_status: application.status, p_sent: res.ok });
  if (!res.ok) return reply(502, { error: "The email provider rejected the message." });
  return reply(200, { success: true });
});
