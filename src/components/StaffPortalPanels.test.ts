/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
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

it("creates a staff account with the selected role and displays it after reloading the list", async () => {
  client.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
    data: [{ id: "1", full_name: "Registrar Example", email: "registrar@example.com", role: "registrar", account_status: "active" }],
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
    await wrapper.get("form select").setValue("registrar");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(request).toHaveBeenCalledWith("/api/staff/accounts", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      body: expect.stringContaining('"role":"registrar"'),
    }));
    expect(wrapper.get("tbody").text()).toContain("Registrar Example");
    expect(wrapper.get<HTMLInputElement>('input[type="password"]').element.value).toBe("");
  } finally {
    wrapper.unmount();
  }
});

it("searches enrollment applications through the Registrar RPC with every filter", async () => {
  client.rpc.mockResolvedValue({
    data: [{ reference_no: "SNCS-TEST01", first_name: "Test", surname: "Example", grade_level: "Grade 7", status: "pending", submitted_at: "2026-11-14T00:00:00Z" }],
    error: null,
  });
  const wrapper = mount(RegistrarApplicationsPanel);
  try {
    await flushPromises();
    expect(client.rpc).toHaveBeenCalledWith("search_registrar_applications", { p_query: null, p_status: null, p_from: null, p_to: null, p_offset: 0 });
    expect(wrapper.get("tbody").text()).toContain("SNCS-TEST01");
    await wrapper.get('input[type="search"]').setValue("example");
    await wrapper.get("form select").setValue("pending");
    const [from, to] = wrapper.findAll('input[type="date"]');
    await from.setValue("2026-11-01");
    await to.setValue("2026-11-30");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(client.rpc).toHaveBeenLastCalledWith("search_registrar_applications", {
      p_query: "example", p_status: "pending", p_from: "2026-11-01", p_to: "2026-11-30", p_offset: 0,
    });
  } finally {
    wrapper.unmount();
  }
});

it("shows access denied when the session is not a Registrar", async () => {
  client.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Registrar access required" } });
  const wrapper = mount(RegistrarApplicationsPanel);
  try {
    await flushPromises();
    expect(wrapper.text()).toContain("Access denied");
  } finally {
    wrapper.unmount();
  }
});
