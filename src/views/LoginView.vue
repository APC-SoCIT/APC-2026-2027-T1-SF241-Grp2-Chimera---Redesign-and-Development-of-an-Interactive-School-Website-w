<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261111
-->
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { RouterLink } from "vue-router";

const email = ref("");
const password = ref("");
const showPassword = ref(false);
const showHelp = ref(false);
const submitted = ref(false);
const unavailable = ref(false);
const emailInput = ref<HTMLInputElement | null>(null);
const passwordInput = ref<HTMLInputElement | null>(null);
const emailError = computed(() => !email.value.trim()
  ? "Enter your school email address."
  : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
    ? "Enter a valid email address."
    : "");
const passwordError = computed(() => password.value.length ? "" : "Enter your password.");

// Login Handler START
async function signIn() {
  submitted.value = true;
  unavailable.value = false;
  // Wait for the validation messages to render before focusing the first invalid field.
  await nextTick();
  if (emailError.value) return emailInput.value?.focus();
  if (passwordError.value) return passwordInput.value?.focus();
  // shortcut: UI preview only; connect verified staff authentication before enabling portal access.
  unavailable.value = true;
}
// Login Handler END
</script>

<template>
  <div class="login-page">
    <aside class="login-story" aria-label="Our school community">
      <img class="login-campus" src="/images/source-site/campus-front.jpg" alt="" />
      <div class="login-story-shade"></div>
      <RouterLink class="login-identity" to="/" aria-label="Sto. Niño Catholic School home">
        <img src="/images/source-site/sncs-seal.png" alt="" width="64" height="64" />
        <span><strong>Sto. Niño Catholic School, Inc.</strong><small>Signal Village, Taguig City</small></span>
      </RouterLink>
      <div class="login-story-copy">
        <span class="login-rule" aria-hidden="true"></span>
        <p class="login-kicker">Faith. Excellence. Service.</p>
        <h2>A community<br />we build together.</h2>
        <p>A shared space for the people who help our school grow, every day.</p>
      </div>
      <div class="login-story-bottom"><span>Simple. Humble. Competent.</span><span>SNCS</span></div>
    </aside>

    <section class="login-main" aria-labelledby="login-heading">
      <RouterLink class="login-back" to="/">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
        Back to school website
      </RouterLink>

      <div class="login-form-wrap">
        <div class="login-portal-label"><span aria-hidden="true"></span> SNCS staff portal</div>
        <h1 id="login-heading">Welcome back.</h1>
        <p class="login-intro">Sign in with your school account to continue.</p>

        <form class="login-form" novalidate @submit.prevent="signIn" @input="unavailable = false">
          <div v-if="unavailable" class="login-alert" role="alert">
            Sign-in is currently unavailable. Please contact the school administrator for assistance.
          </div>
          <div class="login-field">
            <label for="login-email">Email address</label>
            <input
              id="login-email" ref="emailInput" v-model="email" type="email" name="email"
              autocomplete="username" inputmode="email" autocapitalize="none" :spellcheck="false"
              placeholder="Enter your school email" required
              :aria-invalid="submitted && !!emailError" :aria-describedby="submitted && emailError ? 'email-error' : undefined"
            />
            <p v-if="submitted && emailError" id="email-error" class="login-field-error">{{ emailError }}</p>
          </div>
          <div class="login-field">
            <label for="login-password">Password</label>
            <div class="login-password-wrap">
              <input
                id="login-password" ref="passwordInput" v-model="password" :type="showPassword ? 'text' : 'password'"
                name="password" autocomplete="current-password" placeholder="Enter your password" required
                :aria-invalid="submitted && !!passwordError" :aria-describedby="submitted && passwordError ? 'password-error' : undefined"
              />
              <button
                class="login-password-toggle" type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'"
                :aria-pressed="showPassword" aria-controls="login-password" @click="showPassword = !showPassword"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
                  <path v-if="showPassword" d="m3 3 18 18" />
                </svg>
              </button>
            </div>
            <p v-if="submitted && passwordError" id="password-error" class="login-field-error">{{ passwordError }}</p>
          </div>
          <div class="login-help-row">
            <button type="button" class="login-text-button" :aria-expanded="showHelp" aria-controls="login-password-help" @click="showHelp = !showHelp">Forgot your password?</button>
          </div>
          <p v-if="showHelp" id="login-password-help" class="login-help-note" role="status">Contact the school administrator to request a password reset. For school contact details, <RouterLink to="/contact">visit our contact page</RouterLink>.</p>
          <button type="submit" class="login-submit">
            Sign in
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
          </button>
        </form>

        <div class="login-account-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></svg>
          <p>For authorized school personnel.<br /><span>Accounts are provided by the school administrator.</span></p>
        </div>
      </div>

      <footer class="login-footer"><span>© {{ new Date().getFullYear() }} Sto. Niño Catholic School, Inc.</span><RouterLink to="/contact">Need help?</RouterLink></footer>
    </section>
  </div>
