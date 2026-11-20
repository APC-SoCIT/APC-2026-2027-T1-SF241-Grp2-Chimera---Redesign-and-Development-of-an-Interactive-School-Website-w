<script setup lang="ts">
import { RouterLink } from "vue-router";
import PageHero from "@/components/PageHero.vue";
import AdmissionsInquiry from "@/components/AdmissionsInquiry.vue";
import { getPublicAdmissionGroups } from "@/lib/content/admissions";
import { admissionsDates, admissionsFaqs, admissionsSteps } from "@/lib/content/admissions-guidance";
import { formatSchoolDate } from "@/lib/content/dates";

const groups = getPublicAdmissionGroups();
const navigationLabels: Record<string, string> = {
  "returning-student": "Returning student", preschool: "Preschool",
  "grade-1": "Incoming Grade 1", "grade-7": "Incoming Grade 7",
  "senior-high": "Senior high school", "transferee-returnee": "Transferee / returnee",
};
function scrollToChecklist(event: MouseEvent, id: string) {
  const checklist = document.getElementById("requirements-" + id);
  if (!checklist) return;
  // Preserve the local preview's hash route while retaining real anchors without JavaScript.
  event.preventDefault();
  checklist.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
}
const dates = [
  { label: "Admissions open", value: admissionsDates.opens },
  { label: "Application deadline", value: admissionsDates.closes },
  { label: "Start of classes", value: admissionsDates.classesBegin },
];
</script>

