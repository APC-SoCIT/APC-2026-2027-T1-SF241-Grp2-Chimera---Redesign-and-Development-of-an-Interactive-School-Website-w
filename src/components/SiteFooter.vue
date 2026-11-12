<!--
  Author: gemillan321 | Email: miles.gemillan77@gmail.com
  Created Date: 20261001
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261112
-->
<script setup lang="ts">
import { RouterLink } from "vue-router";
import { getPublicSchoolContactInformation } from "@/lib/content/directory";

const currentYear = new Date().getFullYear();
const schoolInformation = getPublicSchoolContactInformation();
</script>

<template>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <p class="footer-brand">Sto. Niño Catholic School, Inc.</p>
        <p>A faith-centered learning community in Taguig City.</p>
      </div>
      <div>
        <p class="footer-heading">Explore</p>
        <RouterLink to="/about">About SNCS</RouterLink>
        <RouterLink to="/campus">Campus life</RouterLink>
        <RouterLink to="/news">Latest news</RouterLink>
        <RouterLink to="/enrollment">Apply for enrollment</RouterLink>
        <RouterLink to="/events">School events</RouterLink>
        <RouterLink to="/admissions">Admissions guidance</RouterLink>
        <RouterLink to="/resources">Forms & downloads</RouterLink>
      </div>
      <div>
        <p class="footer-heading">Visit</p>
        <template v-if="schoolInformation"><p>{{ schoolInformation.address }}</p><p>{{ schoolInformation.officeHours }}</p></template>
        <RouterLink to="/contact">Contact the school</RouterLink>
        <RouterLink to="/login">Staff portal</RouterLink>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>© {{ currentYear }} Sto. Niño Catholic School, Inc.</span>
      <span>Faith · Excellence · Service</span>
    </div>
  </footer>
</template>
