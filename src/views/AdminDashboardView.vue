<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261113
-->
<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { getStaffSupabaseClient } from "@/lib/supabase";

const router = useRouter();
const { auth } = getStaffSupabaseClient();
const signingOut = ref(false);
const signOutError = ref(false);

// Leave the dashboard when Supabase clears the session, including in another tab.
const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
  if (!session) void router.replace({ name: "login" });
});
onUnmounted(() => subscription.unsubscribe());

// Admin Sign-out START
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
// Admin Sign-out END
</script>

<template>
  <section class="section container" aria-labelledby="admin-heading">
    <div class="section-row">
      <h1 id="admin-heading">Admin dashboard</h1>
      <button type="button" class="button button-secondary" :disabled="signingOut" @click="signOut">
        {{ signingOut ? "Signing out…" : "Sign out" }}
      </button>
    </div>
    <p v-if="signOutError" role="alert">Could not sign out. Please try again.</p>
    <RouterLink class="text-link" to="/">Back to school website</RouterLink>
  </section>
</template>
