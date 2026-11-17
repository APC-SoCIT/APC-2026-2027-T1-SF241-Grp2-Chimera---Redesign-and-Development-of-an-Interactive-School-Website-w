<!--
  Author: Gian Mandac
  Created Date: 20261117
  PB-07 / US-07 View Class Schedule: the signed-in Teacher's own published timetable.
  Read-only. Drafts and other teachers' classes are never returned by the database.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  formatTime, getTeacherSchedule, groupByDay, ScheduleError, weekdays, weeklyMinutes, type TeacherSchedule,
} from "@/lib/schedule/teacher-schedule";

const schedule = ref<TeacherSchedule>();
const loading = ref(true);
const accessDenied = ref(false);
const loadError = ref("");
const dayFilter = ref<number | "week">("week");

const published = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const todayNumber = (() => {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Manila" }).format(new Date());
  return weekdays.indexOf(name as (typeof weekdays)[number]) + 1; // 0 on Sunday
})();

const days = computed(() => {
  const groups = groupByDay(schedule.value?.entries ?? []);
  return dayFilter.value === "week" ? groups : groups.filter((group) => group.day === dayFilter.value);
});
const totalHours = computed(() => Math.round((weeklyMinutes(schedule.value?.entries ?? []) / 60) * 10) / 10);

async function load() {
  loading.value = true;
  loadError.value = "";
  accessDenied.value = false;
  try {
    schedule.value = await getTeacherSchedule();
  } catch (error) {
    schedule.value = undefined;
    if (error instanceof ScheduleError && error.kind === "access") accessDenied.value = true;
    else loadError.value = error instanceof ScheduleError ? error.message : "The schedule could not be loaded. Try again.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="schedule-panel" aria-labelledby="teacher-schedule-heading">
    <div class="panel-heading">
      <p class="eyebrow-small">Teacher portal</p>
      <h2 id="teacher-schedule-heading">My class schedule</h2>
      <p v-if="schedule?.run" class="muted">
        {{ schedule.run.school_year }} · {{ schedule.run.term }}
        <template v-if="schedule.run.published_at"> · published {{ published.format(new Date(schedule.run.published_at)) }}</template>
      </p>
    </div>

    <p v-if="loading" class="state">Loading your schedule…</p>
    <p v-else-if="accessDenied" class="state error" role="alert">Access denied. Only an active Teacher account can view this schedule.</p>
    <div v-else-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="button button-secondary" @click="load">Try again</button>
    </div>
    <div v-else-if="schedule && !schedule.linked" class="state" role="status">
      <p><strong>Your account is not linked to a teacher record yet.</strong></p>
      <p class="muted">Ask the Academic Coordinator or Admin to link your login to your teacher code.</p>
    </div>
    <div v-else-if="schedule && (!schedule.run || !schedule.entries.length)" class="state" role="status">
      <p><strong>No active classes found.</strong></p>
      <p class="muted">Your classes appear here once the Academic Coordinator publishes the schedule.</p>
    </div>

    <template v-else-if="schedule">
      <div class="toolbar">
        <p class="summary">
          <strong>{{ schedule.entries.length }}</strong> classes a week · <strong>{{ totalHours }}</strong> teaching hours
        </p>
        <label class="field">
          Show
          <select v-model="dayFilter">
            <option value="week">Whole week</option>
            <option v-for="(name, index) in weekdays" :key="name" :value="index + 1">{{ name }}</option>
          </select>
        </label>
      </div>

      <div class="week" :class="{ single: dayFilter !== 'week' }">
        <section
          v-for="group in days"
          :key="group.day"
          class="day"
          :class="{ today: group.day === todayNumber }"
          :aria-label="`${group.name} classes`"
        >
          <h3>
            {{ group.name }}
            <span v-if="group.day === todayNumber" class="today-badge">Today</span>
          </h3>
          <p v-if="!group.entries.length" class="muted no-class">No classes</p>
          <ul v-else>
            <li v-for="entry in group.entries" :key="`${entry.start_time}-${entry.subject}-${entry.section}`" class="class-card">
              <p class="time">{{ formatTime(entry.start_time) }} – {{ formatTime(entry.end_time) }}</p>
              <p class="subject">{{ entry.subject }}</p>
              <p class="section">{{ entry.section }}<template v-if="entry.strand"> · {{ entry.strand }}</template></p>
              <p class="room">{{ entry.room ?? "Room to be assigned" }}</p>
              <span v-if="entry.is_fixed" class="fixed-badge">Fixed lab class</span>
            </li>
          </ul>
        </section>
      </div>
      <p class="muted note">This schedule is view-only. Contact the Academic Coordinator about changes.</p>
    </template>
  </section>
</template>

<style scoped>
.schedule-panel { display: grid; gap: 1.2rem; margin-top: 2rem; }
.panel-heading h2 { margin: .2rem 0; }
.eyebrow-small { margin: 0; color: var(--red-700); font-size: .75rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.muted { margin: 0; color: var(--muted); }
.state { display: grid; gap: .5rem; justify-items: center; margin: 0; padding: 1.5rem; border: 1px dashed var(--line); border-radius: 6px; text-align: center; }
.state p { margin: 0; }
.error { color: var(--red-700); font-weight: 700; }
.toolbar { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 1rem; }
.summary { margin: 0; }
.field { display: grid; gap: .3rem; font-size: .9rem; font-weight: 700; }
.field select { font: inherit; font-weight: 400; min-height: 44px; padding: .5rem .7rem; border: 1px solid var(--line); border-radius: 4px; background: var(--white); }
.week { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: .8rem; }
.week.single { grid-template-columns: minmax(0, 520px); }
.day { padding: .9rem; border: 1px solid var(--line); border-radius: 6px; background: var(--cream-50); }
.day.today { border-color: var(--gold-500); box-shadow: inset 0 3px 0 var(--gold-500); }
.day h3 { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin: 0 0 .7rem; font-size: 1rem; color: var(--red-900); }
.day ul { display: grid; gap: .6rem; margin: 0; padding: 0; list-style: none; }
.class-card { padding: .7rem; border: 1px solid var(--line); border-left: 4px solid var(--red-700); border-radius: 4px; background: var(--white); }
.class-card p { margin: 0; }
.time { color: var(--muted); font-size: .85rem; font-weight: 700; }
.subject { font-weight: 800; }
.section, .room { font-size: .9rem; }
.room { color: var(--muted); }
.today-badge, .fixed-badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .72rem; font-weight: 800; }
.today-badge { background: var(--gold-300); color: var(--red-950); }
.fixed-badge { margin-top: .35rem; background: #e3ecff; color: #1f3f8f; }
.no-class { font-size: .9rem; }
.note { font-size: .9rem; }
</style>
