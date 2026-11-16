<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import PageHero from "@/components/PageHero.vue";
import EventCard from "@/components/EventCard.vue";
import { getPublicEvents, officialCalendarUrl } from "@/lib/content/content";
import { partitionEvents } from "@/lib/content/dates";
const { upcoming, past } = partitionEvents(getPublicEvents());
const compact = ref(false);
let narrowScreen: MediaQueryList | undefined;

const calendarUrl = computed(() => {
  const url = new URL(officialCalendarUrl);
  url.searchParams.set("mode", compact.value ? "AGENDA" : "MONTH");
  url.searchParams.set("ctz", "Asia/Manila");
  url.searchParams.set("showPrint", "0");
  return url.href;
});

function updateCalendarMode() {
  compact.value = narrowScreen?.matches ?? false;
}

onMounted(() => {
  narrowScreen = window.matchMedia("(max-width: 700px)");
  updateCalendarMode();
  narrowScreen.addEventListener("change", updateCalendarMode);
});

onBeforeUnmount(() => narrowScreen?.removeEventListener("change", updateCalendarMode));
</script>
<template>
  <PageHero eyebrow="School calendar" title="School events and important dates" description="Follow the activities and dates shared by the SNCS community." />
  <section id="school-calendar" class="section" aria-labelledby="calendar-title">
    <div class="container">
      <div class="section-row calendar-heading">
        <h2 id="calendar-title">School Calendar</h2>
        <a class="text-link" :href="calendarUrl" target="_blank" rel="noopener noreferrer">Open school calendar<span class="sr-only"> (opens a new tab)</span> →</a>
      </div>
      <iframe class="school-calendar" :src="calendarUrl" title="Sto. Niño Catholic School calendar"
        loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>
  </section>
  <section v-if="upcoming.length" class="section section-soft">
    <div class="container content-list">
      <div class="section-row"><h2>Upcoming events</h2></div>
      <EventCard v-for="event in upcoming" :key="event.id" :event="event" />
    </div>
  </section>
  <section v-if="past.length" class="section section-soft">
    <div class="container content-list"><div class="section-heading"><p class="eyebrow">Previously announced</p><h2>Past events</h2></div><EventCard v-for="event in past" :key="event.id" :event="event" /></div>
  </section>
</template>
