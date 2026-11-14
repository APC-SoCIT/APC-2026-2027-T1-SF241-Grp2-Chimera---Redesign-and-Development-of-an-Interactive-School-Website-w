/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261113
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261114
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffPortalRole, signInStaff } from "./staff-auth";

const client = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
}));
vi.mock("./supabase", () => ({ getStaffSupabaseClient: () => client }));

describe("staff session access", () => {
  const session = { expires_at: Math.ceil(Date.now() / 1000) + 3600 };
  beforeEach(() => {
    vi.resetAllMocks();
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    client.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    client.auth.signOut.mockResolvedValue({ error: null });
    client.rpc.mockResolvedValue({ data: "admin", error: null });
  });

  it("denies access without a Supabase session", async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(getStaffPortalRole()).resolves.toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("denies an expired token before checking the staff role", async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: { expires_at: Math.floor(Date.now() / 1000) } }, error: null });
    await expect(getStaffPortalRole()).resolves.toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each(["admin", "registrar"])("keeps a session for an active %s", async (role) => {
    client.rpc.mockResolvedValue({ data: role, error: null });
    await expect(signInStaff("staff@example.com", "test-password")).resolves.toBe(role);
    expect(client.rpc).toHaveBeenCalledWith("get_staff_portal_role");
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("clears the local session when the role check denies access", async () => {
    client.rpc.mockResolvedValue({ data: null, error: null });
    await expect(signInStaff("staff@example.com", "test-password")).resolves.toBeNull();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("clears the local session when the role check is unavailable", async () => {
    const error = new Error("Database offline");
    client.rpc.mockResolvedValue({ data: null, error });
    await expect(signInStaff("admin@example.com", "test-password")).rejects.toBe(error);
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