<template>
  <PageHero eyebrow="Admissions at SNCS" title="What to prepare, step by step." description="A practical guide for parents: find your child's requirements, understand the next steps, request current fees, and plan a visit." />

  <section class="admissions-start"><div class="container admissions-start-layout"><div><p class="eyebrow">A clear starting point</p><h2>Which grade is your child entering?</h2><p>All six checklists are shown below. Choose an applicant group to scroll to its requirements. Admissions covers the application and assessment stage; enrollment follows the school's acceptance and payment instructions.</p></div><div class="admissions-start-actions"><a class="button button-secondary" href="#requirements">See all requirements</a><RouterLink class="button admissions-outline" to="/admissions?topic=fees#inquiry">Request a fee sheet</RouterLink><RouterLink class="text-link" to="/admissions?topic=visit#inquiry">Request a campus visit</RouterLink></div></div></section>

  <nav class="container admissions-page-links" aria-label="Admissions page sections"><a href="#requirements">Requirements</a><a href="#admissions-process">Process</a><a href="#admissions-dates">Dates</a><a href="#admissions-fees">Fees</a><a href="#scholarships">Scholarships</a><a href="#admissions-faq">FAQ</a><a href="#inquiry">Inquiries &amp; visits</a></nav>

  <section id="requirements" class="section scroll-target" aria-labelledby="requirements-title">
    <div class="container">
      <div class="admissions-section-heading">
        <div><p class="eyebrow">Documents to prepare</p><h2 id="requirements-title">Find your applicant group.</h2></div>
      </div>
      <p>Select a box to scroll to its checklist. All requirements remain visible below.</p>
      <nav class="requirements-navigation" aria-label="Jump to applicant requirements">
        <a v-for="group in groups" :key="group.id" :href="'#requirements-' + group.id" @click="scrollToChecklist($event, group.id)">{{ navigationLabels[group.id] }}</a>
      </nav>
      <div class="requirements-all">
        <article v-for="group in groups" :id="'requirements-' + group.id" :key="group.id" class="requirements-group scroll-target" :aria-labelledby="'requirements-title-' + group.id">
          <div class="requirements-group-heading">
            <p class="eyebrow">Documents to prepare</p>
            <h3 :id="'requirements-title-' + group.id">{{ navigationLabels[group.id] }}</h3>
            <p>{{ group.introduction }}</p>
          </div>
          <div class="requirements-group-documents">
            <ul class="document-checklist"><li v-for="requirement in group.requirements" :key="requirement">{{ requirement }}</li></ul>
            <div class="checklist-notes"><p v-for="note in group.notes" :key="note">{{ note }}</p></div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section id="admissions-process" class="section scroll-target" aria-labelledby="process-title"><div class="container"><div class="admissions-section-heading"><div><p class="eyebrow">The application journey</p><h2 id="process-title">Four manageable steps.</h2></div></div><p class="admissions-process-note">Use this preparation guide alongside the published checklists. The school confirms assessment schedules, acceptance, and payment instructions for each applicant.</p><ol class="admissions-process-grid"><li v-for="(step, index) in admissionsSteps" :key="step.title"><span aria-hidden="true">{{ index + 1 }}</span><h3>{{ step.title }}</h3><p>{{ step.body }}</p></li></ol></div></section>

  <section id="admissions-dates" class="section section-soft scroll-target" aria-labelledby="dates-title"><div class="container"><div class="admissions-section-heading"><div><p class="eyebrow">Plan ahead</p><h2 id="dates-title">School year & key dates</h2></div><RouterLink class="text-link" to="/events#school-calendar">View the school calendar</RouterLink></div><div class="admissions-dates-grid"><div class="admissions-date"><span>Published school-year reference</span><strong>{{ admissionsDates.schoolYearReference }}</strong><p>Shown in the school's published notices. Current admissions availability is not confirmed by this reference alone.</p></div><div v-for="date in dates" :key="date.label" class="admissions-date"><span>{{ date.label }}</span><strong>{{ date.value ? formatSchoolDate(date.value) : 'Awaiting school announcement' }}</strong><p v-if="!date.value">An official date has not yet been supplied for this page.</p></div></div></div></section>

  <section id="admissions-fees" class="section scroll-target" aria-labelledby="fees-title"><div class="container admissions-information-grid"><div><p class="eyebrow">Understand the costs</p><h2 id="fees-title">Get the current fee sheet.</h2><p>Request an itemized schedule for your child's exact grade and school year before deciding. The Finance Office can clarify the total and payment options.</p><RouterLink class="button button-secondary" to="/admissions?topic=fees#inquiry">Request a fee sheet</RouterLink><p class="admissions-contact-line"><a href="mailto:sncsfinance@gmail.com">sncsfinance@gmail.com</a><br /><a href="tel:+63288660281">(02) 8866-0281</a></p></div><div class="fee-request-list"><h3>What to ask for</h3><ul><li>Tuition and other school charges for the selected grade.</li><li>Which books, learning materials, and other items are included.</li><li>Payment options, due dates, and any applicable discounts.</li><li>Any assessment charges and the applicable refund terms.</li></ul><p>The inquiry form prepares an email for you to review and send. It does not process a payment.</p></div></div></section>

  <section id="scholarships" class="section section-soft scroll-target" aria-labelledby="tlc-title"><div class="container admissions-information-grid"><div><p class="eyebrow">Scholarship guidance</p><h2 id="tlc-title">Taguig Learner's Certificate (TLC)</h2><p>TLC is a City of Taguig program supporting eligible learners at participating private high schools. Eligibility and awards are subject to the city program's screening and current rules.</p><RouterLink class="button button-secondary" to="/resources">Scholarship forms & downloads</RouterLink></div><div class="tlc-guidance"><h3>Who should explore this option?</h3><p>The school's notice for SY 2026–2027 identifies:</p><ul><li>Incoming Grade 7 learners coming from public schools.</li><li>Certain incoming Grade 11 learners from TLC-participating or private schools who are not Senior High School voucher recipients in Taguig.</li></ul><p>Complete the TLC Office's applicable requirements before the Grade 7 school checklist. Ask about your specific circumstances through the admissions inquiry form.</p></div></div></section>

  <section id="admissions-faq" class="section scroll-target" aria-labelledby="admissions-faq-title"><div class="container faq-layout"><div><p class="eyebrow">Before you apply</p><h2 id="admissions-faq-title">Admissions questions, answered.</h2><p>Published requirements are summarized here. Availability, priority arrangements, and dates that have not been confirmed are identified clearly.</p></div><div class="faq-list"><details v-for="faq in admissionsFaqs" :key="faq.question"><summary>{{ faq.question }}</summary><p>{{ faq.answer }}</p></details></div></div></section>

  <AdmissionsInquiry />
  <section class="admissions-application-link"><div class="container"><div><h2>Ready for the application form?</h2><p>Have your child's details and previous-school information ready. Availability of the online service is confirmed on the application page.</p></div><RouterLink class="button button-secondary" to="/enrollment">Start admissions application</RouterLink></div></section>
</template>
