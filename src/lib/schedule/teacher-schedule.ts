/*
 * Author: Gian Mandac
 * Created Date: 20261117
 * PB-07 / US-07: read the signed-in Teacher's published class schedule.
 * The browser only calls the role-checked get_teacher_schedule() database function.
 */
import { getStaffSupabaseClient } from "@/lib/supabase";

export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type ScheduleEntry = {
  day_of_week: number; // 1 = Monday … 6 = Saturday
  start_time: string; // "HH:MM", 24-hour
  end_time: string;
  subject: string;
  section: string;
  grade_level: number;
  strand: string | null;
  room: string | null;
  is_fixed: boolean;
};

export type TeacherSchedule = {
  linked: boolean;
  teacher_name?: string;
  run: { school_year: string; term: string; published_at: string | null } | null;
  entries: ScheduleEntry[];
};

export class ScheduleError extends Error {
  constructor(public readonly kind: "access" | "unavailable", message: string) {
    super(message);
  }
}

function isSchedule(value: unknown): value is TeacherSchedule {
  return !!value && typeof value === "object" && typeof (value as TeacherSchedule).linked === "boolean"
    && Array.isArray((value as TeacherSchedule).entries);
}

export async function getTeacherSchedule(): Promise<TeacherSchedule> {
  const { data, error } = await getStaffSupabaseClient().rpc("get_teacher_schedule");
  if (error?.code === "42501") throw new ScheduleError("access", "Only an active Teacher account can view this schedule.");
  if (error || !isSchedule(data)) throw new ScheduleError("unavailable", "The schedule could not be loaded. Try again.");
  return data;
}

/** "13:30" → "1:30 PM" */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function groupByDay(entries: ScheduleEntry[]) {
  return weekdays
    .map((name, index) => ({ day: index + 1, name, entries: entries.filter((entry) => entry.day_of_week === index + 1) }))
    .filter((group, index) => group.entries.length > 0 || index < 5); // Saturday only when it has classes
}

export function weeklyMinutes(entries: ScheduleEntry[]): number {
  return entries.reduce((total, entry) => {
    const [sh, sm] = entry.start_time.split(":").map(Number);
    const [eh, em] = entry.end_time.split(":").map(Number);
    return total + (eh * 60 + em) - (sh * 60 + sm);
  }, 0);
}
