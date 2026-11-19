<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261113
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261119
-->
<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
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

// Session Access START
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let accessTimer: ReturnType<typeof setTimeout> | undefined;
let currentSession: Session | null = null;

function clearAccess() {
  accessVerified.value = false;
  contentVersion.value += 1;
  clearTimeout(expiryTimer);
  clearTimeout(accessTimer);
}

function checkSession(session: Session | null) {
  currentSession = session;
  // Unmount cached records before checking the new session's current database role.
  clearAccess();
  const version = contentVersion.value;
  const remaining = (session?.expires_at ?? 0) * 1000 - Date.now();
  if (!session?.user?.id || remaining <= 0) {
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
      if (version !== contentVersion.value) return;
      if (role && role === props.role) {
        accessVerified.value = true;
        return;
      }
    } catch {
      // Leave protected content unmounted when access cannot be verified.
    }
    if (version === contentVersion.value) void router.replace({ name: "login" });
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
  <section v-if="accessVerified" :key="contentVersion" class="section container" aria-labelledby="staff-dashboard-heading">
    <div class="section-row">
      <h1 id="staff-dashboard-heading">{{ heading }}</h1>
      <button type="button" class="button button-secondary" :disabled="signingOut" @click="signOut">
        {{ signingOut ? "Signing out…" : "Sign out" }}
      </button>
    </div>
    <p v-if="signOutError" role="alert">Could not sign out. Please try again.</p>
    <RouterLink class="text-link" to="/">Back to school website</RouterLink>
    <StaffAccountsPanel v-if="role === 'admin'" />
    <RegistrarApplicationsPanel v-if="role === 'registrar'" />
  </section>
  <p v-else class="container" role="status">Verifying staff access…</p>
</template>
