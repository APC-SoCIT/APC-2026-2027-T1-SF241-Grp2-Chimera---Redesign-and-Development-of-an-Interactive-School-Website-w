<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261113
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261119 (verify staff access on every session change)
  Modified by: Gian Mandac (branded staff portal bar with the SNCS seal)
  Modified Date: 20261119
-->
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { Session } from "@supabase/supabase-js";
import { RouterLink, useRouter } from "vue-router";
import { getStaffSupabaseClient } from "@/lib/supabase";
import { getStaffPortalRole, type StaffRole } from "@/lib/staff-auth";
import StaffAccountsPanel from "@/components/StaffAccountsPanel.vue";
import RegistrarApplicationsPanel from "@/components/RegistrarApplicationsPanel.vue";

const props = defineProps<{ heading: string; role?: StaffRole }>();

const router = useRouter();
const { auth } = getStaffSupabaseClient();
const signingOut = ref(false);
const signOutError = ref(false);
const accessVerified = ref(false);
const contentVersion = ref(0);
const staffName = ref("");

const roleLabels: Record<StaffRole, string> = { admin: "Admin", registrar: "Registrar", teacher: "Teacher" };
const roleLabel = computed(() => props.role ? roleLabels[props.role] : "Staff");
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

// Session Access START
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let accessTimer: ReturnType<typeof setTimeout> | undefined;
let currentSession: Session | null = null;
let authorizedUserId: string | undefined;
let authorizedRole: StaffRole | undefined;
let accessVersion = 0;

function clearAccess() {
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
</script>

<template>
  <div v-if="accessVerified" :key="contentVersion" class="portal">
    <header class="portal-bar">
      <div class="portal-bar-inner">
        <img class="portal-seal" src="/images/source-site/sncs-seal.png" alt="Sto. Niño Catholic School seal" width="46" height="46" />
        <div class="portal-title">
          <span class="portal-school">Sto. Niño Catholic School</span>
          <h1 id="staff-dashboard-heading">{{ heading }}</h1>
        </div>
        <div class="portal-tools">
          <RouterLink class="portal-link" to="/">School website</RouterLink>
          <div class="portal-user">
            <span class="portal-avatar" aria-hidden="true">{{ initials }}</span>
            <span class="portal-user-text">
              <span class="portal-user-name">{{ staffName || "Signed in" }}</span>
              <span class="portal-user-role">{{ roleLabel }}</span>
            </span>
          </div>
          <button type="button" class="portal-signout" :disabled="signingOut" @click="signOut">
            {{ signingOut ? "Signing out…" : "Sign out" }}
          </button>
        </div>
      </div>
    </header>

    <section class="portal-main" aria-labelledby="staff-dashboard-heading">
      <p v-if="signOutError" class="portal-alert" role="alert">Could not sign out. Please try again.</p>
      <StaffAccountsPanel v-if="role === 'admin'" />
      <RegistrarApplicationsPanel v-if="role === 'registrar'" :staff-name="staffName" />
    </section>
  </div>
  <p v-else class="portal-verifying" role="status">Verifying staff access…</p>
</template>

<style scoped>
.portal { min-height: 100vh; background: var(--cream-50); }
.portal-bar { background: var(--red-900); color: var(--white); border-bottom: 4px solid var(--gold-500); }
.portal-bar-inner { display: flex; align-items: center; gap: 1rem; width: min(1200px, calc(100% - 32px)); margin-inline: auto; padding-block: .7rem; }
.portal-seal { flex: none; width: 46px; height: 46px; padding: 3px; border-radius: 50%; background: var(--white); object-fit: contain; }
.portal-title { display: grid; min-width: 0; }
.portal-school { font-family: "Libre Franklin", sans-serif; font-size: 1rem; font-weight: 700; letter-spacing: -.01em; }
.portal-title h1 { margin: 0; color: var(--gold-300); font-family: "DM Sans", sans-serif; font-size: .85rem; font-weight: 600; letter-spacing: 0; line-height: 1.3; }
.portal-tools { display: flex; align-items: center; gap: 1rem; margin-left: auto; }
.portal-link { color: var(--white); font-size: .9rem; text-underline-offset: .25rem; opacity: .9; }
.portal-link:hover { opacity: 1; }
.portal-user { display: flex; align-items: center; gap: .6rem; min-width: 0; }
.portal-avatar { display: grid; flex: none; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--gold-500); color: var(--red-950); font-size: .85rem; font-weight: 800; }
.portal-user-text { display: grid; min-width: 0; line-height: 1.2; }
.portal-user-name { max-width: 220px; overflow: hidden; font-size: .92rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.portal-user-role { color: var(--gold-300); font-size: .78rem; }
.portal-signout { min-height: 40px; padding: .45rem .9rem; border: 1px solid rgb(255 255 255 / 45%); border-radius: 6px; background: transparent; color: var(--white); font: inherit; font-weight: 700; cursor: pointer; }
.portal-signout:hover { background: rgb(255 255 255 / 10%); }
.portal-signout:disabled { opacity: .6; cursor: progress; }
.portal-bar :focus-visible { outline: 3px solid var(--gold-300); outline-offset: 2px; }
.portal-main { width: min(1200px, calc(100% - 32px)); margin-inline: auto; padding: 1.6rem 0 4rem; }
.portal-verifying { width: min(1200px, calc(100% - 32px)); margin: 3rem auto; color: var(--muted); }
.portal-alert { margin: 0 0 1rem; padding: .7rem 1rem; border: 1px solid #f3c1bb; border-radius: 8px; background: #fde3df; color: var(--red-800); font-weight: 700; }

@media (max-width: 760px) {
  .portal-link, .portal-user-text { display: none; }
  .portal-school { font-size: .9rem; }
  .portal-tools { gap: .6rem; }
}
</style>
