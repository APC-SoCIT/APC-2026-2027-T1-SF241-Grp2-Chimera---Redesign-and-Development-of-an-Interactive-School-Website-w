/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261119
 */
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import RegistrarApplicationsPanel from "./RegistrarApplicationsPanel.vue";
import StaffAccountsPanel from "./StaffAccountsPanel.vue";

const client = vi.hoisted(() => ({ rpc: vi.fn(), auth: { getSession: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => client }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it.each(["registrar", "academic_coordinator"])("creates a %s account and displays it after reloading the list", async (role) => {
  client.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
    data: [{ id: "1", full_name: "Registrar Example", email: "registrar@example.com", role, account_status: "active" }],
    error: null,
  });
  client.auth.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null });
  const request = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", request);
  const wrapper = mount(StaffAccountsPanel);
  try {
    await flushPromises();
    await wrapper.get('input[required]:not([type])').setValue("Registrar Example");
    await wrapper.get('input[type="email"]').setValue("registrar@example.com");
    await wrapper.get('input[type="password"]').setValue("test-password");
    await wrapper.get("form select").setValue(role);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(request).toHaveBeenCalledWith("/api/staff/accounts", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      body: expect.stringContaining(`"role":"${role}"`),
    }));
    expect(wrapper.get("tbody").text()).toContain("Registrar Example");
    expect(wrapper.get<HTMLInputElement>('input[type="password"]').element.value).toBe("");
  } finally {
    wrapper.unmount();
  }
});

it("submits an Academic Coordinator role assignment for an existing account", async () => {
  const account = { id: "2", full_name: "Coordinator Example", email: "coordinator@example.com", role: "teacher", account_status: "active" };
  client.rpc.mockResolvedValue({ data: [account], error: null });
  const wrapper = mount(StaffAccountsPanel);
  try {
    await flushPromises();
    await wrapper.get("tbody button").trigger("click");
    await wrapper.get('select[aria-label="Role for Coordinator Example"]').setValue("academic_coordinator");
    await wrapper.get("tbody button").trigger("click");
    await flushPromises();
    expect(client.rpc).toHaveBeenCalledWith("assign_staff_role", { p_staff_id: "2", p_role: "academic_coordinator" });
  } finally {
    wrapper.unmount();
  }
});

it("renders only the enrollment summaries returned by the Registrar RPC", async () => {
  client.rpc.mockResolvedValue({
    data: [{ reference_no: "EN-TEST-01", status: "pending", submitted_at: "2026-11-14T00:00:00Z" }],
    error: null,
  });
  const wrapper = mount(RegistrarApplicationsPanel);
  try {
    await flushPromises();
    expect(client.rpc).toHaveBeenCalledWith("list_registrar_applications", { p_offset: 0 });
    expect(wrapper.get("tbody").text()).toContain("EN-TEST-01");
  } finally {
    wrapper.unmount();
  }
});
