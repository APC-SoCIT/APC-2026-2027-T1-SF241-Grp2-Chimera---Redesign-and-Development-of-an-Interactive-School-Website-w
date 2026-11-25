<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from "vue";
import CmsIcon from "./CmsIcon.vue";
import CmsFormattedBody from "./CmsFormattedBody.vue";
import ContentImageGallery from "@/components/ContentImageGallery.vue";
import { contentTypes, formatCmsDate, itemLabels, slugify, type CmsItem } from "@/lib/cms/preview";
import { imageForDisplay, maxContentImages, prepareImage, type CmsImageAssets } from "@/lib/cms/images";
import { sourceAnnouncements } from "@/lib/cms/website-items";
import { formatFileSize, MAX_PDF_BYTES } from "@/lib/resources/model";
import { useBlurValidation } from "@/lib/cms/blur-validation";

const props = defineProps<{
  item: CmsItem;
  items: CmsItem[];
  imageAssets: CmsImageAssets;
  /** true: saved; false: the browser could not save; a string: the database's reason. */
  attemptSave: (item: CmsItem, images: CmsImageAssets, file?: File) => boolean | string | Promise<boolean | string>;
  /** Saving goes to the school database and the public website (not a browser preview). */
  connected?: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const form = ref({ ...props.item, images: props.item.images?.map((image) => ({ ...image })) });
const formEl = useTemplateRef<HTMLFormElement>("cms-form");
const bodyField = useTemplateRef<HTMLTextAreaElement>("body-field");
const preview = useTemplateRef<HTMLDialogElement>("content-preview");
const { errors, message: fieldError, focusField, blurField, validateAll } = useBlurValidation(validateFields);
const customSlug = ref(Boolean(props.item.id));
const readingFile = ref(false);
const readingImages = ref(false);
const imageError = ref("");
const pendingImages = shallowRef<CmsImageAssets>({});
const saveError = ref("");
const saving = ref(false);
// The chosen PDF itself; the database workspace uploads it when the form is saved.
const pdfFile = shallowRef<File>();
let fileRead = 0;

watch(imageError, (issue) => {
  if (issue) errors.value.contentImages = issue;
  else delete errors.value.contentImages;
});

const existingImage = computed(() => form.value.type === "announcement"
  ? sourceAnnouncements.find((entry) => entry.id === props.item.id)?.image : undefined);
const imageSrc = (id: string) => pendingImages.value[id]?.src ?? props.imageAssets[id]?.src;
const previewImages = computed(() => {
  const uploads = (form.value.images ?? []).flatMap((image) =>
    imageForDisplay(image, pendingImages.value[image.id] ?? props.imageAssets[image.id]) ?? [],
  );
  return uploads.length ? uploads : existingImage.value ? [existingImage.value] : [];
});

async function selectImages(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length || readingImages.value) return;
  imageError.value = "";
  const images = form.value.images ?? [];
  if (files.length + images.length > maxContentImages) {
    imageError.value = `You can attach up to ${maxContentImages} images per item.`;
    return;
  }
  readingImages.value = true;
  const newAssets: CmsImageAssets = {};
  const newImages = [];
  try {
    for (const file of files) {
      const { image, asset } = await prepareImage(file);
      newImages.push(image);
      newAssets[image.id] = asset;
    }
    pendingImages.value = { ...pendingImages.value, ...newAssets };
    form.value.images = [...images, ...newImages];
  } catch (error) {
    imageError.value = error instanceof Error ? error.message : "This image could not be opened.";
  } finally {
    readingImages.value = false;
  }
}

function removeImage(id: string) {
  form.value.images = form.value.images?.filter((image) => image.id !== id);
  imageError.value = "";
}

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
  pdfFile.value = file;
}

function normalizedForm() {
  const next = { ...form.value };
  next.title = next.title.trim();
  next.slug = next.slug.trim();
  next.body = next.body.trim();
  next.category = next.category.trim();
  if (next.type !== "event") next.eventDate = "";
  next.images = next.images?.map((image) => ({
    ...image, alt: image.alt.trim(), caption: image.caption?.trim() || undefined,
  }));
  return next;
}

function validateFields() {
  const next = normalizedForm();
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
    if (!next.body) issues.body = "Enter the content body.";
    if (imageError.value) issues.contentImages = imageError.value;
    for (const image of next.images ?? []) {
      if (!image.alt) issues[image.id] = "Describe the image for visitors who use a screen reader.";
    }
  }
  return issues;
}

