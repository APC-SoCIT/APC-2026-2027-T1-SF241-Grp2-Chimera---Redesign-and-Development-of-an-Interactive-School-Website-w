// @vitest-environment jsdom
/*
 * Modified by: Gian Mandac (Date: 20261121): the content workspace uses the staff sign-in.
 * It opens at /admin/content for verified Admins only; /admin stays the Admin dashboard.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStaffPortalRole } from "@/lib/staff-auth";
import router from "./index";

vi.mock("@/lib/cms/config", () => ({ cmsPreviewEnabled: true, cmsDatabaseEnabled: false }));
vi.mock("@/lib/staff-auth", () => ({ getStaffPortalRole: vi.fn() }));
vi.mock("vue-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("vue-router")>();
  return { ...original, createWebHistory: original.createMemoryHistory };
});

beforeEach(async () => {
  vi.resetAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  // Start each check from a public page so every visit runs the staff guard.
  await router.push("/");
});
afterEach(() => vi.restoreAllMocks());

it("keeps /admin as the Admin dashboard and puts the content workspace under it", () => {
  expect(router.resolve({ name: "admin-dashboard" }).path).toBe("/admin");
  expect(router.resolve({ name: "content-workspace" }).path).toBe("/admin/content");
});

it("sends the old /cms-preview address to the content workspace", async () => {
  vi.mocked(getStaffPortalRole).mockResolvedValue("admin");
  await router.push("/cms-preview");
  expect(router.currentRoute.value.name).toBe("content-workspace");
});

it.each([null, "registrar", "teacher", "academic_coordinator"])("sends %s to the staff sign-in instead of the content workspace", async (role) => {
  vi.mocked(getStaffPortalRole).mockResolvedValue(role as "registrar" | "teacher" | "academic_coordinator" | null);
  await router.push("/admin/content");
  expect(router.currentRoute.value.name).toBe("login");
});

it("opens the content workspace for a verified Admin", async () => {
  vi.mocked(getStaffPortalRole).mockResolvedValue("admin");
  await router.push({ name: "content-workspace" });
  expect(router.currentRoute.value.path).toBe("/admin/content");
  expect(getStaffPortalRole).toHaveBeenCalledOnce();
});
