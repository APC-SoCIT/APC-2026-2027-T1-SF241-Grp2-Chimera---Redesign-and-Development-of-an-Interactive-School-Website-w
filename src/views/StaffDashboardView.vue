<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261113
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261119 (verify staff access on every session change)
  Modified by: Gian Mandac (branded staff portal bar with the SNCS seal)
  Modified Date: 20261119
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261120
  Modified by: Gian Mandac (role-based side panel that can shrink to icons, content workspace look; PB-07 teacher schedule panel)
  Modified Date: 20261124
  Modified by: Gian Mandac (shorter side panel for each role; campus banner and summary cards on every dashboard)
  Modified Date: 20261125
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Session } from "@supabase/supabase-js";
import { RouterLink, useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import { getStaffSupabaseClient } from "@/lib/supabase";
import { getStaffPortalRole, type StaffRole } from "@/lib/staff-auth";
import StaffAccountsPanel from "@/components/StaffAccountsPanel.vue";
import RegistrarApplicationsPanel from "@/components/RegistrarApplicationsPanel.vue";
import CoordinatorSchedulerPanel from "@/components/CoordinatorSchedulerPanel.vue";
import TeacherSchedulePanel from "@/components/TeacherSchedulePanel.vue";
import { cmsDatabaseEnabled, cmsPreviewEnabled } from "@/lib/cms/config";
import { useCmsWorkspace } from "@/lib/cms/workspace";
import { weeklyMinutes, type TeacherSchedule } from "@/lib/schedule/teacher-schedule";
import CmsIcon from "@/components/cms/CmsIcon.vue";
import { schedulerViews, type SchedulerNavId, type SchedulerState, type SchedulerStep } from "@/lib/schedule/scheduler-bridge";

const props = defineProps<{ heading: string; role?: StaffRole }>();

const router = useRouter();
const route = useRoute();
const { auth } = getStaffSupabaseClient();
const signingOut = ref(false);
const signOutError = ref(false);
const accessVerified = ref(false);
const contentVersion = ref(0);
const staffName = ref("");
const schedulerToken = ref("");

const roleLabels: Record<StaffRole, string> = { admin: "Admin", registrar: "Registrar", teacher: "Teacher", academic_coordinator: "Academic Coordinator" };
// Both kinds of Admin have the admin role; only a Super Admin may manage staff accounts.
// The accounts panel reports which one this is (undefined until it has checked).
const canManageAccounts = ref<boolean>();
const roleLabel = computed(() => {
  if (props.role === "admin" && canManageAccounts.value !== undefined) return canManageAccounts.value ? "Super Admin" : "Content Admin";
  return props.role ? roleLabels[props.role] : "Staff";
});
const initials = computed(() => {
  const words = staffName.value.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return roleLabel.value.charAt(0);
  return (words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : "")).toUpperCase();
});

/** Name given when the Admin created the account; falls back to the sign-in email. */
function nameFrom(session: Session | null) {
  const provisioning = session?.user?.app_metadata?.chimera_staff_provisioning as { full_name?: unknown } | undefined;
  return typeof provisioning?.full_name === "string" && provisioning.full_name.trim()
    ? provisioning.full_name.trim()
    : session?.user?.email ?? "";
}

