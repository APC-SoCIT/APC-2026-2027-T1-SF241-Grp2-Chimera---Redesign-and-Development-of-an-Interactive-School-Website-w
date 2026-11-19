<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import { useBlurValidation } from "@/lib/cms/blur-validation";
import { schoolToday } from "@/lib/content/dates";

const route = useRoute();
const name = ref("");
const email = ref("");
const level = ref("");
const schoolYear = ref("");
const preferredDate = ref("");
const topic = ref("admissions");
const message = ref("");
const notice = ref("");
const emailField = useTemplateRef<HTMLInputElement>("email-field");
watch(() => route.query.topic, (value) => {
  topic.value = ["admissions", "fees", "visit"].includes(String(value)) ? String(value) : "admissions";
}, { immediate: true });
const labels: Record<string, string> = { admissions: "Admissions guidance", fees: "Current fee sheet", visit: "Campus visit" };
const gradeOptions = ["Nursery", "Kindergarten", ...Array.from({ length: 12 }, (_, index) => "Grade " + (index + 1))];
const recipient = computed(() => topic.value === "fees" ? "sncsfinance@gmail.com" : "officeoftheregistrar@sncstaguig.edu.ph");
const { message: fieldError, focusField, blurField, validateAll } = useBlurValidation(() => {
  const issues: Record<string, string> = {};
  if (!name.value.trim()) issues.name = "Enter your name.";
  if (!email.value.trim() || emailField.value?.validity.typeMismatch) issues.email = "Enter an email address such as name@example.com.";
  if (!level.value) issues.level = "Choose your child's entry grade.";
  if (topic.value === "visit" && preferredDate.value && preferredDate.value < schoolToday()) issues.preferredDate = "Choose today or a future date.";
  return issues;
});
const draftHref = computed(() => {
  const subject = "SNCS inquiry: " + labels[topic.value];
  const request = topic.value === "fees" ? "Please send the current itemized fee sheet, included learning materials, payment options, due dates, and any applicable discounts for the grade and school year below."
    : topic.value === "visit" ? "I would like to request a campus visit. Please confirm an available date and any visit arrangements." : "I would like admissions guidance for the grade and school year below.";
  const body = ["Hello SNCS,", "", request, "", "Name: " + name.value.trim(), "Email: " + email.value.trim(), "Grade: " + level.value, "School year: " + (schoolYear.value.trim() || "Please advise"), ...(topic.value === "visit" ? ["Preferred visit date: " + (preferredDate.value || "Please advise")] : []), "", message.value.trim()].join("\n");
  return "mailto:" + recipient.value + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
});
function compose() {
  if (Object.keys(validateAll()).length) {
    notice.value = "Please check your name, email address, entry grade, and any preferred visit date before preparing the email.";
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
        <div class="inquiry-field"><label for="inquiry-level">Child's entry grade</label><select id="inquiry-level" v-model="level" name="level" required :aria-invalid="Boolean(fieldError('level'))" :aria-describedby="fieldError('level') ? 'inquiry-level-error' : undefined"><option value="" disabled>Select a grade</option><option v-for="grade in gradeOptions" :key="grade">{{ grade }}</option></select><small v-if="fieldError('level')" id="inquiry-level-error">{{ fieldError('level') }}</small></div>
        <div class="inquiry-field"><label for="inquiry-school-year">School year <span>(optional)</span></label><input id="inquiry-school-year" v-model="schoolYear" type="text" name="schoolYear" autocomplete="off" maxlength="20" placeholder="e.g. 2026–2027" /></div>
        <div v-if="topic === 'visit'" class="inquiry-field"><label for="inquiry-visit-date">Preferred visit date <span>(optional)</span></label><input id="inquiry-visit-date" v-model="preferredDate" type="date" name="preferredDate" :min="schoolToday()" :aria-invalid="Boolean(fieldError('preferredDate'))" :aria-describedby="fieldError('preferredDate') ? 'inquiry-date-error' : undefined" /><small v-if="fieldError('preferredDate')" id="inquiry-date-error">{{ fieldError('preferredDate') }}</small></div>
        <div class="inquiry-field inquiry-wide"><label for="inquiry-message">Your question <span>(optional)</span></label><textarea id="inquiry-message" v-model="message" name="message" rows="4" maxlength="1800" placeholder="Tell us what you would like to know."></textarea></div>
        <p v-if="notice" class="inquiry-wide" role="status">{{ notice }}</p>
        <button class="button button-secondary inquiry-wide" type="submit">Prepare email inquiry</button>
      </form>
    </div>
  </section>
</template>
