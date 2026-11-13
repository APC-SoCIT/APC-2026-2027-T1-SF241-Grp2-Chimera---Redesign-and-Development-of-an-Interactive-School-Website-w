/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261113
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasAdminAccess, signInAdmin } from "./staff-auth";

const client = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
}));
vi.mock("./supabase", () => ({ getStaffSupabaseClient: () => client }));

describe("admin session access", () => {
  const session = { access_token: "test-token" };
  beforeEach(() => {
    vi.resetAllMocks();
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    client.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    client.auth.signOut.mockResolvedValue({ error: null });
    client.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("denies access without a Supabase session", async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(hasAdminAccess()).resolves.toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("keeps a session only when the database confirms active admin access", async () => {
    await expect(signInAdmin("admin@example.com", "test-password")).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("has_active_admin_access");
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("clears the local session when the role check denies access", async () => {
    client.rpc.mockResolvedValue({ data: false, error: null });
    await expect(signInAdmin("staff@example.com", "test-password")).resolves.toBe(false);
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("clears the local session when the role check is unavailable", async () => {
    const error = new Error("Database offline");
    client.rpc.mockResolvedValue({ data: null, error });
    await expect(signInAdmin("admin@example.com", "test-password")).rejects.toBe(error);
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