// Summary Cards START
// Four counts under the banner, from data each dashboard already loads. None for the
// Registrar (the applications panel has its own status pipeline) or the Coordinator
// (the scheduling workbench draws its own overview).
type SummaryCard = { id: string; icon: string; value: string; label: string; note: string };
const accountCounts = ref<{ total: number; active: number; admins: number; inactive: number; more: boolean }>();
const teacherSchedule = ref<TeacherSchedule>();
// Content counts come from the same place the content workspace saves to (browser preview or school database).
const contentWorkspace = cmsPreviewEnabled && props.role === "admin" ? useCmsWorkspace(() => staffName.value) : undefined;
const contentLibrary = contentWorkspace?.library;
watch(canManageAccounts, (allowed) => {
  if (allowed === false && contentWorkspace?.usesDatabase) void contentWorkspace.load();
});
const summaryCards = computed<SummaryCard[]>(() => {
  if (props.role === "admin" && canManageAccounts.value && accountCounts.value) {
    const { total, active, admins, inactive, more } = accountCounts.value;
    const plus = more ? "+" : "";
    return [
      { id: "staff", icon: "users", value: `${total}${plus}`, label: "Staff accounts", note: "Everyone who can sign in" },
      { id: "active", icon: "check", value: `${active}${plus}`, label: "Active", note: "Can use their dashboard" },
      { id: "admins", icon: "user-plus", value: `${admins}${plus}`, label: "Admins", note: "Super and Content Admins" },
      { id: "inactive", icon: "archive", value: `${inactive}${plus}`, label: "Inactive", note: "Access turned off" },
    ];
  }
  if (props.role === "admin" && canManageAccounts.value === false && contentLibrary) {
    const items = contentLibrary.value.items.filter((item) => !item.deletedAt && item.type !== "resource");
    const count = (status: string) => String(items.filter((item) => item.status === status).length);
    return [
      { id: "content", icon: "files", value: String(items.length), label: "Total content", note: "Across all content types" },
      { id: "published", icon: "check", value: count("published"), label: "Published", note: "Visible to website visitors" },
      { id: "draft", icon: "page", value: count("draft"), label: "Drafts", note: "Work in progress" },
      { id: "archived", icon: "archive", value: count("archived"), label: "Archived", note: "Hidden from the website" },
    ];
  }
  if (props.role === "teacher" && teacherSchedule.value?.entries.length) {
    const entries = teacherSchedule.value.entries;
    const distinct = (values: (string | null)[]) => String(new Set(values.filter(Boolean)).size);
    return [
      { id: "classes", icon: "event", value: String(entries.length), label: "Classes a week", note: "In the published schedule" },
      { id: "hours", icon: "clock", value: String(Math.round(weeklyMinutes(entries) / 6) / 10), label: "Teaching hours", note: "Each week" },
      { id: "sections", icon: "users", value: distinct(entries.map((entry) => entry.section)), label: "Sections", note: "Classes you teach" },
      { id: "subjects", icon: "files", value: distinct(entries.map((entry) => entry.subject)), label: "Subjects", note: "This term" },
    ];
  }
  return [];
});
// Summary Cards END

// Session Access START
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let accessTimer: ReturnType<typeof setTimeout> | undefined;
let currentSession: Session | null = null;
let authorizedUserId: string | undefined;
let authorizedRole: StaffRole | undefined;
let accessVersion = 0;

function clearAccess() {
  schedulerToken.value = "";
  accessVerified.value = false;
  contentVersion.value += 1;
  accessVersion += 1;
  authorizedUserId = undefined;
  authorizedRole = undefined;
  clearTimeout(expiryTimer);
  clearTimeout(accessTimer);
}

function checkSession(session: Session | null) {
  currentSession = session;
  staffName.value = nameFrom(session);
  // Keep forms mounted for the verified account while its current role is rechecked.
  if (session?.user?.id !== authorizedUserId || props.role !== authorizedRole) clearAccess();
  clearTimeout(expiryTimer);
  clearTimeout(accessTimer);
  const version = ++accessVersion;
  const remaining = (session?.expires_at ?? 0) * 1000 - Date.now();
  if (!session?.user?.id || remaining <= 0) {
    clearAccess();
    void router.replace({ name: "login" });
    return;
  }
  expiryTimer = setTimeout(() => {
    clearAccess();
    void router.replace({ name: "login" });
  }, remaining);
  // Run Auth calls after the synchronous listener releases Supabase's session lock.
  accessTimer = setTimeout(async () => {
    try {
      const role = await getStaffPortalRole();
      if (version !== accessVersion) return;
      if (role && role === props.role) {
        schedulerToken.value = session.access_token ?? "";
        authorizedUserId = session.user.id;
        authorizedRole = role;
        accessVerified.value = true;
        return;
      }
    } catch {
      // Clear protected records when renewed access cannot be verified.
    }
    if (version === accessVersion) {
      clearAccess();
      void router.replace({ name: "login" });
    }
  }, 0);
}

const { data: { subscription } } = auth.onAuthStateChange((_event, session) => checkSession(session));
watch(() => props.role, () => checkSession(currentSession));
onUnmounted(() => {
  clearAccess();
  subscription.unsubscribe();
});
// Session Access END

// Staff Sign-out START
async function signOut() {
  signingOut.value = true;
  signOutError.value = false;
  try {
    const { error } = await auth.signOut({ scope: "local" });
    if (error) throw error;
    await router.replace({ name: "login" });
  } catch {
    signOutError.value = true;
  } finally {
    signingOut.value = false;
  }
}
// Staff Sign-out END

