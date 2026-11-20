import { createRouter, createWebHistory, createMemoryHistory } from "vue-router";
/*
 * Author: gemillan321 | Email: miles.gemillan77@gmail.com
 * Created Date: 20261001
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261119
 */
import type { StaffAccess } from "@/lib/staff-auth";
import AboutView from "@/views/AboutView.vue";
import AdmissionsView from "@/views/AdmissionsView.vue";
import AnnouncementView from "@/views/AnnouncementView.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import CampusView from "@/views/CampusView.vue";
import ContactView from "@/views/ContactView.vue";
import EventsView from "@/views/EventsView.vue";
import HomeView from "@/views/HomeView.vue";
import NewsView from "@/views/NewsView.vue";
import { cmsPreviewEnabled } from "@/lib/cms/config";

declare module "vue-router" {
  interface RouteMeta {
    staffRole?: StaffAccess;
  }
}

const router = createRouter({
  history: import.meta.env.SSR ? createMemoryHistory(import.meta.env.BASE_URL) : createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (to, _from, savedPosition) => {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, top: 148 };
    return { top: 0, behavior: "instant" };
  },
  routes: [
    ...(cmsPreviewEnabled ? [
      { path: "/admin", name: "admin", component: () => import("@/views/CmsPreviewView.vue"), meta: { title: "Content Workspace", cmsPreview: true } },
      { path: "/cms-preview", redirect: { name: "admin" } },
      { path: "/pages/:slug?", name: "published-pages", component: () => import("@/views/PublishedPagesView.vue"), meta: { title: "School pages" } },
    ] : []),
    { path: "/login", name: "login", component: () => import("@/views/LoginView.vue"), meta: { title: "Staff sign in", authLayout: true } },
    { path: "/login/change-password", name: "password-change", component: () => import("@/views/StaffPasswordChangeView.vue"), meta: { title: "Change your password", authLayout: true, staffRole: "password-change" } },
    { path: cmsPreviewEnabled ? "/staff/admin" : "/admin", name: "admin-dashboard", component: () => import("@/views/StaffDashboardView.vue"), props: { heading: "Admin dashboard", role: "admin" }, meta: { title: "Admin dashboard", authLayout: true, staffRole: "admin" } },
    { path: "/registrar", name: "registrar-dashboard", component: () => import("@/views/StaffDashboardView.vue"), props: { heading: "Registrar dashboard", role: "registrar" }, meta: { title: "Registrar dashboard", authLayout: true, staffRole: "registrar" } },
    { path: "/teacher", name: "teacher-dashboard", component: () => import("@/views/StaffDashboardView.vue"), props: { heading: "Teacher dashboard", role: "teacher" }, meta: { title: "Teacher dashboard", authLayout: true, staffRole: "teacher" } },
    { path: "/academic-coordinator", name: "academic-coordinator-dashboard", component: () => import("@/views/StaffDashboardView.vue"), props: { heading: "Academic Coordinator dashboard", role: "academic_coordinator" }, meta: { title: "Academic Coordinator dashboard", authLayout: true, staffRole: "academic_coordinator" } },
    { path: "/enrollment", name: "enrollment", component: () => import("@/views/EnrollmentView.vue"), meta: { title: "Enrollment application" } },
    { path: "/", name: "home", component: HomeView, meta: { title: "Home" } },
    { path: "/about", name: "about", component: AboutView, meta: { title: "About" } },
    { path: "/campus", name: "campus", component: CampusView, meta: { title: "Campus" } },
    { path: "/news", name: "news", component: NewsView, meta: { title: "News" } },
    { path: "/news/:slug", name: "announcement", component: AnnouncementView, meta: { title: "Announcement" } },
    { path: "/events", name: "events", component: EventsView, meta: { title: "Events" } },
    { path: "/contact", name: "contact", component: ContactView, meta: { title: "Contact" } },
    { path: "/admissions", name: "admissions", component: AdmissionsView, meta: { title: "Admissions" } },
    { path: "/resources", name: "resources", component: () => import("@/views/ResourcesView.vue"), meta: { title: "Resources" } },
    { path: "/:pathMatch(.*)*", name: "not-found", component: NotFoundView, meta: { title: "Page not found" } },
  ],
});

// Staff Route Guard START
router.beforeEach(async (to) => {
  if (!to.meta.staffRole) return;
  try {
    const { getStaffPortalRole } = await import("@/lib/staff-auth");
    const access = await getStaffPortalRole();
    if (access === to.meta.staffRole) return;
    if (access === "password-change") return { name: "password-change", replace: true };
  } catch {
    // Configuration or network errors must not open the protected view.
  }
  return { name: "login", replace: true };
});
// Staff Route Guard END

router.afterEach((to) => {
  const title = typeof to.meta.title === "string" ? `${to.meta.title} | ` : "";
  if (typeof document !== "undefined") {
    document.title = `${title}Sto. Niño Catholic School, Inc.`;
    if (!to.meta.cmsPreview && !to.meta.authLayout) {
      const base = import.meta.env.VITE_SITE_URL || "https://sncs-campus-preview.vercel.app";
      const url = new URL(to.path, base).href;
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", url);
      document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute("content", url);
    }
  }
});

export default router;
