/*
 * Author: Gian Mandac
 * Created Date: 20261127
 */
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requirementsFor } from "../supabase/functions/_shared/requirements.js";
import { buildStatusEmail, createStatusEmailApi, type SendMail } from "./status-email.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  GMAIL_USER: "sncs.test@gmail.com",
  GMAIL_APP_PASSWORD: "test-app-password",
};
const application = {
  reference_no: "SNCS-TEST01", status: "incomplete", email: "applicant@yahoo.com", first_name: "Test", surname: "Example",
  registrar_remarks: "Bring the <original> report card", department: "jhs", applicant_type: "new", grade_level: "Grade 7",
  religion: "Catholic", last_school_name: "Example School", requirement_checks: { "psa-birth-certificate": true },
};

function setup(rpc: (name: string) => Promise<unknown>, send = vi.fn<SendMail>(async () => ({}))) {
  const client = { rpc: vi.fn(rpc) };
  const makeClient = vi.fn(() => client);
  const app = createStatusEmailApi(env as NodeJS.ProcessEnv, makeClient as never, () => send);
  return { app, client, makeClient, send };
}
const readApplication = async (name: string) =>
  name === "get_registrar_application" ? { data: application, error: null } : { data: null, error: null };

describe("status email through Gmail", () => {
  it("sends to the applicant's own address with the onsite checklist, then audits it", async () => {
    const { app, client, makeClient, send } = setup(readApplication);
    const res = await request(app).post("/api/staff/status-email")
      .set("Authorization", "Bearer registrar-token").send({ reference_no: "SNCS-TEST01" });
    expect(res.status).toBe(200);
    // The database call uses the Registrar's own session.
    expect(makeClient).toHaveBeenCalledWith(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, expect.objectContaining({
      global: { headers: { Authorization: "Bearer registrar-token" } },
    }));
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("applicant@yahoo.com");
    expect(message.from).toContain("sncs.test@gmail.com");
    expect(message.replyTo).toBe("officeoftheregistrar@sncstaguig.edu.ph");
    expect(message.text).toContain("bring the documents below to the Registrar's Office for onsite verification");
    expect(message.text).toContain("Report card with LRN");
    expect(message.text).toContain("Monday to Friday");
    expect(message.html).toContain("&lt;original&gt;");
    expect(client.rpc).toHaveBeenCalledWith("record_status_email", { p_reference: "SNCS-TEST01", p_status: "incomplete", p_sent: true });
  });

  it("ignores any recipient sent by the browser", async () => {
    const { app, send } = setup(readApplication);
    await request(app).post("/api/staff/status-email").set("Authorization", "Bearer registrar-token")
      .send({ reference_no: "SNCS-TEST01", to: "someone-else@example.com" });
    expect(send.mock.calls[0][0].to).toBe("applicant@yahoo.com");
  });

  it("requires a signed-in Registrar", async () => {
    const { app, send } = setup(async () => ({ data: null, error: { code: "42501" } }));
    expect((await request(app).post("/api/staff/status-email").send({ reference_no: "SNCS-TEST01" })).status).toBe(401);
    const res = await request(app).post("/api/staff/status-email").set("Authorization", "Bearer teacher-token")
      .send({ reference_no: "SNCS-TEST01" });
    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an invalid reference and reports missing Gmail settings", async () => {
    const { app } = setup(readApplication);
    expect((await request(app).post("/api/staff/status-email").set("Authorization", "Bearer t")
      .send({ reference_no: "bad ref" })).status).toBe(400);
    const unconfigured = createStatusEmailApi({ ...env, GMAIL_APP_PASSWORD: "" } as NodeJS.ProcessEnv);
    expect((await request(unconfigured).post("/api/staff/status-email").set("Authorization", "Bearer t")
      .send({ reference_no: "SNCS-TEST01" })).status).toBe(503);
  });

  it("audits a failed send and tells the Registrar", async () => {
    const failing = vi.fn<SendMail>(async () => { throw new Error("Gmail rejected the login"); });
    const { app, client } = setup(readApplication, failing);
    const res = await request(app).post("/api/staff/status-email").set("Authorization", "Bearer registrar-token")
      .send({ reference_no: "SNCS-TEST01" });
    expect(res.status).toBe(502);
    expect(client.rpc).toHaveBeenCalledWith("record_status_email", { p_reference: "SNCS-TEST01", p_status: "incomplete", p_sent: false });
  });

  it("tells a complete applicant that nothing else is needed", () => {
    const allReceived = Object.fromEntries(requirementsFor(application).map((item) => [item.key, true]));
    const { text } = buildStatusEmail({ ...application, status: "complete", requirement_checks: allReceived });
    expect(text).toContain("All required documents have been received");
  });
});