// Side Panel START
type NavItem = {
  id: string; label: string; icon: string; target?: string; to?: RouteLocationRaw; newTab?: boolean; soon?: boolean;
  /** Opens this step of the embedded scheduling workbench. */
  scheduler?: SchedulerNavId; step?: number;
};
type NavGroup = { label: string; items: NavItem[] };

const workspaceItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: "grid", target: "staff-dashboard-heading" },
];

/** Only what each role opens most; everything else is one step away inside it. */
const navGroups = computed<NavGroup[]>(() => {
  // The Coordinator's workbench has its own step stations and "Continue" button, so the side
  // panel only opens it at the current step, or the published timetable.
  if (props.role === "academic_coordinator") {
    const current = (["loads", "times", "generate", "review"] as const).find((id) => schedulerSteps.value[id]?.state === "now") ?? "loads";
    return [
      { label: "Workspace", items: [{ id: "overview", label: "Overview", icon: "grid", scheduler: "overview" }] },
      { label: "Scheduling", items: [
        { id: current, label: "Scheduling workbench", icon: "clock", scheduler: current },
        { id: "published", label: "Published timetable", icon: "eye", scheduler: "published" },
      ] },
    ];
  }
  const groups: NavGroup[] = [{ label: "Workspace", items: workspaceItems }];
  if (props.role === "admin") {
    // Create account is the banner's button; content sections live in the content workspace's own side panel.
    if (canManageAccounts.value) {
      groups.push({ label: "Accounts", items: [{ id: "accounts", label: "Staff accounts", icon: "users", target: "staff-accounts-heading" }] });
    }
    if (cmsPreviewEnabled) {
      groups.push({ label: "Website", items: [{ id: "content", label: "Website content", icon: "files", to: { name: "content-workspace" } }] });
    }
  } else if (props.role === "registrar") {
    groups.push({ label: "Enrollment", items: [{ id: "applications", label: "Applications", icon: "inbox", target: "registrar-applications-heading" }] });
  } else if (props.role === "teacher") {
    groups.push({ label: "My teaching", items: [{ id: "schedule", label: "My schedule", icon: "clock", target: "teacher-schedule-heading" }] });
  }
  return groups;
});

const activeId = ref("overview");
const activeLabel = computed(() => navGroups.value.flatMap((group) => group.items).find((item) => item.id === activeId.value)?.label
  ?? (["loads", "times", "generate", "review"].includes(activeId.value) ? "Scheduling workbench" : "Overview"));

const intro = computed(() => {
  switch (props.role) {
    case "admin":
      if (canManageAccounts.value === false) return "Manage the announcements, events, pages and PDFs on the school website.";
      return "Create staff accounts, assign roles, reset passwords and deactivate access, and keep the school website up to date.";
    case "registrar": return "Review enrollment applications, tick the requirements families present onsite, and update each status.";
    case "teacher": return "Your published weekly class schedule will appear here once the Academic Coordinator publishes it.";
    default: return "";
  }
});

// Scheduling workbench (Academic Coordinator)
const schedulerPanel = ref<InstanceType<typeof CoordinatorSchedulerPanel>>();
const schedulerSteps = ref<Record<string, SchedulerStep>>({});
function onSchedulerState(state: SchedulerState) {
  schedulerSteps.value = Object.fromEntries(state.steps.map((step) => [step.id, step]));
  if (state.view in schedulerViews) activeId.value = state.view;
}
function stepState(item: NavItem) {
  return schedulerSteps.value[item.id]?.state ?? "todo";
}

/** Scrolls to a section of this dashboard, or opens a workbench step, and moves keyboard focus there. */
async function goTo(item: NavItem) {
  if (item.scheduler) {
    activeId.value = item.id;
    menuOpen.value = false;
    schedulerPanel.value?.showView(schedulerViews[item.scheduler]);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (!item.target) return;
  activeId.value = item.id;
  menuOpen.value = false;
  await nextTick();
  const element = document.getElementById(item.target);
  if (!element) return;
  if (item.id === "overview") window.scrollTo({ top: 0, behavior: "smooth" });
  else element.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
  element.focus({ preventScroll: true });
}

// The side panel can shrink to an icon strip; the choice is remembered in this browser.
const collapsedKey = "sncs-staff-sidebar";
const collapsed = ref(false);
const menuOpen = ref(false);
onMounted(() => {
  try { collapsed.value = localStorage.getItem(collapsedKey) === "collapsed"; } catch { /* storage unavailable */ }
});
function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  try { localStorage.setItem(collapsedKey, collapsed.value ? "collapsed" : "expanded"); } catch { /* storage unavailable */ }
}
// The content workspace's "Staff accounts" link opens /admin#staff-accounts: go straight to the list
// once the accounts panel has confirmed this Admin may manage staff accounts.
watch(canManageAccounts, async (allowed) => {
  if (!allowed || route.hash !== "#staff-accounts") return;
  await nextTick();
  void goTo({ id: "accounts", label: "Staff accounts", icon: "users", target: "staff-accounts-heading" });
});
watch(() => props.role, () => {
  activeId.value = "overview";
  canManageAccounts.value = undefined;
  schedulerSteps.value = {};
});
// Side Panel END

