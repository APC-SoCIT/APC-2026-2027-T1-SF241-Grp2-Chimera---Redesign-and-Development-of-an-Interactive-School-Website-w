/*
 * Author: Gian Mandac
 * Created Date: 20261117
 */
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeacherSchedulePanel from "./TeacherSchedulePanel.vue";
import { formatTime, groupByDay, weeklyMinutes, type ScheduleEntry } from "@/lib/schedule/teacher-schedule";

const client = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => client }));

const entry = (overrides: Partial<ScheduleEntry>): ScheduleEntry => ({
  day_of_week: 1, start_time: "08:00", end_time: "09:00", subject: "Filipino 7", section: "G7 - Our Lady of Guadalupe",
  grade_level: 7, strand: null, room: "Room 201", is_fixed: false, ...overrides,
});
const published = {
  linked: true, teacher_name: "Teacher A",
  run: { school_year: "2026-2027", term: "Term 2", published_at: "2026-11-10T00:00:00Z" },
  entries: [
    entry({}),
    entry({ day_of_week: 3, start_time: "13:00", end_time: "14:00", subject: "General Chemistry 1", section: "G11 - St. Thomas",
      grade_level: 11, strand: "STEM", room: "Chemistry Lab", is_fixed: true }),
    entry({ day_of_week: 3, start_time: "15:00", end_time: "15:45", subject: "Homeroom", room: null }),
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T02:00:00Z")); // Wednesday in Manila
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("schedule helpers", () => {
  it("formats times, groups by weekday and totals teaching minutes", () => {
    expect(formatTime("07:05")).toBe("7:05 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("13:30")).toBe("1:30 PM");
    const groups = groupByDay(published.entries);
    expect(groups.map((group) => group.name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(groups[2].entries.map((item) => item.subject)).toEqual(["General Chemistry 1", "Homeroom"]);
    expect(groupByDay([entry({ day_of_week: 6 })]).at(-1)?.name).toBe("Saturday");
    expect(weeklyMinutes(published.entries)).toBe(165);
  });
});

describe("TeacherSchedulePanel", () => {
  it("shows the Teacher's published week read-only, with rooms, labs and today highlighted", async () => {
    client.rpc.mockResolvedValue({ data: published, error: null });
    const wrapper = mount(TeacherSchedulePanel);
    try {
      await flushPromises();
      expect(client.rpc).toHaveBeenCalledWith("get_teacher_schedule");
      const text = wrapper.text();
      for (const expected of ["2026-2027 · Term 2", "3 classes a week", "2.8 teaching hours", "8:00 AM – 9:00 AM",
        "General Chemistry 1", "G11 - St. Thomas · STEM", "Chemistry Lab", "Fixed lab class", "Room to be assigned"]) {
        expect(text).toContain(expected);
      }
      expect(wrapper.get(".day.today").text()).toContain("Wednesday");
      expect(wrapper.findAll("input, textarea, button").length).toBe(0); // view-only
    } finally {
      wrapper.unmount();
    }
  });

  it("filters to a single day", async () => {
    client.rpc.mockResolvedValue({ data: published, error: null });
    const wrapper = mount(TeacherSchedulePanel);
    try {
      await flushPromises();
      await wrapper.get("select").setValue("3");
      const days = wrapper.findAll(".day");
      expect(days).toHaveLength(1);
      expect(days[0].text()).toContain("Wednesday");
      expect(days[0].text()).not.toContain("Filipino 7");
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    [{ linked: true, teacher_name: "Teacher A", run: null, entries: [] }, "No active classes found."],
    [{ linked: false, run: null, entries: [] }, "not linked to a teacher record"],
  ])("explains an empty schedule", async (data, message) => {
    client.rpc.mockResolvedValue({ data, error: null });
    const wrapper = mount(TeacherSchedulePanel);
    try {
      await flushPromises();
      expect(wrapper.text()).toContain(message);
    } finally {
      wrapper.unmount();
    }
  });

  it("shows access denied for non-Teacher sessions and a retry on other failures", async () => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const denied = mount(TeacherSchedulePanel);
    await flushPromises();
    expect(denied.text()).toContain("Access denied");
    denied.unmount();

    client.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST000" } }).mockResolvedValueOnce({ data: published, error: null });
    const failed = mount(TeacherSchedulePanel);
    try {
      await flushPromises();
      expect(failed.text()).toContain("could not be loaded");
      await failed.get("button").trigger("click");
      await flushPromises();
      expect(failed.text()).toContain("General Chemistry 1");
    } finally {
      failed.unmount();
    }
  });
});
