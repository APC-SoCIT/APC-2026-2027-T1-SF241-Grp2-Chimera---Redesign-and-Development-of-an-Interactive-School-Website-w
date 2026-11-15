<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261114
-->
<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { getStaffSupabaseClient } from "@/lib/supabase";

const router = useRouter();
const { auth } = getStaffSupabaseClient();
const temporary = ref("");
const password = ref("");
const confirmation = ref("");
const busy = ref(false);
const feedback = ref("");

// Required Password Change START
async function changePassword() {
  if (busy.value) return;
  feedback.value = "";
  if (password.value !== confirmation.value || password.value === temporary.value ||
    password.value.length < 12 || new TextEncoder().encode(password.value).length > 72) {
    feedback.value = "Use matching new passwords with at least 12 characters and at most 72 bytes. Choose a different password.";
    return;
  }
  busy.value = true;
  try {
    const { data: { session } } = await auth.getSession();
    if (!session) {
      feedback.value = "Sign in again to change your password.";
      return;
    }
    const response = await fetch("/api/staff/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "complete-password-change", temporaryPassword: temporary.value, password: password.value }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      feedback.value = result?.message ?? "Could not update the password. Sign in again to retry.";
      return;
    }
    await auth.signOut({ scope: "local" }).catch(() => {});
    await router.replace({ name: "login", query: { passwordChanged: "1" } });
  } catch {
    feedback.value = "Could not verify the password change. Sign in again and check your access.";
  } finally {
    temporary.value = "";
    password.value = "";
    confirmation.value = "";
    busy.value = false;
  }
}
// Required Password Change END
</script>

<template>
  <section class="section container" aria-labelledby="change-password-heading">
    <h1 id="change-password-heading">Change your password</h1>
    <p>Set a new password to continue to your staff dashboard.</p>
    <form @submit.prevent="changePassword">
      <label>Temporary password <input v-model="temporary" type="password" autocomplete="current-password" required /></label>
      <label>New password <input v-model="password" type="password" autocomplete="new-password" required minlength="12" maxlength="72" /></label>
      <label>Confirm new password <input v-model="confirmation" type="password" autocomplete="new-password" required minlength="12" maxlength="72" /></label>
      <p v-if="feedback" role="alert">{{ feedback }}</p>
      <button class="button button-secondary" type="submit" :disabled="busy">{{ busy ? "Saving…" : "Save password" }}</button>
      <RouterLink class="text-link" to="/login">Back to sign in</RouterLink>
    </form>
  </section>
</template>

<style scoped>
form { display: grid; gap: 1rem; max-width: 26rem; }
label { display: grid; gap: .35rem; font-weight: 700; }
input { min-height: 44px; border: 1px solid var(--muted); border-radius: 4px; padding: .45rem; font: inherit; }
form p { margin: 0; color: var(--red-800); }
</style>
