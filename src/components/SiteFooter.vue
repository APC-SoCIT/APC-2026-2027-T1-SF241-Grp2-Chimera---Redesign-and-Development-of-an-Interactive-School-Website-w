<script setup lang="ts">
import { RouterLink } from "vue-router";
import { cmsPreviewEnabled } from "@/lib/cms/config";
import { usePublicWebsite } from "@/lib/cms/public-website";
import { getPublicSchoolContactInformation } from "@/lib/content/directory";

const currentYear = new Date().getFullYear();
const schoolInformation = getPublicSchoolContactInformation();
const { pages } = usePublicWebsite();
</script>

<template>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <p class="footer-brand">Sto. Niño Catholic School, Inc.</p>
        <p>A faith-centered learning community in Taguig City.</p>
        <p class="footer-preview-label">SNCS website redesign</p>
        <a href="https://www.sncstaguig.com/home">Visit our previous website</a>
        <a href="mailto:officeoftheregistrar@sncstaguig.edu.ph">Email admissions</a>
        <a href="https://www.facebook.com/messages/t/316900518777" target="_blank" rel="noopener noreferrer">Message SNCS on Facebook<span class="sr-only"> (opens a new tab)</span></a>
      </div>
      <div>
        <p class="footer-heading">Explore</p>
        <RouterLink to="/admissions">Admissions</RouterLink>
        <RouterLink to="/enrollment">Admissions application</RouterLink>
        <RouterLink to="/about">About SNCS</RouterLink>
        <RouterLink to="/campus">Campus life</RouterLink>
        <RouterLink to="/news">Latest news</RouterLink>
        <RouterLink to="/events">School events</RouterLink>
        <RouterLink to="/resources">Forms & downloads</RouterLink>
        <RouterLink v-if="pages.length" to="/pages">School pages</RouterLink>
        <RouterLink to="/campus#alumni">Alumni community</RouterLink>
        <a href="https://www.sncstaguig.com/multimedia">Photo & video archive (previous website)</a>
      </div>
      <div>
        <p class="footer-heading">Visit</p>
        <template v-if="schoolInformation"><a href="https://www.google.com/maps/search/?api=1&amp;query=Sto.+Nino+Catholic+School+Sampaloc+Street+Taguig" target="_blank" rel="noopener noreferrer">{{ schoolInformation.address }}<span class="sr-only"> (opens Google Maps in a new tab)</span></a><p>{{ schoolInformation.officeHours }}</p></template>
        <a href="tel:+63288379702">(02) 8837-9702</a>
        <RouterLink to="/contact">Contact the school</RouterLink>
        <RouterLink v-if="cmsPreviewEnabled" :to="{ name: 'admin' }">Staff workspace</RouterLink>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>© {{ currentYear }} Sto. Niño Catholic School, Inc.</span>
      <span>Faith · Excellence · Service</span>
    </div>
  </footer>
</template>
