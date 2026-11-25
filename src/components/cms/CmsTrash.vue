<script setup lang="ts">
import CmsIcon from "./CmsIcon.vue";
import { formatCmsDate, itemLabels, type CmsItem } from "@/lib/cms/preview";

defineProps<{ items: CmsItem[]; nextUndo?: string; nextRedo?: string; busy?: boolean }>();
const emit = defineEmits<{ step: ["undo" | "redo"]; restore: [CmsItem]; remove: [CmsItem, MouseEvent] }>();
</script>

<template>
  <section class="cms-panel cms-history" aria-labelledby="cms-history-title">
    <div class="cms-panel-heading">
      <div>
        <h2 id="cms-history-title">Change history</h2>
        <p>Undo or redo recent edits, publication changes, and moves to or from Trash.</p>
      </div>
    </div>
    <div class="cms-history-actions">
      <div>
        <button type="button" class="cms-button" :disabled="!nextUndo || busy" aria-describedby="cms-next-undo" @click="emit('step', 'undo')">
          <CmsIcon name="undo" :size="17" /> Undo
        </button>
        <p id="cms-next-undo">{{ nextUndo || 'No changes to undo' }}</p>
      </div>
      <div>
        <button type="button" class="cms-button" :disabled="!nextRedo || busy" aria-describedby="cms-next-redo" @click="emit('step', 'redo')">
          <CmsIcon name="redo" :size="17" /> Redo
        </button>
        <p id="cms-next-redo">{{ nextRedo || 'No changes to redo' }}</p>
      </div>
    </div>
  </section>

  <section class="cms-panel" aria-labelledby="cms-trash-title">
    <div class="cms-panel-heading">
      <div>
        <h2 id="cms-trash-title">Deleted items</h2>
        <p>Restore items as drafts or remove them permanently. Permanent removal cannot be undone.</p>
      </div>
    </div>
    <ul v-if="items.length" class="cms-trash-list">
      <li v-for="item in items" :key="item.id">
        <span class="cms-item-icon" :data-type="item.type"><CmsIcon :name="item.type" :size="18" /></span>
        <div>
          <strong>{{ item.title }}</strong>
          <small>{{ itemLabels[item.type] }} · Deleted {{ formatCmsDate(item.deletedAt!) }}</small>
        </div>
        <div class="cms-trash-item-actions">
          <button type="button" class="cms-button" :disabled="busy" :aria-label="'Restore ' + item.title" @click="emit('restore', item)">Restore</button>
          <button type="button" class="cms-button cms-trash-action" :disabled="busy" :aria-label="'Remove permanently ' + item.title"
            @click="emit('remove', item, $event)">Remove permanently</button>
        </div>
      </li>
    </ul>
    <div v-else class="cms-empty">
      <span class="cms-stat-icon"><CmsIcon name="trash" /></span>
      <h3>Trash is empty</h3>
      <p>Items appear here after you move them to Trash.</p>
    </div>
  </section>
</template>