</script>

<template>
  <div v-if="accessVerified" :key="contentVersion" class="portal" :class="{ 'portal-collapsed': collapsed }"
    @keydown.esc="menuOpen = false">
    <aside class="portal-sidebar" :class="{ 'portal-menu-open': menuOpen }">
      <div class="portal-brand-row">
        <button type="button" class="portal-brand" @click="goTo(workspaceItems[0])">
          <img class="portal-seal" src="/images/source-site/sncs-seal.png" alt="Sto. Niño Catholic School seal" width="40" height="40" />
          <span class="portal-brand-text"><strong>SNCS</strong><small>{{ roleLabel }} portal</small></span>
        </button>
        <button type="button" class="portal-collapse" :aria-label="collapsed ? 'Expand side panel' : 'Shrink side panel'"
          :aria-expanded="!collapsed" aria-controls="portal-navigation" :title="collapsed ? 'Expand side panel' : 'Shrink side panel'"
          @click="toggleCollapsed">
          <CmsIcon :name="collapsed ? 'collapse-right' : 'collapse-left'" :size="16" />
        </button>
        <button type="button" class="portal-menu" :aria-label="menuOpen ? 'Close navigation' : 'Open navigation'"
          :aria-expanded="menuOpen" aria-controls="portal-navigation portal-sidebar-footer" @click="menuOpen = !menuOpen">
          <CmsIcon :name="menuOpen ? 'close' : 'menu'" />
        </button>
      </div>

      <nav id="portal-navigation" class="portal-nav" aria-label="Dashboard navigation">
        <template v-for="group in navGroups" :key="group.label">
          <p class="portal-nav-label">{{ group.label }}</p>
          <template v-for="item in group.items" :key="item.id">
            <RouterLink v-if="item.to" class="portal-nav-item" :to="item.to" :data-label="item.label"
              :target="item.newTab ? '_blank' : undefined" :rel="item.newTab ? 'noopener' : undefined">
              <CmsIcon :name="item.icon" :size="18" /><span class="portal-nav-text">{{ item.label }}</span>
              <span v-if="item.newTab" class="sr-only"> (opens in a new tab)</span>
            </RouterLink>
            <span v-else-if="item.soon" class="portal-nav-item portal-nav-soon" :data-label="`${item.label} (coming soon)`">
              <CmsIcon :name="item.icon" :size="18" /><span class="portal-nav-text">{{ item.label }}</span>
              <span class="portal-soon">Soon</span>
            </span>
            <button v-else type="button" class="portal-nav-item" :class="{ 'portal-nav-active': activeId === item.id }"
              :aria-current="activeId === item.id ? 'true' : undefined" :data-label="item.label" @click="goTo(item)">
              <span v-if="item.step" class="portal-step-dot" :data-state="stepState(item)" aria-hidden="true">{{ stepState(item) === "done" ? "✓" : item.step }}</span>
              <CmsIcon v-else :name="item.icon" :size="18" />
              <span class="portal-nav-text">{{ item.label }}</span>
              <span v-if="item.step" class="sr-only">, step {{ item.step }}{{ stepState(item) === "done" ? ", done" : stepState(item) === "now" ? ", next" : "" }}</span>
            </button>
          </template>
        </template>
      </nav>

      <div id="portal-sidebar-footer" class="portal-sidebar-footer">
        <RouterLink class="portal-nav-item portal-link" to="/" target="_blank" rel="noopener" data-label="School website">
          <CmsIcon name="external" :size="17" /><span class="portal-nav-text">School website</span>
          <span class="sr-only"> (opens in a new tab)</span>
        </RouterLink>
        <div class="portal-user" :title="`${staffName || 'Signed in'} · ${roleLabel}`">
          <span class="portal-avatar" aria-hidden="true">{{ initials }}</span>
          <span class="portal-user-text">
            <span class="portal-user-name">{{ staffName || "Signed in" }}</span>
            <span class="portal-user-role">{{ roleLabel }}</span>
          </span>
        </div>
        <button type="button" class="portal-nav-item portal-signout" :disabled="signingOut" data-label="Sign out" @click="signOut">
          <CmsIcon name="logout" :size="17" /><span class="portal-nav-text">{{ signingOut ? "Signing out…" : "Sign out" }}</span>
        </button>
      </div>
    </aside>

    <div class="portal-workspace">
      <header class="portal-topbar">
        <div class="portal-breadcrumb"><span>{{ heading }}</span><CmsIcon name="chevron" :size="14" /><strong>{{ activeLabel }}</strong></div>
        <span class="portal-signed-in"><i aria-hidden="true"></i> Signed in as {{ roleLabel }}</span>
      </header>

      <section class="portal-main" aria-labelledby="staff-dashboard-heading">
        <p v-if="signOutError" class="portal-alert" role="alert">Could not sign out. Please try again.</p>

        <!-- The scheduling workbench draws the Coordinator's overview itself. -->
        <h1 v-if="role === 'academic_coordinator'" id="staff-dashboard-heading" class="sr-only" tabindex="-1">{{ heading }}</h1>
        <div v-else class="portal-hero">
          <div class="portal-hero-copy">
            <div class="portal-school-label"><span></span> STO. NIÑO CATHOLIC SCHOOL</div>
            <h1 id="staff-dashboard-heading" tabindex="-1">{{ heading }}</h1>
            <p>{{ intro }}</p>
            <button v-if="role === 'admin' && canManageAccounts" type="button" class="portal-hero-button"
              @click="goTo({ id: 'create', label: 'Create account', icon: 'user-plus', target: 'create-account-heading' })">
              <CmsIcon name="user-plus" :size="18" /> Create account
            </button>
            <RouterLink v-else-if="role === 'admin' && canManageAccounts === false && cmsPreviewEnabled" class="portal-hero-button"
              :to="{ name: 'content-workspace' }">
              <CmsIcon name="files" :size="18" /> Open content workspace
            </RouterLink>
            <button v-else-if="role === 'registrar'" type="button" class="portal-hero-button"
              @click="goTo({ id: 'applications', label: 'Applications', icon: 'inbox', target: 'registrar-applications-heading' })">
              <CmsIcon name="inbox" :size="18" /> Review applications
            </button>
            <button v-else-if="role === 'teacher'" type="button" class="portal-hero-button"
              @click="goTo({ id: 'schedule', label: 'My schedule', icon: 'clock', target: 'teacher-schedule-heading' })">
              <CmsIcon name="clock" :size="18" /> View my schedule
            </button>
          </div>
        </div>

        <section v-if="summaryCards.length" class="portal-stats" aria-label="Summary">
          <div v-for="card in summaryCards" :key="card.id" class="portal-stat">
            <span class="portal-stat-icon" :data-card="card.id"><CmsIcon :name="card.icon" :size="19" /></span>
            <strong>{{ card.value }}</strong>
            <span class="portal-stat-label">{{ card.label }}</span>
            <small>{{ card.note }}</small>
          </div>
        </section>

        <section v-if="role === 'admin' && cmsPreviewEnabled" class="portal-content-card" aria-labelledby="portal-content-title">
          <div>
            <h2 id="portal-content-title">Website content</h2>
            <p>Manage the school website's news, events, pages and PDF resources in the SNCS content workspace.</p>
            <p v-if="cmsDatabaseEnabled" class="portal-content-note">What you publish appears on the school website right away.</p>
            <p v-else class="portal-content-note">Preview: content changes stay in this browser until the content database is connected.</p>
          </div>
          <RouterLink class="portal-content-open" :to="{ name: 'content-workspace' }">Open content workspace</RouterLink>
        </section>
        <div v-if="role === 'admin'" v-show="canManageAccounts !== false" class="portal-section">
          <StaffAccountsPanel @access="canManageAccounts = $event" @summary="accountCounts = $event" />
        </div>
        <div v-if="role === 'registrar'" class="portal-section">
          <RegistrarApplicationsPanel :staff-name="staffName" />
        </div>
        <div v-if="role === 'academic_coordinator'" id="portal-scheduling" class="portal-section">
          <CoordinatorSchedulerPanel ref="schedulerPanel" :access-token="schedulerToken" @state="onSchedulerState" />
        </div>
        <div v-if="role === 'teacher'" class="portal-section">
          <TeacherSchedulePanel @loaded="teacherSchedule = $event" />
        </div>
      </section>
    </div>
  </div>
  <p v-else class="portal-verifying" role="status">Verifying staff access…</p>
