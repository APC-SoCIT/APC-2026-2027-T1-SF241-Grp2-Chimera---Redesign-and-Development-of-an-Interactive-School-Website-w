/*
 * Author: Gian Mandac
 * Created Date: 20261116
 */
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import RegistrarApplicationDetail from "./RegistrarApplicationDetail.vue";

const client = vi.hoisted(() => ({ rpc: vi.fn(), functions: { invoke: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => client }));

const application = {
  id: 1, reference_no: "SNCS-TEST01", school_year: "2026-2027", department: "jhs", applicant_type: "new",
  grade_level: "Grade 7", strand: null, mode_of_payment: "monthly", surname: "Example", first_name: "Test",
  middle_name: null, birth_date: "2013-01-15", gender: "female", place_of_birth: "Taguig", religion: "Catholic",
  complete_address: "Test address", contact_numbers: "09171234567", email: "test@example.com", parent_email: null,
  guardian_messenger: "Example Guardian", last_school_name: "Example School", last_school_address: "Test school address",
  status: "pending", registrar_remarks: null, privacy_consent_at: "2026-11-14T00:00:00Z", submitted_at: "2026-11-14T00:00:00Z",
  guardians: [{ relationship: "guardian", full_name: "Guardian Example", occupation: null, contact_number: "09171234567" }],
  documents: [], requirement_checks: { "psa-birth-certificate": true },
};

function mountDetail() {
  return mount(RegistrarApplicationDetail, { props: { reference: "SNCS-TEST01", hasPrevious: false, hasNext: true } });
}

afterEach(() => vi.resetAllMocks());

it("shows every submitted section and the dynamic checklist", async () => {
  client.rpc.mockResolvedValue({ data: structuredClone(application), error: null });
  const wrapper = mountDetail();
  try {
    await flushPromises();
    expect(client.rpc).toHaveBeenCalledWith("get_registrar_application", { p_reference: "SNCS-TEST01" });
    for (const text of ["Guardian Example", "Taguig", "Example School", "Messenger account", "Good moral", "Baptismal certificate", "Former school’s name", "No documents were uploaded"]) {
      expect(wrapper.text().toLowerCase()).toContain(text.toLowerCase());
    }
    expect(wrapper.find<HTMLInputElement>('.checklist input[type="checkbox"]').element.checked).toBe(false);
    expect(wrapper.text()).toContain("1 of");
  } finally {
    wrapper.unmount();
  }
});

it("shows application not found for an unknown reference", async () => {
  client.rpc.mockResolvedValue({ data: null, error: null });
  const wrapper = mountDetail();
  try {
    await flushPromises();
    expect(wrapper.text()).toContain("Application not found");
  } finally {
    wrapper.unmount();
  }
});

it("saves a status only after confirmation and emails only after the Registrar confirms the preview", async () => {
  client.rpc.mockImplementation(async (name: string) => name === "get_registrar_application"
    ? { data: structuredClone(application), error: null }
    : { data: { status: "incomplete", registrar_remarks: "Bring the report card", changed: true }, error: null });
  client.functions.invoke.mockResolvedValue({ data: { success: true }, error: null });
  const wrapper = mountDetail();
  try {
    await flushPromises();
    await wrapper.get(".actions-card select").setValue("incomplete");
    await wrapper.get(".actions-card textarea").setValue("Bring the report card");
    await wrapper.findAll("button").find((button) => button.text() === "Save status")!.trigger("click");
    expect(client.rpc).not.toHaveBeenCalledWith("update_application_status", expect.anything());

    // Cancelling the confirmation leaves the status unchanged.
    await wrapper.findAll("button").find((button) => button.text() === "Cancel")!.trigger("click");
    expect(client.rpc).not.toHaveBeenCalledWith("update_application_status", expect.anything());

    await wrapper.findAll("button").find((button) => button.text() === "Save status")!.trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "Confirm")!.trigger("click");
    await flushPromises();
    expect(client.rpc).toHaveBeenCalledWith("update_application_status", {
      p_reference: "SNCS-TEST01", p_status: "incomplete", p_remarks: "Bring the report card",
    });
    expect(wrapper.emitted("updated")).toEqual([["SNCS-TEST01", "incomplete"]]);

    // No automatic email: the preview waits for the Registrar.
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(wrapper.get(".email-preview").text()).toContain("Requirements still needed");
    expect(wrapper.get(".email-preview").text()).toContain("Bring the report card");
    await wrapper.findAll("button").find((button) => button.text() === "Confirm and send email")!.trigger("click");
    await flushPromises();
    expect(client.functions.invoke).toHaveBeenCalledWith("send-application-status-email", { body: { reference_no: "SNCS-TEST01" } });
    expect(wrapper.text()).toContain("Status email sent to test@example.com");
  } finally {
    wrapper.unmount();
  }
});

it("lets the Registrar decline the status email", async () => {
  client.rpc.mockImplementation(async (name: string) => name === "get_registrar_application"
    ? { data: structuredClone(application), error: null }
    : { data: { status: "for_review", registrar_remarks: null, changed: true }, error: null });
  const wrapper = mountDetail();
  try {
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Save status")!.trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "Confirm")!.trigger("click");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Don’t send")!.trigger("click");
    expect(wrapper.find(".email-preview").exists()).toBe(false);
    expect(client.functions.invoke).not.toHaveBeenCalled();
  } finally {
    wrapper.unmount();
  }
});

it("shows requirement progress and closes from the backdrop", async () => {
  client.rpc.mockResolvedValue({ data: structuredClone(application), error: null });
  const wrapper = mountDetail();
  try {
    await flushPromises();
    expect(wrapper.get("h2").text()).toBe("Test Example");
    const bar = wrapper.get('[role="progressbar"]');
    expect(bar.attributes("aria-valuenow")).toBe("1");
    await wrapper.get(".detail-scrim").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  } finally {
    wrapper.unmount();
  }
});
