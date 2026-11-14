<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261113
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261114
-->
<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { getStaffSupabaseClient } from "@/lib/supabase";

defineProps<{ heading: string }>();

const router = useRouter();
const { auth } = getStaffSupabaseClient();
const signingOut = ref(false);
const signOutError = ref(false);

// Session Expiry START
// Token refresh replaces the deadline. An expired session leaves the open dashboard even if refresh fails.
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
  clearTimeout(expiryTimer);
  const remaining = (session?.expires_at ?? 0) * 1000 - Date.now();
  if (remaining <= 0) {
    void router.replace({ name: "login" });
    return;
  }
  expiryTimer = setTimeout(() => void router.replace({ name: "login" }), remaining);
});
onUnmounted(() => {
  clearTimeout(expiryTimer);
  subscription.unsubscribe();
});
// Session Expiry END

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
  <section class="section container" aria-labelledby="staff-dashboard-heading">
    <div class="section-row">
      <h1 id="staff-dashboard-heading">{{ heading }}</h1>
      <button type="button" class="button button-secondary" :disabled="signingOut" @click="signOut">
        {{ signingOut ? "Signing out…" : "Sign out" }}
      </button>
    </div>
    <p v-if="signOutError" role="alert">Could not sign out. Please try again.</p>
    <RouterLink class="text-link" to="/">Back to school website</RouterLink>
  </section>
</template>