</template>

<style scoped>
.login-page { display: grid; grid-template-columns: 1fr 1fr; min-height: 100svh; background: var(--cream-50); }
.login-story { position: relative; display: flex; flex-direction: column; justify-content: space-between; min-height: 760px; padding: 48px clamp(32px, 4.2vw, 72px) 34px; overflow: hidden; background: var(--red-950); color: white; isolation: isolate; }
.login-campus, .login-story-shade { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; }
.login-campus { object-fit: cover; object-position: 50% center; }
.login-story-shade { background: linear-gradient(180deg, rgb(48 9 6 / 70%) 0%, rgb(63 8 6 / 36%) 34%, rgb(63 8 6 / 91%) 77%, var(--red-950) 100%); }
.login-identity { display: flex; align-items: center; gap: 14px; text-decoration: none; }
.login-identity img { flex: 0 0 64px; object-fit: contain; }
.login-identity span { display: grid; gap: 7px; }
.login-identity strong { max-width: 250px; font-family: "Libre Franklin", sans-serif; font-size: .96rem; line-height: 1.5; }
.login-identity small { color: rgb(255 255 255 / 79%); font-size: .74rem; }
.login-story-copy { margin-top: auto; padding-top: 200px; padding-bottom: 62px; max-width: 490px; }
.login-rule { display: block; width: 42px; height: 3px; margin-bottom: 27px; background: var(--gold-500); }
.login-kicker { margin: 0 0 20px; font-size: .7rem; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--gold-300); }
.login-story h2 { color: white; font-size: clamp(2rem, 3.5vw, 3.6rem); font-weight: 600; line-height: 1.14; letter-spacing: -.045em; }
.login-story-copy > p:last-child { max-width: 340px; margin: 23px 0 0; font-size: .94rem; line-height: 1.8; color: rgb(255 255 255 / 79%); }
.login-story-bottom { display: flex; justify-content: space-between; gap: 15px; padding-top: 24px; border-top: 1px solid rgb(255 255 255 / 20%); font-size: .66rem; letter-spacing: .07em; color: rgb(255 255 255 / 72%); }
.login-story-bottom > span:last-child { color: var(--gold-300); font-weight: 700; letter-spacing: .2em; }
.login-main { display: flex; flex-direction: column; min-width: 0; padding: 36px clamp(28px, 4.6vw, 80px) 25px; }
.login-back { display: inline-flex; align-items: center; gap: 9px; align-self: flex-start; min-height: 44px; color: var(--muted); font-size: .78rem; text-decoration: none; }
.login-back:hover { color: var(--red-800); }
.login-back svg { width: 17px; height: 17px; }
.login-form-wrap { width: 100%; max-width: 390px; margin: auto; padding-block: 60px; }
.login-portal-label { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 23px; padding: 7px 11px; border: 1px solid var(--line); border-radius: 5px; font-size: .64rem; font-weight: 700; color: var(--red-800); text-transform: uppercase; letter-spacing: .13em; }
.login-portal-label span { width: 5px; height: 5px; background: var(--gold-500); border-radius: 50%; }
.login-main h1 { font-size: clamp(2rem, 3.2vw, 2.75rem); font-weight: 700; letter-spacing: -.05em; line-height: 1.2; }
.login-intro { margin: 13px 0 34px; color: var(--muted); font-size: .91rem; }
.login-form { display: grid; gap: 23px; }
.login-field { display: grid; gap: 10px; }
.login-field label { font-size: .8rem; font-weight: 700; }
.login-field input { width: 100%; min-width: 0; min-height: 52px; padding: 14px 15px; border: 1px solid #d9cec5; border-radius: 6px; background: white; color: var(--ink); font: inherit; font-size: .86rem; transition: border-color .15s, box-shadow .15s; }
.login-field input::placeholder { color: #81746e; }
.login-field input:focus { outline: none; border-color: var(--red-800); box-shadow: 0 0 0 3px rgb(143 23 14 / 9%); }
.login-field input[aria-invalid="true"] { border-color: var(--red-700); }
.login-password-wrap { position: relative; }
.login-password-wrap input { padding-right: 57px; }
.login-password-toggle { position: absolute; right: 4px; top: 4px; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--muted); cursor: pointer; }
.login-password-toggle:hover { color: var(--red-800); background: var(--cream-100); }
.login-password-toggle svg { width: 20px; height: 20px; }
.login-help-row { display: flex; justify-content: flex-end; margin-top: -10px; }
.login-text-button { min-height: 34px; padding: 0; border: 0; background: none; color: var(--red-800); font: inherit; font-size: .76rem; font-weight: 700; cursor: pointer; }
.login-text-button:hover { text-decoration: underline; text-underline-offset: 3px; }
.login-submit { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 52px; margin-top: -4px; padding: 14px 20px; border: 1px solid var(--red-800); border-radius: 6px; background: var(--red-800); color: white; font: inherit; font-size: .86rem; font-weight: 700; cursor: pointer; transition: background .15s; }
.login-submit:hover { background: var(--red-900); }
.login-submit svg { width: 18px; height: 18px; }
.login-account-note { display: flex; align-items: flex-start; gap: 11px; margin-top: 31px; padding-top: 24px; border-top: 1px solid var(--line); color: var(--muted); }
.login-account-note > svg { width: 18px; height: 18px; flex: 0 0 18px; margin-top: 2px; }
.login-account-note p { margin: 0; font-size: .71rem; line-height: 1.8; }
.login-account-note p > span { color: #776964; }
.login-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 15px; font-size: .65rem; line-height: 1.7; color: var(--muted); }
.login-footer a { text-underline-offset: 3px; }
.login-field-error { margin: 0; color: var(--red-800); font-size: .76rem; line-height: 1.5; }
.login-alert, .login-help-note { margin: 0; padding: 13px 15px; border: 1px solid var(--line); border-radius: 6px; background: var(--cream-100); font-size: .79rem; line-height: 1.7; }
.login-alert { color: var(--red-900); border-left: 3px solid var(--red-800); }
.login-help-note a { color: var(--red-800); text-underline-offset: 3px; }
.login-page a:focus-visible, .login-page button:focus-visible { outline: 3px solid var(--gold-500); outline-offset: 4px; }
@media (min-width: 1600px) { .login-story-copy { max-width: 650px; }.login-story h2 { font-size: 4rem; } }
@media (max-width: 800px) {
  .login-page { grid-template-columns: 1fr; }
  .login-story { min-height: auto; padding: 24px; background: var(--red-950); }
  .login-campus { object-position: 50% 40%; }
  .login-story-shade { background: rgb(63 8 6 / 83%); }
  .login-identity img { width: 48px; height: 48px; flex-basis: 48px; }
  .login-identity strong { max-width: none; font-size: .84rem; }
  .login-identity small { font-size: .68rem; }
  .login-story-copy, .login-story-bottom { display: none; }
  .login-main { min-height: calc(100svh - 100px); padding: 15px 24px 24px; }
  .login-form-wrap { padding-block: 38px 45px; max-width: 420px; }
  .login-main h1 { font-size: 2.3rem; }
  .login-footer { max-width: 420px; width: 100%; margin-inline: auto; }
  .login-field input { font-size: 1rem; }
}
@media (prefers-reduced-motion: reduce) { .login-field input, .login-submit { transition: none; } }
</style>