async function save() {
  if (readingFile.value || readingImages.value || saving.value) return;
  const next = normalizedForm();
  const issues = validateAll();
  saveError.value = "";
  if (Object.keys(issues).length) {
    saveError.value = "Review the required fields before saving. Field errors appear after you leave each field.";
    await nextTick();
    const first = Object.keys(issues)[0];
    Array.from(formEl.value?.querySelectorAll<HTMLElement>("input, select, textarea") ?? [])
      .find((field) => (field.dataset.validationKey ?? field.getAttribute("name")) === first)?.focus();
    return;
  }
  saving.value = true;
  try {
    const result = await (next.type === "resource" && pdfFile.value
      ? props.attemptSave(next, pendingImages.value, pdfFile.value)
      : props.attemptSave(next, pendingImages.value));
    if (result === true) return;
    saveError.value = typeof result === "string" && result
      ? `${result} Your edits are still in the form.`
      : "This browser could not save the changes. Check available browser storage and try again. Your edits are still in the form.";
  } finally {
    saving.value = false;
  }
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

  <form id="cms-editor-form" ref="cms-form" class="cms-editor-grid" novalidate autocomplete="off"
    @submit.prevent="save" @focusin="focusField" @focusout="blurField">
    <div class="cms-panel cms-form-panel">
      <h2>{{ form.type === 'resource' ? 'Resource details' : 'Content details' }}</h2>
      <div v-if="form.type !== 'resource'" class="cms-field">
        <label for="cms-type">Content type</label>
        <select id="cms-type" v-model="form.type" name="contentType" :disabled="item.status === 'published'">
          <option v-for="type in contentTypes" :key="type" :value="type">{{ itemLabels[type] }}</option>
        </select>
      </div>
      <div class="cms-field">
        <label for="cms-title">Title</label>
        <input id="cms-title" :value="form.title" type="text" name="title" required maxlength="160" :aria-invalid="Boolean(fieldError('title'))"
          :aria-describedby="fieldError('title') ? 'cms-title-error' : undefined" placeholder="Enter a clear, descriptive title" @input="updateTitle" />
        <small v-if="fieldError('title')" id="cms-title-error" class="cms-error">{{ fieldError('title') }}</small>
      </div>
      <template v-if="form.type === 'resource'">
        <div class="cms-field">
          <label for="cms-category">Category</label>
          <input id="cms-category" v-model="form.category" type="text" name="category" list="cms-categories" required maxlength="100"
            :aria-invalid="Boolean(fieldError('category'))" :aria-describedby="fieldError('category') ? 'cms-category-error' : undefined" placeholder="e.g. Admission Forms" />
          <datalist id="cms-categories">
            <option v-for="category in new Set(items.filter((entry) => entry.category).map((entry) => entry.category))"
              :key="category" :value="category" />
          </datalist>
          <small v-if="fieldError('category')" id="cms-category-error" class="cms-error">{{ fieldError('category') }}</small>
        </div>
        <div class="cms-field cms-file">
          <label for="cms-pdf">{{ item.id ? 'Replace PDF' : 'PDF file' }}</label>
          <span v-if="form.fileName" class="cms-file-current">
            <CmsIcon name="resource" /> {{ form.fileName }} · {{ formatFileSize(form.fileSize) }}
          </span>
          <input id="cms-pdf" name="fileName" type="file" accept=".pdf,application/pdf" :aria-invalid="Boolean(fieldError('fileName'))"
            :aria-describedby="fieldError('fileName') ? 'cms-file-help cms-file-error' : 'cms-file-help'" @change="selectPdf" />
          <small id="cms-file-help">PDF up to 10 MB. {{ connected ? 'The file is uploaded when you save.' : 'This preview stores the file name and size only.' }}</small>
          <small v-if="fieldError('fileName')" id="cms-file-error" class="cms-error" role="alert">{{ fieldError('fileName') }}</small>
        </div>
      </template>
      <template v-else>
        <div class="cms-field">
          <label for="cms-slug">Page identifier</label>
          <input id="cms-slug" v-model="form.slug" type="text" name="slug" required maxlength="160" spellcheck="false" autocapitalize="none"
            :aria-invalid="Boolean(fieldError('slug'))" :aria-describedby="fieldError('slug') ? 'cms-slug-error' : 'cms-slug-help'" @input="customSlug = true" />
          <small v-if="fieldError('slug')" id="cms-slug-error" class="cms-error">{{ fieldError('slug') }}</small>
          <small v-else id="cms-slug-help">The part of the public URL that identifies this item.</small>
        </div>
        <div v-if="form.type === 'event'" class="cms-field">
          <label for="cms-event-date">Event date</label>
          <input id="cms-event-date" v-model="form.eventDate" name="eventDate" type="date" required
            :aria-invalid="Boolean(fieldError('eventDate'))" :aria-describedby="fieldError('eventDate') ? 'cms-date-error' : undefined" />
          <small v-if="fieldError('eventDate')" id="cms-date-error" class="cms-error">{{ fieldError('eventDate') }}</small>
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
            <textarea id="cms-body" ref="body-field" v-model="form.body" name="body" required rows="9" maxlength="24000"
              :aria-invalid="Boolean(fieldError('body'))" :aria-describedby="fieldError('body') ? 'cms-body-error' : undefined"
              placeholder="Write your content here…"></textarea>
          </div>
          <small v-if="fieldError('body')" id="cms-body-error" class="cms-error">{{ fieldError('body') }}</small>
        </div>
        <div class="cms-field cms-file">
          <label for="cms-content-images">Upload images</label>
          <input id="cms-content-images" name="contentImages" type="file" accept="image/jpeg,image/png,image/webp" multiple
            :disabled="readingImages || (form.images?.length ?? 0) >= maxContentImages"
            :aria-invalid="Boolean(fieldError('contentImages'))"
            :aria-describedby="fieldError('contentImages') ? 'cms-image-help cms-image-error' : 'cms-image-help'" @change="selectImages" />
          <small id="cms-image-help">Up to {{ maxContentImages }} JPEG, PNG, or WebP files, 5 MB each. The first image is used on announcement cards.</small>
          <small v-if="readingImages" role="status">Preparing images…</small>
          <small v-if="fieldError('contentImages')" id="cms-image-error" class="cms-error" aria-live="polite">{{ fieldError('contentImages') }}</small>
          <small v-if="existingImage && !form.images?.length">This announcement uses its existing image until you add an upload.</small>
        </div>
        <ul v-if="form.images?.length" class="cms-image-list" aria-label="Selected images">
          <li v-for="image in form.images" :key="image.id">
            <img v-if="imageSrc(image.id)" :src="imageSrc(image.id)" alt="" class="cms-image-thumbnail" />
            <div class="cms-image-details">
              <div class="cms-image-heading">
                <strong>{{ image.name }}</strong>
                <button type="button" class="cms-button" :aria-label="'Remove ' + image.name" :disabled="readingImages" @click="removeImage(image.id)">Remove</button>
              </div>
              <div class="cms-field">
                <label :for="'alt-' + image.id">Alt text</label>
                <input :id="'alt-' + image.id" v-model="image.alt" type="text" :name="'alt-' + image.id" :data-validation-key="image.id" required maxlength="250" :aria-invalid="Boolean(fieldError(image.id))"
                  :aria-describedby="fieldError(image.id) ? 'image-error-' + image.id : undefined" placeholder="Describe what is in the image" />
                <small v-if="fieldError(image.id)" :id="'image-error-' + image.id" class="cms-error">{{ fieldError(image.id) }}</small>
              </div>
              <div class="cms-field">
                <label :for="'caption-' + image.id">Caption <small>(optional)</small></label>
                <input :id="'caption-' + image.id" v-model="image.caption" type="text" :name="'caption-' + image.id" maxlength="250" />
              </div>
            </div>
          </li>
        </ul>
      </template>
    </div>

    <aside class="cms-editor-side">
      <section class="cms-panel cms-form-panel">
        <h2>Publication</h2>
        <span class="cms-status" :data-state="form.status">{{ form.status }}</span>
        <p v-if="form.status === 'published' && form.type !== 'resource' && form.visibility === 'public'">{{ connected ? 'Saving updates the public website right away.' : 'Saving updates the public preview.' }}</p>
        <p v-else-if="form.status === 'published'">{{ connected ? 'Saving updates this published item.' : 'Saving updates this published item in the preview library.' }}</p>
        <p v-else-if="form.status === 'archived'">This item stays in the archive when you save it.</p>
        <p v-else>Drafts stay hidden until you publish them from the library.</p>
        <div v-if="form.type === 'resource'" class="cms-field">
          <label for="cms-visibility">Visibility</label>
          <select id="cms-visibility" v-model="form.visibility" name="visibility">
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
      <button type="submit" class="cms-button cms-primary" :disabled="readingFile || readingImages || saving">
        {{ readingFile ? 'Checking PDF…' : readingImages ? 'Preparing images…' : saving ? 'Saving…' : item.id ? 'Save changes' : 'Save draft' }}
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
      <ContentImageGallery :images="previewImages" />
    </article>
  </dialog>
</template>
