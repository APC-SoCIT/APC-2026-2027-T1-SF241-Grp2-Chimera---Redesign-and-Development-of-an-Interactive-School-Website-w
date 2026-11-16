<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from "vue";
import CmsIcon from "./CmsIcon.vue";
import CmsFormattedBody from "./CmsFormattedBody.vue";
import { contentTypes, formatCmsDate, itemLabels, slugify, type CmsItem } from "@/lib/cms/preview";
import { formatFileSize, MAX_PDF_BYTES } from "@/lib/resources/model";

const props = defineProps<{ item: CmsItem; items: CmsItem[]; attemptSave: (item: CmsItem) => boolean }>();
const emit = defineEmits<{ close: [] }>();
const form = ref({ ...props.item });
const formEl = useTemplateRef<HTMLFormElement>("cms-form");
const bodyField = useTemplateRef<HTMLTextAreaElement>("body-field");
const preview = useTemplateRef<HTMLDialogElement>("content-preview");
const errors = ref<Record<string, string>>({});
const customSlug = ref(Boolean(props.item.id));
const readingFile = ref(false);
const saveError = ref("");
let fileRead = 0;

function updateTitle(event: Event) {
  form.value.title = (event.target as HTMLInputElement).value;
  if (!customSlug.value) form.value.slug = slugify(form.value.title);
}

function insertFormat(before: string, after: string, example: string) {
  const input = bodyField.value;
  if (!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selected = input.value.slice(start, end) || example;
  const prefix = before.endsWith(" ") && start > 0 && input.value[start - 1] !== "\n" ? "\n" : "";
  form.value.body = input.value.slice(0, start) + prefix + before + selected + after + input.value.slice(end);
  void nextTick(() => {
    input.focus();
    const cursor = start + prefix.length + before.length;
    input.setSelectionRange(cursor, cursor + selected.length);
  });
}

async function selectPdf(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const read = ++fileRead;
  readingFile.value = true;
  let error = "";
  try {
    if (file.size > MAX_PDF_BYTES) error = "Choose a PDF of 10 MB or less.";
    else if (!/\.pdf$/i.test(file.name) || await file.slice(0, 5).text() !== "%PDF-") error = "Choose a valid PDF file.";
  } catch {
    error = "The file could not be read. Choose it again.";
  }
  if (read !== fileRead) return;
  readingFile.value = false;
  if (error) {
    errors.value.fileName = error;
    return;
  }
  delete errors.value.fileName;
  form.value.fileName = file.name;
  form.value.fileSize = file.size;
}

async function save() {
  const next = { ...form.value };
  next.title = next.title.trim();
  next.slug = next.slug.trim();
  next.body = next.body.trim();
  next.category = next.category.trim();
  const issues: Record<string, string> = {};
  if (!next.title) issues.title = "Enter a title.";
  if (next.type === "resource") {
    if (!next.category) issues.category = "Enter a category.";
    if (errors.value.fileName || !next.fileName) issues.fileName = errors.value.fileName || "Select a PDF.";
  } else {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next.slug)) issues.slug = "Use lowercase letters, numbers and single hyphens.";
    else if (props.items.some((item) => item.id !== next.id && item.type !== "resource" && item.slug === next.slug)) {
      issues.slug = "This page identifier is already in use.";
    }
    if (next.type === "event" && !next.eventDate) issues.eventDate = "Choose the event date.";
    if (next.type !== "event") next.eventDate = "";
    if (!next.body) issues.body = "Enter the content body.";
  }
  errors.value = issues;
  saveError.value = "";
  if (Object.keys(issues).length) {
    await nextTick();
    formEl.value?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    return;
  }
  if (!props.attemptSave(next)) saveError.value = "This browser could not save the changes. Your edits are still in the form.";
}

function cancel() {
  if (JSON.stringify(form.value) === JSON.stringify(props.item) || window.confirm("Discard unsaved changes?")) emit("close");
}
</script>

