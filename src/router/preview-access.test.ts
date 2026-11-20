// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStaffPortalRole } from "@/lib/staff-auth";
import router from "./index";

vi.mock("@/lib/cms/config", () => ({ cmsPreviewEnabled: true }));
vi.mock("@/lib/staff-auth", () => ({ getStaffPortalRole: vi.fn() }));
vi.mock("vue-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("vue-router")>();
  return { ...original, createWebHistory: original.createMemoryHistory };
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it("keeps the CMS demo and the real Admin dashboard on distinct routes", async () => {
  expect(router.resolve({ name: "admin-dashboard" }).path).toBe("/staff/admin");
  await router.push("/admin");
  expect(router.currentRoute.value.name).toBe("admin");
  expect(getStaffPortalRole).not.toHaveBeenCalled();
});

it.each([null, "registrar", "teacher"])("denies the real Admin dashboard to %s in preview mode", async (role) => {
  vi.mocked(getStaffPortalRole).mockResolvedValue(role as "registrar" | "teacher" | null);
  await router.push("/staff/admin");
  expect(router.currentRoute.value.name).toBe("login");
});

it("retains the role check for an authorized Admin in preview mode", async () => {
  vi.mocked(getStaffPortalRole).mockResolvedValue("admin");
  await router.push({ name: "admin-dashboard" });
  expect(router.currentRoute.value.path).toBe("/staff/admin");
  expect(getStaffPortalRole).toHaveBeenCalledOnce();
});
