<script setup lang="ts">
import PageHero from "@/components/PageHero.vue";
import SectionHeading from "@/components/SectionHeading.vue";
import StudentServices from "@/components/StudentServices.vue";
import CampusModel from "@/components/CampusModel.vue";
import { getPublicFacilities } from "@/lib/content/content";

const facilities = getPublicFacilities();
</script>

<template>
  <PageHero
    eyebrow="Campus life"
    title="A place to learn, connect, and grow"
    description="Discover the spaces and experiences that support the everyday life of the SNCS community."
  />

  <section class="section">
    <div class="container">
      <SectionHeading
        eyebrow="Facilities"
        title="Learning spaces with a purpose"
        description="Each part of our campus helps learners explore ideas, build relationships, and develop their gifts."
      />
      <div class="campus-list">
        <article v-for="(facility, index) in facilities" :key="facility.id" class="campus-item">
          <div class="campus-image">
            <img :src="facility.imageSrc" :alt="facility.imageAlt" loading="lazy" />
          </div>
          <div class="campus-copy">
            <p class="eyebrow">Campus space {{ String(index + 1).padStart(2, "0") }}</p>
            <h2>{{ facility.name }}</h2>
            <p>{{ facility.description }}</p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <StudentServices />

  <section class="section campus-tour-section" aria-labelledby="campus-tour-title"><div class="container campus-tour-layout"><div><p class="eyebrow">A different perspective</p><h2 id="campus-tour-title">Explore the campus model.</h2><p>Rotate this illustration left or right to see the school buildings, covered court, and church. The building shapes and spacing are approximate.</p></div><CampusModel /></div></section>

  <section id="alumni" class="section section-soft scroll-target">
    <div class="container feature-grid reverse">
      <div class="feature-art alumni-poster">
        <img src="/images/source-site/alumni-achievers.jpg" alt="SNCS alumni achievers" width="1280" height="719" loading="lazy" />
      </div>
      <div class="feature-copy">
        <p class="eyebrow">Alumni community</p>
        <h2>Rooted here, making a difference everywhere</h2>
        <p>
          The SNCS journey continues beyond graduation. Our alumni reflect the
          school’s formation through lives marked by competence, compassion, and
          service to others.
        </p>
        <p>
          Explore the school's alumni archive for stories, shared memories, and
          achievements celebrated by the community.
        </p>
      </div>
    </div>
  </section>
</template>
