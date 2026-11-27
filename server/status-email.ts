/*
 * Author: Gian Mandac
 * Created Date: 20261127
 * Trigger Outbound Status Email (Gmail): sends the Registrar's status update from the
 * Vercel backend through a Gmail account, so it reaches any applicant's personal address.
 * Only a signed-in Registrar can send it. The recipient, status, remarks and checklist are
 * read from the database through the Registrar's own session, never taken from the request.
 */
import express, { type Request, type Response } from "express";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { requirementsFor, splitChecklist, type ApplicantProfile } from "../supabase/functions/_shared/requirements.js";

export type OutgoingEmail = { from: string; to: string; replyTo: string; subject: string; text: string; html: string };
export type SendMail = (message: OutgoingEmail) => Promise<unknown>;

type Application = ApplicantProfile & {
  reference_no: string;
  status: string;
  email: string;
  first_name: string;
  surname: string;
  registrar_remarks: string | null;
  requirement_checks: Record<string, boolean> | null;
};

// School details shown on the public Contact page.
export const SCHOOL = {
  name: "Sto. Niño Catholic School, Inc.",
  office: "Registrar's Office",
  address: "Sampaloc St., Zone 1, North Signal Village, Taguig City",
  hours: "Monday to Friday, 8:00 AM–5:00 PM",
  phone: "(02) 8837-9702",
  registrarEmail: "officeoftheregistrar@sncstaguig.edu.ph",
};

const statusLabels: Record<string, string> = {
  pending: "Pending", for_review: "For Review", complete: "Complete", incomplete: "Incomplete",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Builds the subject, plain-text and HTML versions of the status email. */
export function buildStatusEmail(application: Application) {
  const status = statusLabels[application.status] ?? application.status;
  const { received, missing } = splitChecklist(requirementsFor(application), application.requirement_checks ?? {});
  const name = `${application.first_name} ${application.surname}`;
  const subject = `Enrollment Application Update - [${application.reference_no}]`;
  const nextStep = missing.length
    ? "Please bring the documents below to the Registrar's Office for onsite verification:"
    : "All required documents have been received. The Registrar's Office will contact you about the next enrollment steps.";

  const text = [
    `Dear ${name},`,
    "",
    "The Registrar's Office has updated the processing status of your enrollment application.",
    "",
    `Reference number: ${application.reference_no}`,
    `Status: ${status}`,
    ...(application.registrar_remarks ? ["", `Registrar remarks: ${application.registrar_remarks}`] : []),
    "",
    nextStep,
    ...missing.map((item) => `- ${item.label}`),
    ...(received.length ? ["", "Already received:", ...received.map((item) => `- ${item.label}`)] : []),
    "",
    `Present your reference number (${application.reference_no}) at the window.`,
    `${SCHOOL.office}, ${SCHOOL.name}`,
    SCHOOL.address,
    `${SCHOOL.hours} | ${SCHOOL.phone} | ${SCHOOL.registrarEmail}`,
    "",
    "This status tracks the completeness of your requirements; it is not an admission decision.",
  ].join("\n");

  const list = (items: { label: string }[]) => `<ul style="margin-top:0">${items.map((i) => `<li>${escapeHtml(i.label)}</li>`).join("")}</ul>`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px">
      <h2 style="color:#990000;margin-top:0">${SCHOOL.name}</h2>
      <p>Dear ${escapeHtml(name)},</p>
      <p>The Registrar's Office has updated the processing status of your enrollment application.</p>
      <div style="background:#fdf2f2;padding:15px;border-radius:6px;border:1px solid #f8d7d7;margin:20px 0">
        <p style="margin:0 0 10px 0"><strong>Reference number:</strong> <code>${escapeHtml(application.reference_no)}</code></p>
        <p style="margin:0"><strong>Status:</strong> <span style="color:#990000;font-weight:bold">${escapeHtml(status)}</span></p>
      </div>
      ${application.registrar_remarks
        ? `<p><strong>Registrar remarks:</strong><br/>${escapeHtml(application.registrar_remarks).replace(/\n/g, "<br/>")}</p>` : ""}
      <p style="margin-bottom:4px"><strong>${escapeHtml(nextStep)}</strong></p>
      ${missing.length ? list(missing) : ""}
      ${received.length ? `<p style="margin-bottom:4px"><strong>Already received:</strong></p>${list(received)}` : ""}
      <p>Present your reference number <strong>${escapeHtml(application.reference_no)}</strong> at the window.</p>
      <p style="margin-bottom:0"><strong>${SCHOOL.office}, ${SCHOOL.name}</strong><br/>
        ${SCHOOL.address}<br/>${SCHOOL.hours}<br/>${SCHOOL.phone} · ${SCHOOL.registrarEmail}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
      <p style="font-size:.85rem;color:#64748b">This status tracks the completeness of your requirements; it is not an admission decision.
        This is an automated notification from the SNCS Management System.</p>
    </div>`;
  return { subject, text, html };
}

/** Gmail sender using an App Password (smtp.gmail.com, port 465). */
export function gmailSender(user: string, appPassword: string): SendMail {
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: appPassword } });
  return (message) => transport.sendMail(message);
}

export function createStatusEmailApi(env = process.env, makeClient = createClient, makeSender = gmailSender) {
  const app = express();
  app.disable("x-powered-by");
  app.post("/api/staff/status-email", express.json({ limit: "1kb" }), async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    const token = /^Bearer (\S+)$/i.exec(req.get("authorization") ?? "")?.[1];
    if (!token) { res.status(401).json({ message: "Sign in as a Registrar." }); return; }

    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    const gmailUser = env.GMAIL_USER;
    const gmailPassword = env.GMAIL_APP_PASSWORD;
    if (!url || !key || !gmailUser || !gmailPassword) {
      res.status(503).json({ message: "Email service is not configured." }); return;
    }

    const reference = req.body?.reference_no;
    if (typeof reference !== "string" || !/^[A-Z0-9-]{1,64}$/.test(reference)) {
      res.status(400).json({ message: "Invalid reference number." }); return;
    }

    // Use the caller's session so the database rechecks the Registrar role.
    const db = makeClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: application, error } = await db.rpc("get_registrar_application", { p_reference: reference });
    if (error?.code === "42501") { res.status(403).json({ message: "Registrar access required." }); return; }
    if (error) { res.status(503).json({ message: "Could not read the application." }); return; }
    if (!application) { res.status(404).json({ message: "Application not found." }); return; }

    const { subject, text, html } = buildStatusEmail(application as Application);
    let sent = false;
    try {
      await makeSender(gmailUser, gmailPassword)({
        from: `"${SCHOOL.name} Registrar" <${gmailUser}>`,
        to: (application as Application).email,
        replyTo: SCHOOL.registrarEmail,
        subject, text, html,
      });
      sent = true;
    } catch {
      sent = false;
    }
    // Audit every attempt with the acting Registrar.
    await db.rpc("record_status_email", { p_reference: reference, p_status: (application as Application).status, p_sent: sent });
    if (!sent) { res.status(502).json({ message: "The email could not be sent." }); return; }
    res.json({ success: true });
  });
  return app;
}
