<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import { useBlurValidation } from "@/lib/cms/blur-validation";

const route = useRoute();
const name = ref("");
const email = ref("");
const level = ref("");
const topic = ref("admissions");
const message = ref("");
const notice = ref("");
const emailField = useTemplateRef<HTMLInputElement>("email-field");
watch(() => route.query.topic, (value) => {
  topic.value = ["admissions", "fees", "visit"].includes(String(value)) ? String(value) : "admissions";
}, { immediate: true });
const labels: Record<string, string> = { admissions: "Admissions", fees: "Tuition and fees", visit: "Campus visit" };
const recipient = computed(() => topic.value === "fees" ? "sncsfinance@gmail.com" : "officeoftheregistrar@sncstaguig.edu.ph");
const { message: fieldError, focusField, blurField, validateAll } = useBlurValidation(() => {
  const issues: Record<string, string> = {};
  if (!name.value.trim()) issues.name = "Enter your name.";
  if (!email.value.trim() || emailField.value?.validity.typeMismatch) issues.email = "Enter an email address such as name@example.com.";
  if (!level.value) issues.level = "Choose a learning level.";
  return issues;
});
const draftHref = computed(() => {
  const subject = "SNCS inquiry: " + labels[topic.value];
  const body = ["Hello SNCS,", "", "I would like to ask about " + labels[topic.value]?.toLowerCase() + ".", "", "Name: " + name.value.trim(), "Email: " + email.value.trim(), "Learning level: " + level.value, "", message.value.trim()].join("\n");
  return "mailto:" + recipient.value + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
});
function compose() {
  if (Object.keys(validateAll()).length) {
    notice.value = "Please complete your name, email address, and learning level before preparing the email.";
    return;
  }
  window.location.href = draftHref.value;
  notice.value = "Review the draft in your email app and send it when ready. If your email app did not open, use the email link below.";
}
</script>

<template>
  <section id="inquiry" class="section section-soft scroll-target" aria-labelledby="inquiry-title">
    <div class="container inquiry-layout">
      <div><p class="eyebrow">Talk with the school</p><h2 id="inquiry-title">Ask about your<br />child's next step.</h2><p>Choose a topic and prepare an email for the Registrar or Finance Office. For a campus visit, include your preferred date so the school can advise on arrangements.</p><p>This opens your email app. Review and send the draft to complete your inquiry.</p><a class="text-link" :href="'mailto:' + recipient">{{ recipient }}</a></div>
      <form class="inquiry-form" novalidate @submit.prevent="compose" @focusin="focusField" @focusout="blurField">
        <div class="inquiry-field"><label for="inquiry-name">Your name</label><input id="inquiry-name" v-model="name" type="text" name="name" autocomplete="name" required maxlength="120" :aria-invalid="Boolean(fieldError('name'))" :aria-describedby="fieldError('name') ? 'inquiry-name-error' : undefined" /><small v-if="fieldError('name')" id="inquiry-name-error">{{ fieldError('name') }}</small></div>
        <div class="inquiry-field"><label for="inquiry-email">Email address</label><input id="inquiry-email" ref="email-field" v-model="email" type="email" inputmode="email" name="email" autocomplete="email" required placeholder="name@example.com" :aria-invalid="Boolean(fieldError('email'))" :aria-describedby="fieldError('email') ? 'inquiry-email-error' : undefined" /><small v-if="fieldError('email')" id="inquiry-email-error">{{ fieldError('email') }}</small></div>
        <div class="inquiry-field"><label for="inquiry-topic">What would you like to ask?</label><select id="inquiry-topic" v-model="topic" name="topic"><option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option></select></div>
        <div class="inquiry-field"><label for="inquiry-level">Learning level</label><select id="inquiry-level" v-model="level" name="level" required :aria-invalid="Boolean(fieldError('level'))" :aria-describedby="fieldError('level') ? 'inquiry-level-error' : undefined"><option value="" disabled>Select a level</option><option>Nursery / Kindergarten</option><option>Elementary</option><option>Junior high school</option><option>Senior high school</option></select><small v-if="fieldError('level')" id="inquiry-level-error">{{ fieldError('level') }}</small></div>
        <div class="inquiry-field inquiry-wide"><label for="inquiry-message">Your question <span>(optional)</span></label><textarea id="inquiry-message" v-model="message" name="message" rows="4" maxlength="1800" placeholder="Tell us what you would like to know."></textarea></div>
        <p v-if="notice" class="inquiry-wide" role="status">{{ notice }}</p>
        <button class="button button-secondary inquiry-wide" type="submit">Prepare email inquiry</button>
      </form>
    </div>
  </section>
</template>