</template>

<style scoped>
/* Same look as the SNCS content workspace (src/assets/cms-preview.css). */
.portal {
  --side: 226px;
  --side-collapsed: 74px;
  --portal-ink: #261d20;
  --portal-muted: #665b60;
  --portal-border: #ece3e1;
  --portal-gold: #f4d88b;
  display: grid;
  grid-template-columns: var(--side) minmax(0, 1fr);
  align-items: start;
  min-height: 100dvh;
  background: #f8f5f3;
  color: var(--portal-ink);
  transition: grid-template-columns .2s ease;
}
.portal-collapsed { grid-template-columns: var(--side-collapsed) minmax(0, 1fr); }
.portal :focus-visible { outline: 2px solid #245d96; outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Side panel */
.portal-sidebar {
  position: sticky; top: 0; z-index: 20; align-self: start;
  display: flex; flex-direction: column; gap: 18px;
  min-height: 100dvh; max-height: 100dvh; overflow-x: hidden; overflow-y: auto;
  padding: 21px 15px 16px;
  background: linear-gradient(160deg, var(--red-800), var(--red-950) 82%);
  color: #fff7f4;
}
.portal-sidebar :focus-visible { outline-color: var(--portal-gold); }
.portal-brand-row { display: flex; align-items: center; gap: 6px; }
.portal-brand { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 3px 4px 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.portal-seal { flex: none; width: 40px; height: 40px; padding: 2px; border-radius: 50%; background: #fff; object-fit: contain; }
.portal-brand-text { display: grid; min-width: 0; }
.portal-brand-text strong { font-size: 1.16rem; font-weight: 800; letter-spacing: .08em; }
.portal-brand-text small { margin-top: 2px; color: #f2c8ba; font-size: .72rem; }
.portal-collapse, .portal-menu { display: grid; flex: none; place-items: center; width: 32px; height: 32px; margin-left: auto; border: 1px solid #ffffff2b; border-radius: 8px; background: #ffffff10; color: #fff; cursor: pointer; }
.portal-collapse:hover, .portal-menu:hover { background: #ffffff22; }
.portal-menu { display: none; }
.portal-nav, .portal-sidebar-footer { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.portal-nav-label { margin: 14px 10px 4px; color: #f0c3b5; font-size: .67rem; font-weight: 700; letter-spacing: .11em; text-transform: uppercase; white-space: nowrap; }
.portal-nav-label:first-child { margin-top: 0; }
.portal-nav-item {
  position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; min-height: 44px;
  padding: 8px 10px; border: 1px solid transparent; border-radius: 8px; background: transparent;
  color: #f7e7e8; font: inherit; font-size: .9rem; text-align: left; text-decoration: none; white-space: nowrap; cursor: pointer;
}
.portal-nav-item:hover:not(:disabled):not(.portal-nav-soon) { background: #ffffff12; }
.portal-nav-active { border-color: #ffffff1f; background: var(--red-700); color: #fff; font-weight: 700; }
.portal-nav-active svg { color: var(--portal-gold); }
.portal-nav-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.portal-nav-soon { cursor: default; opacity: .6; }
.portal-soon { flex: none; margin-left: auto; padding: 1px 7px; border-radius: 999px; background: #ffffff1c; color: #f7dcd3; font-size: .66rem; font-weight: 700; }
.portal-sidebar-footer { margin-top: auto; gap: 2px; }
.portal-link, .portal-signout { font-size: .83rem; }
.portal-signout:disabled { opacity: .6; cursor: progress; }
.portal-user { display: flex; align-items: center; gap: 10px; min-width: 0; margin-top: 9px; padding: 16px 5px 6px; border-top: 1px solid #ffffff23; }
.portal-avatar { display: grid; flex: none; place-items: center; width: 35px; height: 35px; border-radius: 50%; background: #f1d8ac; color: #4d1c23; font-size: .72rem; font-weight: 800; }
.portal-user-text { display: grid; min-width: 0; line-height: 1.25; }
.portal-user-name { overflow: hidden; font-size: .78rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.portal-user-role { margin-top: 2px; color: #f2c8ba; font-size: .72rem; }

/* Shrunk: an icon strip. Names stay readable to screen readers and appear on hover or focus. */
.portal-collapsed .portal-sidebar { overflow: visible; padding-inline: 12px; }
.portal-collapsed .portal-brand-row { flex-direction: column; gap: 12px; }
.portal-collapsed .portal-brand { padding: 0; }
.portal-collapsed .portal-collapse { margin: 0; }
.portal-collapsed :is(.portal-brand-text, .portal-nav-text, .portal-user-text) {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}
.portal-collapsed .portal-soon { display: none; }
.portal-collapsed .portal-nav-label { height: 1px; margin: 12px 6px 6px; overflow: hidden; background: #ffffff26; color: transparent; }
.portal-collapsed .portal-nav-label:first-child { margin-top: 0; }
.portal-collapsed .portal-nav-item { justify-content: center; padding-inline: 0; }
.portal-collapsed .portal-user { justify-content: center; padding-inline: 0; }
.portal-collapsed .portal-nav-item:is(:hover, :focus-visible)::after {
  content: attr(data-label); position: absolute; top: 50%; left: calc(100% + 12px); z-index: 30; transform: translateY(-50%);
  padding: 6px 10px; border-radius: 6px; background: var(--portal-ink); color: #fff; font-size: .78rem; font-weight: 600;
  white-space: nowrap; pointer-events: none;
}

/* Workspace */
.portal-workspace { min-width: 0; }
.portal-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 63px; padding: 8px clamp(20px, 3vw, 42px); border-bottom: 1px solid var(--portal-border); background: #fffdfc; }
.portal-breadcrumb { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--portal-muted); font-size: .83rem; }
.portal-breadcrumb strong { color: var(--portal-ink); }
.portal-signed-in { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid #e8d7bb; border-radius: 20px; background: #fff8e8; color: #654b23; font-size: .72rem; font-weight: 700; white-space: nowrap; }
.portal-signed-in i { width: 7px; height: 7px; border-radius: 50%; background: #2e7d5b; }
.portal-main { width: min(100%, 1440px); margin: 0 auto; padding: 26px clamp(20px, 3vw, 42px) 42px; }
.portal-verifying { width: min(1200px, calc(100% - 32px)); margin: 3rem auto; color: var(--muted); }

.portal-hero {
  overflow: hidden; margin-bottom: 18px; border: 1px solid var(--red-800); border-radius: 15px; color: #fff;
  background: var(--red-900);
  background-image: linear-gradient(90deg, var(--red-900) 41%, #861e15d9 59%, #951e148c 73%, #45100a64), url("/images/source-site/campus-front.jpg");
  background-position: left, right 46%; background-repeat: no-repeat; background-size: cover, 59% auto;
}
.portal-hero-copy { padding: 26px clamp(21px, 3.4vw, 45px) 29px; }
.portal-school-label { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #f7db9e; font-size: .65rem; font-weight: 800; letter-spacing: .13em; }
.portal-school-label span { width: 7px; height: 7px; background: var(--portal-gold); transform: rotate(45deg) scale(.75); }
.portal-hero h1 { margin: 0; color: #fff; font-size: clamp(1.95rem, 3.2vw, 2.9rem); letter-spacing: -.035em; line-height: 1.17; }
.portal-hero h1:focus { outline: none; }
.portal-hero p { max-width: 440px; margin: 9px 0 19px; color: #fae9ec; font-size: .96rem; line-height: 1.55; }
.portal-hero p:last-child { margin-bottom: 0; }
.portal-hero-button { display: inline-flex; align-items: center; gap: 7px; min-height: 42px; padding: 7px 13px; border: 1px solid var(--portal-gold); border-radius: 8px; background: var(--portal-gold); color: #3f2024; font: inherit; font-weight: 700; cursor: pointer; }
.portal-hero-button:hover { background: #fce9aa; }
a.portal-hero-button { text-decoration: none; }

/* Summary cards, as on the content workspace overview */
.portal-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 0 0 18px; }
.portal-stat { display: grid; gap: 2px; padding: 15px 16px 16px; border: 1px solid var(--portal-border); border-radius: 13px; background: #fff; box-shadow: 0 2px 8px #3f191605; }
.portal-stat strong { margin-top: 10px; font-size: 1.85rem; line-height: 1.1; letter-spacing: -.03em; }
.portal-stat-label { font-weight: 700; }
.portal-stat small { color: var(--portal-muted); font-size: .8rem; }
.portal-stat-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: #fbe9e6; color: var(--red-800); }
.portal-stat-icon[data-card="active"], .portal-stat-icon[data-card="published"] { background: #e7f4eb; color: #28654e; }
.portal-stat-icon[data-card="draft"], .portal-stat-icon[data-card="hours"] { background: #fff4d8; color: #7a5a12; }
.portal-stat-icon[data-card="inactive"], .portal-stat-icon[data-card="archived"] { background: #f0ecee; color: #66515c; }
.portal-hero :focus-visible { outline-color: var(--portal-gold); }

.portal-card { margin-bottom: 18px; border: 1px solid var(--portal-border); border-radius: 13px; background: #fff; box-shadow: 0 2px 8px #3f191605; }
.portal-section { scroll-margin-top: 16px; }
.portal-step-dot { display: grid; flex: none; place-items: center; width: 20px; height: 20px; border: 1.5px solid #f2c8ba; border-radius: 50%; color: #f7e7e8; font-size: .66rem; font-weight: 800; }
.portal-step-dot[data-state="done"] { border-color: var(--portal-gold); background: var(--portal-gold); color: #4d1c23; }
.portal-step-dot[data-state="now"] { border-color: var(--portal-gold); color: var(--portal-gold); box-shadow: 0 0 0 3px #f4d88b33; }
.portal-content-card { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem 2rem; margin: 0 0 18px; padding: 17px 19px; border: 1px solid var(--portal-border); border-left: 4px solid var(--gold-500); border-radius: 13px; background: #fff; box-shadow: 0 2px 8px #3f191605; }
.portal-content-card h2 { margin: 0 0 .25rem; font-size: 1.1rem; }
.portal-content-card p { margin: 0; color: var(--portal-muted); font-size: .9rem; }
.portal-content-card .portal-content-note { margin-top: .3rem; font-size: .8rem; }
.portal-content-open { display: inline-flex; align-items: center; min-height: 42px; padding: .55rem 1rem; border-radius: 8px; background: var(--red-700); color: #fff; font-weight: 700; text-decoration: none; white-space: nowrap; }
.portal-content-open:hover { background: var(--red-800); }
.portal-empty { display: grid; justify-items: center; gap: 8px; padding: 46px 20px 50px; text-align: center; }
.portal-empty-icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 14px; background: #e5eef8; color: #24507a; }
.portal-empty h2 { margin: 0; font-size: 1.25rem; }
.portal-empty p { max-width: 440px; margin: 0; color: var(--portal-muted); line-height: 1.5; }
.portal-alert { margin: 0 0 1rem; padding: .7rem 1rem; border: 1px solid #f3c1bb; border-radius: 8px; background: #fde3df; color: var(--red-800); font-weight: 700; }

@media (prefers-reduced-motion: reduce) { .portal { transition: none; } }

/* Phones and small tablets: the side panel becomes a top bar with a menu. */
@media (max-width: 860px) {
  .portal, .portal-collapsed { grid-template-columns: minmax(0, 1fr); }
  .portal-sidebar, .portal-collapsed .portal-sidebar { min-height: 0; max-height: none; gap: 0; overflow: visible; padding: 10px 14px; }
  .portal-collapse { display: none; }
  .portal-menu { display: grid; width: 40px; height: 40px; }
  .portal-collapsed .portal-brand-row { flex-direction: row; }
  .portal-collapsed :is(.portal-brand-text, .portal-nav-text, .portal-user-text) { position: static; width: auto; height: auto; overflow: hidden; clip: auto; }
  .portal-collapsed .portal-nav-label { height: auto; margin: 14px 10px 4px; background: none; color: #f0c3b5; }
  .portal-collapsed .portal-nav-item { justify-content: flex-start; padding-inline: 10px; }
  .portal-collapsed .portal-nav-item::after { content: none; }
  .portal-collapsed .portal-soon { display: inline; }
  .portal-nav, .portal-sidebar-footer { display: none; }
  .portal-menu-open :is(.portal-nav, .portal-sidebar-footer) { display: grid; margin-top: 12px; }
  .portal-signed-in { display: none; }
  .portal-hero { background-size: cover, 0 0; }
}
@media (max-width: 1100px) { .portal-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .portal-stats { grid-template-columns: minmax(0, 1fr); } }
</style>
