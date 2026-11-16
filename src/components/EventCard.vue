<script setup lang="ts">
import type { SchoolEvent } from "@/lib/content/model";
import { formatEventDates } from "@/lib/content/dates";
import CmsFormattedBody from "@/components/cms/CmsFormattedBody.vue";
defineProps<{ event: SchoolEvent; compact?: boolean }>();
</script>

<template>
  <article :class="compact ? 'update-card event-card' : 'content-card event-list-card'">
    <div class="date-block" :class="{ large: !compact }" aria-hidden="true">
      <span>{{ new Date(`${event.startDate}T00:00:00Z`).toLocaleString('en-PH', { month: 'short', timeZone: 'UTC' }) }}</span>
      <strong>{{ event.startDate.slice(-2).replace(/^0/, '') }}</strong>
    </div>
    <div>
      <p class="meta">{{ formatEventDates(event) }}<template v-if="event.location"> · {{ event.location }}</template></p>
      <h3>{{ event.title }}</h3>
      <div v-if="!compact && event.formattedBody" class="published-copy"><CmsFormattedBody :body="event.formattedBody" /></div>
      <p v-else-if="!compact">{{ event.summary }}</p>
    </div>
  </article>
</template>
