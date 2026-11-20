<script setup lang="ts">
import PageHero from "@/components/PageHero.vue";
import StudentServices from "@/components/StudentServices.vue";
import AdmissionsInquiry from "@/components/AdmissionsInquiry.vue";
import { getPublicOffices, getPublicSchoolContactInformation } from "@/lib/content/directory";
const offices = getPublicOffices();
const schoolInformation = getPublicSchoolContactInformation();
</script>
<template>
  <PageHero eyebrow="Contact SNCS" title="We’re ready to help" description="Find the right school office for admissions, records, academic concerns, and other questions." />
  <section class="section">
    <div class="container contact-grid">
      <div><p class="eyebrow">Visit the school</p><h2>Connect with our community</h2><template v-if="schoolInformation"><address class="school-address">{{ schoolInformation.address }}</address><p><strong>Office hours</strong><br />{{ schoolInformation.officeHours }}</p></template><p class="muted-copy">For admission requirements and enrollment availability, contact the Registrar. For current fees or payment questions, contact the Finance Office.</p></div>
      <div class="office-list">
        <article v-for="office in offices" :id="office.slug" :key="office.id" class="contact-card scroll-target">
          <h3>{{ office.name }}</h3><p>{{ office.description }}</p>
          <ul class="contact-channels"><li v-for="channel in office.channels" :key="channel.href"><a :href="channel.href" :target="channel.external ? '_blank' : undefined" :rel="channel.external ? 'noopener noreferrer' : undefined">{{ channel.label }}<span v-if="channel.external" class="sr-only"> (opens a new tab)</span></a></li></ul>
        </article>
        <p v-if="!offices.length" class="empty-state">Office contacts will be posted here when available.</p>
      </div>
    </div>
  </section>
  <AdmissionsInquiry />
  <StudentServices />
</template>
