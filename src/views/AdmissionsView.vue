<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { useRoute } from "vue-router";
import PageHero from "@/components/PageHero.vue";
import SectionHeading from "@/components/SectionHeading.vue";
import { getPublicAdmissionGroups } from "@/lib/content/admissions";
const groups = getPublicAdmissionGroups();
const route = useRoute();
const selectedId = ref(groups.find((group) => group.id === route.query.group)?.id ?? groups[0]?.id);
const selected = computed(() => groups.find((group) => group.id === selectedId.value));
</script>

<template>
  <PageHero eyebrow="Admissions guidance" title="Your next chapter starts here" description="Find the documents to prepare for your child’s admission to SNCS." />
  <section id="requirements" class="section scroll-target">
    <div class="container">
      <div class="admissions-intro">
        <SectionHeading eyebrow="Before you apply" title="Choose your applicant group" description="Contact the Registrar to confirm enrollment availability and the current requirements for your grade level." />
        <div class="registration-actions">
          <RouterLink class="button button-secondary" to="/enrollment">Apply for enrollment</RouterLink>
          <RouterLink class="text-link" to="/contact#registrar">Contact the Registrar →</RouterLink>
        </div>
      </div>
      <div v-if="groups.length" class="applicant-options" role="group" aria-label="Applicant group">
        <button v-for="group in groups" :id="`choose-${group.id}`" :key="group.id" type="button" :aria-pressed="selectedId === group.id" aria-controls="admission-checklist" @click="selectedId = group.id">{{ group.title }}</button>
      </div>
      <article v-if="selected" id="admission-checklist" class="checklist-card" aria-live="polite" aria-atomic="true" :aria-labelledby="`choose-${selected.id}`">
        <p class="eyebrow">Documents to prepare</p>
        <h2>{{ selected.title }}</h2>
        <p>{{ selected.introduction }}</p>
        <ul class="document-checklist"><li v-for="requirement in selected.requirements" :key="requirement">{{ requirement }}</li></ul>
        <div class="checklist-notes"><p v-for="note in selected.notes" :key="note">{{ note }}</p></div>
      </article>
      <p v-else class="empty-state">Admission requirements will be posted here when available. Please contact the Registrar for guidance.</p>
    </div>
  </section>
  <section class="section section-soft">
    <div class="container admissions-next">
      <div><p class="eyebrow">TLC applicants</p><h2>Scholarship guidance</h2><p>Ask the Registrar about TLC requirements and the forms that apply to your child. Scholarship eligibility and enrollment steps should be confirmed before submitting documents.</p></div>
      <div class="resource-actions"><RouterLink class="button button-secondary" to="/resources">Download TLC forms</RouterLink><RouterLink class="text-link" to="/contact#registrar">Ask about TLC →</RouterLink></div>
    </div>
  </section>
</template>
