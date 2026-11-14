/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261114
 */
import type { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
import { createStaffAccountsApi } from "./staff-accounts";

const user = { id: "00000000-0000-4000-8000-000000000001" };
const client = {
  auth: {
    getUser: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(),
    admin: { createUser: vi.fn(), updateUserById: vi.fn() },
  },
  rpc: vi.fn(),
};
const makeClient = vi.fn(() => client) as unknown as typeof createClient;
const api = createStaffAccountsApi({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "test-key" }, makeClient);
const input = { email: " Registrar@example.com ", fullName: " Registrar Example ", role: "registrar", password: "example-password" };
const submit = (body: Record<string, string> = input) => request(api).post("/api/staff/accounts").set("Authorization", "Bearer test-token").send(body);

beforeEach(() => {
  vi.resetAllMocks();
  client.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  client.rpc.mockResolvedValue({ data: true, error: null });
  client.auth.admin.createUser.mockResolvedValue({ error: null });
  client.auth.admin.updateUserById.mockResolvedValue({ error: null });
  client.auth.signOut.mockResolvedValue({ error: null });
});

// Staff Account Action Tests START
const target = "00000000-0000-4000-8000-000000000002";
it.each(["reset-password", "deactivate"])("checks target eligibility before executing %s", async (action) => {
  client.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: target, error: null });
  const result = await submit({ action, staffId: "2" }).expect("Cache-Control", "no-store").expect(200);
  expect(client.rpc).toHaveBeenNthCalledWith(2, "get_staff_auth_target", { p_actor_id: user.id, p_staff_id: "2" });
  const update = client.auth.admin.updateUserById.mock.calls[0][1];
  expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(target, {
    password: expect.stringMatching(/^[\w-]{32}aA1!$/),
    ...(action === "deactivate" ? { ban_duration: "876000h" } : {}),
    app_metadata: { chimera_staff_action: { action, staff_id: "2", actor_id: user.id, request_id: expect.any(String) } },
  });
  if (action === "deactivate") expect(result.body).not.toHaveProperty("temporaryPassword");
  else expect(result.body).toEqual({ temporaryPassword: update.password });
});

it("rejects account actions for an unauthorized manager or unavailable target", async () => {
  client.rpc.mockResolvedValueOnce({ data: false, error: null });
  await submit({ action: "reset-password", staffId: "2" }).expect(403);
  expect(client.rpc).toHaveBeenCalledTimes(1);
  client.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: null, error: null });
  await submit({ action: "deactivate", staffId: "2" }).expect(403);
  expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
});

it("completes a reset only after verifying the signed-in user's temporary password", async () => {
  const email = "teacher@example.com";
  client.auth.getUser.mockResolvedValue({ data: { user: { ...user, email, app_metadata: {
    chimera_staff_action: { action: "reset-password", request_id: "reset-request" },
  } } }, error: null });
  const body = { action: "complete-password-change", temporaryPassword: "temporary-password", password: "new-example-password" };
  client.auth.signInWithPassword.mockResolvedValueOnce({ data: { user: null, session: null }, error: { code: "invalid_credentials" } });
  await submit(body).expect(403);
  expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  client.auth.signInWithPassword.mockResolvedValueOnce({ data: { user, session: {} }, error: null });
  await submit(body).expect(200);
  expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email, password: body.temporaryPassword });
  expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(user.id, {
    password: body.password,
    app_metadata: { chimera_staff_action: { action: body.action, reset_id: "reset-request", request_id: expect.any(String) } },
  });
  expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(client.rpc).not.toHaveBeenCalled();
});
// Staff Account Action Tests END

it("rejects a missing or invalid bearer token before privileged operations", async () => {
  await request(api).post("/api/staff/accounts").send(input).expect(401);
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
  await submit().expect(401);
  expect(client.rpc).not.toHaveBeenCalled();
  expect(client.auth.admin.createUser).not.toHaveBeenCalled();
});

it("rejects authenticated users without account management permission", async () => {
  client.rpc.mockResolvedValue({ data: false, error: null });
  await submit().expect(403);
  expect(client.auth.admin.createUser).not.toHaveBeenCalled();
});

it("creates a confirmed Auth account with the assigned staff role and verified creator", async () => {
  await submit().expect("Cache-Control", "no-store").expect(201);
  expect(client.auth.getUser).toHaveBeenCalledWith("test-token");
  expect(client.rpc).toHaveBeenCalledWith("can_manage_staff_accounts", { p_user_id: user.id });
  expect(client.auth.admin.createUser).toHaveBeenCalledWith({
    email: "registrar@example.com",
    password: input.password,
    email_confirm: true,
    app_metadata: { chimera_staff_provisioning: { created_by: user.id, full_name: "Registrar Example", role: "registrar" } },
  });
});

it("rejects unsupported roles and handles a duplicate email without exposing provider details", async () => {
  await submit({ ...input, role: "owner" }).expect(422);
  expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  client.auth.admin.createUser.mockResolvedValue({ error: { code: "email_exists", message: "private details" } });
  const response = await submit().expect(409);
  expect(response.text).not.toContain("private details");
});
