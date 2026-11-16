<script setup lang="ts">
import { ref, useTemplateRef } from "vue";

const emit = defineEmits<{ signIn: [] }>();
const email = ref("");
const password = ref("");
const showPassword = ref(false);
const error = ref("");
const passwordInput = useTemplateRef<HTMLInputElement>("password");

function signIn() {
  if (email.value.trim().toLowerCase() === "admin@sncs.example" && password.value === "SNCS-Preview-26!") {
    emit("signIn");
    return;
  }
  error.value = "The email or password is incorrect. Try the demo credentials.";
  passwordInput.value?.focus();
}
</script>

<template>
  <section class="cms-login" aria-labelledby="cms-login-title">
    <div class="cms-login-campus">
      <img src="/images/source-site/sncs-seal.png" alt="" width="54" height="54" />
      <p>Sto. Niño Catholic School</p>
      <strong>Content workspace</strong>
    </div>
    <div class="cms-login-panel">
      <h1 id="cms-login-title" tabindex="-1">Staff sign-in</h1>
      <p>Sign in to manage content for the school website.</p>
      <form class="cms-login-form" @submit.prevent="signIn">
        <div v-if="error" class="cms-error" id="cms-login-error" role="alert">{{ error }}</div>
        <div class="cms-field">
          <label for="cms-login-email">Email address</label>
          <input id="cms-login-email" v-model="email" type="email" name="username" autocomplete="username"
            required :aria-describedby="error ? 'cms-login-error' : undefined" />
        </div>
        <div class="cms-field">
          <label for="cms-login-password">Password</label>
          <div class="cms-password-field">
            <input id="cms-login-password" ref="password" v-model="password" :type="showPassword ? 'text' : 'password'"
              name="password" required autocomplete="current-password" :aria-describedby="error ? 'cms-login-error' : undefined" />
            <button type="button" class="cms-button" :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button>
          </div>
        </div>
        <button type="submit" class="cms-button cms-primary">Sign in</button>
      </form>
      <p class="cms-login-note">Use the demo account shared with this preview. Changes stay in this browser.</p>
    </div>
  </section>
</template>
