/*
 * Author: Gian Mandac
 * Created Date: 20261124
 * Messages between the staff dashboard and the embedded scheduling workbench (services/scheduler/web/portal-ui.js).
 */
export type SchedulerStepState = "done" | "now" | "todo";
export type SchedulerStep = { id: string; state: SchedulerStepState; note: string };
/** What the workbench reports: the side panel item that is open and each step's progress. */
export type SchedulerState = { view: string; steps: SchedulerStep[] };

/** Side panel items for the workbench, and the workbench view each one opens. */
export const schedulerViews = {
  overview: "home",
  loads: "load-method",
  times: "school-times",
  generate: "checks",
  review: "review",
  published: "teacher",
} as const;
export type SchedulerNavId = keyof typeof schedulerViews;