<template>
  <button class="cms-back" type="button" @click="cancel"><CmsIcon name="back" :size="17" /> Back to library</button>
  <div class="cms-heading cms-editor-heading">
    <div>
      <h1>{{ item.id ? 'Edit' : 'New' }} {{ item.type === 'resource' ? 'resource' : 'content' }}</h1>
      <p>{{ item.type === 'resource' ? 'Manage an official PDF for students and families.' : 'Write and preview an update for the school website.' }}</p>
    </div>
    <button v-if="form.type !== 'resource'" type="button" class="cms-button" @click="preview?.showModal()">
      <CmsIcon name="eye" :size="17" /> Preview
    </button>
  </div>

  <form id="cms-editor-form" ref="cms-form" class="cms-editor-grid" novalidate @submit.prevent="save">
    <div class="cms-panel cms-form-panel">
      <h2>{{ form.type === 'resource' ? 'Resource details' : 'Content details' }}</h2>
      <div v-if="form.type !== 'resource'" class="cms-field">
        <label for="cms-type">Content type</label>
        <select id="cms-type" v-model="form.type" :disabled="item.status === 'published'">
          <option v-for="type in contentTypes" :key="type" :value="type">{{ itemLabels[type] }}</option>
        </select>
      </div>
      <div class="cms-field">
        <label for="cms-title">Title</label>
        <input id="cms-title" :value="form.title" required maxlength="160" :aria-invalid="Boolean(errors.title)"
          :aria-describedby="errors.title ? 'cms-title-error' : undefined" placeholder="Enter a clear, descriptive title" @input="updateTitle" />
        <small v-if="errors.title" id="cms-title-error" class="cms-error">{{ errors.title }}</small>
      </div>
      <template v-if="form.type === 'resource'">
        <div class="cms-field">
          <label for="cms-category">Category</label>
          <input id="cms-category" v-model="form.category" list="cms-categories" required maxlength="100"
            :aria-invalid="Boolean(errors.category)" :aria-describedby="errors.category ? 'cms-category-error' : undefined" placeholder="e.g. Admission Forms" />
          <datalist id="cms-categories">
            <option v-for="category in new Set(items.filter((entry) => entry.category).map((entry) => entry.category))"
              :key="category" :value="category" />
          </datalist>
          <small v-if="errors.category" id="cms-category-error" class="cms-error">{{ errors.category }}</small>
        </div>
        <div class="cms-field cms-file">
          <label for="cms-pdf">{{ item.id ? 'Replace PDF' : 'PDF file' }}</label>
          <span v-if="form.fileName" class="cms-file-current">
            <CmsIcon name="resource" /> {{ form.fileName }} · {{ formatFileSize(form.fileSize) }}
          </span>
          <input id="cms-pdf" type="file" accept=".pdf,application/pdf" :aria-invalid="Boolean(errors.fileName)"
            :aria-describedby="errors.fileName ? 'cms-file-help cms-file-error' : 'cms-file-help'" @change="selectPdf" />
          <small id="cms-file-help">PDF up to 10 MB. This preview stores the file name and size only.</small>
          <small v-if="errors.fileName" id="cms-file-error" class="cms-error" role="alert">{{ errors.fileName }}</small>
        </div>
      </template>
      <template v-else>
        <div class="cms-field">
          <label for="cms-slug">Page identifier</label>
          <input id="cms-slug" v-model="form.slug" required maxlength="160" spellcheck="false"
            :aria-invalid="Boolean(errors.slug)" :aria-describedby="errors.slug ? 'cms-slug-error' : 'cms-slug-help'" @input="customSlug = true" />
          <small v-if="errors.slug" id="cms-slug-error" class="cms-error">{{ errors.slug }}</small>
          <small v-else id="cms-slug-help">The part of the public URL that identifies this item.</small>
        </div>
        <div v-if="form.type === 'event'" class="cms-field">
          <label for="cms-event-date">Event date</label>
          <input id="cms-event-date" v-model="form.eventDate" type="date" required
            :aria-invalid="Boolean(errors.eventDate)" :aria-describedby="errors.eventDate ? 'cms-date-error' : undefined" />
          <small v-if="errors.eventDate" id="cms-date-error" class="cms-error">{{ errors.eventDate }}</small>
        </div>
        <div class="cms-field">
          <label for="cms-body">Body</label>
          <div class="cms-writing">
            <div class="cms-format" role="group" aria-label="Text formatting">
              <button type="button" @click="insertFormat('## ', '', 'Heading')">Heading</button>
              <button type="button" @click="insertFormat('**', '**', 'bold text')"><strong>Bold</strong></button>
              <button type="button" @click="insertFormat('*', '*', 'italic text')"><em>Italic</em></button>
              <button type="button" @click="insertFormat('- ', '', 'List item')">List</button>
              <button type="button" @click="insertFormat('[', '](https://example.com)', 'Link text')">Link</button>
            </div>
            <textarea id="cms-body" ref="body-field" v-model="form.body" required rows="9" maxlength="24000"
              :aria-invalid="Boolean(errors.body)" :aria-describedby="errors.body ? 'cms-body-error' : undefined"
              placeholder="Write your content here…"></textarea>
          </div>
          <small v-if="errors.body" id="cms-body-error" class="cms-error">{{ errors.body }}</small>
        </div>
      </template>
    </div>

    <aside class="cms-editor-side">
      <section class="cms-panel cms-form-panel">
        <h2>Publication</h2>
        <span class="cms-status" :data-state="form.status">{{ form.status }}</span>
        <p v-if="form.status === 'published' && form.type !== 'resource' && form.visibility === 'public'">Saving updates the public preview.</p>
        <p v-else-if="form.status === 'published'">Saving updates this published item in the preview library.</p>
        <p v-else-if="form.status === 'archived'">This item stays in the archive when you save it.</p>
        <p v-else>Drafts stay hidden until you publish them from the library.</p>
        <div v-if="form.type === 'resource'" class="cms-field">
          <label for="cms-visibility">Visibility</label>
          <select id="cms-visibility" v-model="form.visibility">
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <small>Only public, published PDFs appear in the public resources list.</small>
        </div>
        <dl v-if="item.id" class="cms-record-details">
          <dt>Created by</dt><dd>{{ item.createdBy }}</dd>
          <dt>Last edited by</dt><dd>{{ item.updatedBy }}</dd>
          <dt>Last updated</dt><dd>{{ formatCmsDate(item.updatedAt) }}</dd>
        </dl>
      </section>
    </aside>
    <div class="cms-editor-footer">
      <p v-if="saveError" class="cms-error" role="alert">{{ saveError }}</p>
      <button type="button" class="cms-button" @click="cancel">Cancel</button>
      <button type="submit" class="cms-button cms-primary" :disabled="readingFile">
        {{ readingFile ? 'Checking PDF…' : item.id ? 'Save changes' : 'Save draft' }}
      </button>
    </div>
  </form>

  <dialog ref="content-preview" class="cms-dialog cms-preview-dialog" aria-labelledby="cms-preview-title">
    <header class="cms-panel-heading">
      <h2 id="cms-preview-title">Content preview</h2>
      <button class="cms-icon-button" type="button" aria-label="Close preview" @click="preview?.close()"><CmsIcon name="close" /></button>
    </header>
    <article class="cms-preview-article">
      <div class="cms-preview-type">{{ itemLabels[form.type] }}</div>
      <h2>{{ form.title || 'Untitled content' }}</h2>
      <p v-if="form.type === 'event' && form.eventDate">{{ formatCmsDate(form.eventDate) }}</p>
      <CmsFormattedBody v-if="form.body" :body="form.body" />
      <p v-else>Your content will appear here.</p>
    </article>
  </dialog>
</template>
