<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import SectionHeading from "@/components/SectionHeading.vue";
import AnnouncementCard from "@/components/AnnouncementCard.vue";
import EventCard from "@/components/EventCard.vue";
import CampusModel from "@/components/CampusModel.vue";
import { partitionEvents } from "@/lib/content/dates";
import { getPublicSchoolContactInformation } from "@/lib/content/directory";
import {
  getPublicFacilities,
  getPublicInstitutionalSections,
} from "@/lib/content/content";
import { usePublicWebsite } from "@/lib/cms/public-website";

const website = usePublicWebsite();
const { pages } = website;
const announcements = computed(() => website.announcements.value.slice(0, 2));
const events = computed(() => partitionEvents(website.events.value).upcoming.slice(0, 2));
const facilities = getPublicFacilities();
const institutionalSections = getPublicInstitutionalSections();
const schoolInformation = getPublicSchoolContactInformation();

</script>

<template>
  <section class="campus-welcome" aria-labelledby="school-name">
    <div class="container welcome-grid">
      <div class="welcome-copy">
        <p class="eyebrow light">Signal Village, Taguig City</p>
        <h1 id="school-name">Sto. Niño Catholic <span>School, Inc.</span></h1>
        <p class="welcome-tagline">Forming learners for lives of purpose.</p>
        <p class="welcome-description">
          Sto. Niño Catholic School is a joyful learning community where faith,
          character, and academic growth come together.
        </p>
        <div class="welcome-actions">
          <RouterLink class="button button-primary" to="/admissions">Registration <span aria-hidden="true">→</span></RouterLink>
          <RouterLink class="welcome-campus-link" to="/campus">Explore campus <span aria-hidden="true">→</span></RouterLink>
        </div>
      </div>
      <CampusModel />
    </div>
  </section>

  <nav class="container welcome-quick-links" aria-label="Quick links">
    <RouterLink to="/resources">TLC Forms <span aria-hidden="true">→</span></RouterLink>
    <RouterLink to="/events#school-calendar">School Calendar <span aria-hidden="true">→</span></RouterLink>
    <RouterLink to="/contact">Contact the school <span aria-hidden="true">→</span></RouterLink>
  </nav>

  <aside v-if="schoolInformation" class="office-notice" aria-label="School office hours"><div class="container"><strong>School office transactions</strong><span>{{ schoolInformation.officeHours }}</span></div></aside>

  <section class="section welcome-updates">
    <div class="container updates-grid">
      <div>
        <div class="section-row compact">
          <SectionHeading eyebrow="Stay informed" title="Latest news" />
          <RouterLink class="text-link" to="/news">All news →</RouterLink>
        </div>
        <div class="update-list">
          <AnnouncementCard v-for="item in announcements" :key="item.id" :item="item" compact />
          <p v-if="!announcements.length" class="update-card">School announcements will appear here when available.</p>
        </div>
      </div>
      <div>
        <div class="section-row compact">
          <SectionHeading eyebrow="Mark your calendar" title="Upcoming events" />
          <RouterLink class="text-link" to="/events">All events →</RouterLink>
        </div>
        <div class="update-list">
          <EventCard v-for="event in events" :key="event.id" :event="event" compact />
          <div v-if="!events.length" class="update-card welcome-calendar-link">
            <h3>School Calendar</h3>
            <p>Visit the school calendar for the latest dates and browse past school activities.</p>
            <RouterLink class="text-link" to="/events#school-calendar">View school dates →</RouterLink>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="welcome-school-links" aria-labelledby="school-links-title">
    <div class="container">
      <h2 id="school-links-title">On the school website</h2>
      <ul>
        <li><a href="https://www.sncstaguig.com/home#h.fvyo8xp2gi0z_l">School Director’s Daily Reflection <span aria-hidden="true">↗</span></a></li>
        <li><a href="https://www.sncstaguig.com/home#h.51144a0500ce888d_3">Announcements <span aria-hidden="true">↗</span></a></li>
        <li><a href="https://www.sncstaguig.com/home#h.5fc2f1e34ee0d9e0_192">Highlights Library <span aria-hidden="true">↗</span></a></li>
        <li><a href="https://www.psahelpline.ph/sncs">PSA document ordering <span aria-hidden="true">↗</span></a></li>
        <li><a href="https://www.facebook.com/messages/t/316900518777">Send Feedback <span aria-hidden="true">↗</span></a></li>
      </ul>
    </div>
  </section>

  <section v-if="pages.length" class="section section-soft" aria-labelledby="published-page-links">
    <div class="container">
      <div class="section-row">
        <h2 id="published-page-links">School pages</h2>
        <RouterLink class="text-link" to="/pages">All school pages →</RouterLink>
      </div>
      <ul class="published-page-list">
        <li v-for="page in pages.slice(0, 4)" :key="page.id">
          <RouterLink :to="{ name: 'published-pages', params: { slug: page.slug } }">{{ page.title }}</RouterLink>
        </li>
      </ul>
    </div>
  </section>

  <section class="section intro-section">
    <div class="container intro-grid">
      <SectionHeading
        eyebrow="Welcome to SNCS"
        title="A Catholic learning community in the heart of Taguig"
        description="Since 1988, SNCS has partnered with families and the parish to nurture capable, compassionate, and faith-filled learners."
      />
      <div class="intro-note">
        <span class="stat">1988</span>
        <p>Founded with 28 kindergarten pupils and a mission that continues to grow.</p>
        <RouterLink class="text-link" to="/about">Read our story →</RouterLink>
      </div>
    </div>
  </section>

  <section class="section section-soft">
    <div class="container">
      <SectionHeading
        eyebrow="Who we are"
        title="Grounded in faith, moving with purpose"
        description="Our mission and vision guide the way we teach, serve, and grow together."
      />
      <div class="mission-grid">
        <article
          v-for="section in institutionalSections"
          :key="section.id"
          class="mission-card"
        >
          <p class="eyebrow">{{ section.eyebrow }}</p>
          <h3>{{ section.title }}</h3>
          <p>{{ section.body }}</p>
          <RouterLink class="text-link" to="/about#mission-vision">Read our mission and vision →</RouterLink>
        </article>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-row">
        <SectionHeading
          eyebrow="Our campus"
          title="Spaces made for learning and belonging"
          description="Explore the buildings and learning spaces that support the daily life of our school community."
        />
        <RouterLink class="text-link" to="/campus">View campus →</RouterLink>
      </div>
      <div class="facility-grid">
        <article
          v-for="facility in facilities"
          :key="facility.id"
          class="facility-card"
          :data-accent="facility.accent"
        >
          <div class="facility-card-image">
            <img :src="facility.imageSrc" :alt="facility.imageAlt" loading="lazy" />
          </div>
          <div class="facility-card-copy">
            <h3>{{ facility.name }}</h3>
            <p>{{ facility.description }}</p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section class="section alumni-feature">
    <div class="container feature-grid">
      <div class="feature-art">
        <img
          src="/images/source-site/alumni-achievers.jpg"
          alt="SNCS alumni achievers"
          loading="lazy"
        />
      </div>
      <div class="feature-copy">
        <p class="eyebrow">Our alumni</p>
        <h2>Carrying the SNCS spirit forward</h2>
        <p>
          Our graduates bring the values of simplicity, humility, and competence
          into their studies, professions, families, and communities.
        </p>
        <RouterLink class="button button-secondary" to="/campus#alumni">
          Celebrate our alumni
        </RouterLink>
      </div>
    </div>
  </section>
</template>
