/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 */
import type { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
import { createStaffAccountsApi } from "./staff-accounts";

const user = { id: "00000000-0000-4000-8000-000000000001" };
const client = { auth: { getUser: vi.fn(), admin: { createUser: vi.fn() } }, rpc: vi.fn() };
const makeClient = vi.fn(() => client) as unknown as typeof createClient;
const api = createStaffAccountsApi({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "test-key" }, makeClient);
const input = { email: " Registrar@example.com ", fullName: " Registrar Example ", role: "registrar", password: "example-password" };
const submit = (body = input) => request(api).post("/api/staff/accounts").set("Authorization", "Bearer test-token").send(body);

beforeEach(() => {
  vi.clearAllMocks();
  client.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  client.rpc.mockResolvedValue({ data: true, error: null });
  client.auth.admin.createUser.mockResolvedValue({ error: null });
});

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
