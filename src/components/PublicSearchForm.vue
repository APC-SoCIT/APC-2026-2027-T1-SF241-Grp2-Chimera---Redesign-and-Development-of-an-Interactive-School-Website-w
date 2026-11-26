<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { normalizeQuery, SEARCH_QUERY_LIMIT } from "@/lib/search/search";

const route = useRoute();
const router = useRouter();
const emit = defineEmits<{ open: [] }>();
const keyword = ref("");
const dialog = ref<HTMLDialogElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const isOpen = ref(false);
let previousOverflow = "";

function openSearch() {
  if (!dialog.value || dialog.value.open) return;
  emit("open");
  keyword.value = route.name === "search" && typeof route.query.q === "string" ? normalizeQuery(route.query.q) : "";
  previousOverflow = document.body.style.overflow;
  dialog.value.showModal();
  document.body.style.overflow = "hidden";
  isOpen.value = true;
  input.value?.focus();
}
function closeSearch() {
  dialog.value?.close();
}
function afterClose() {
  if (!isOpen.value) return;
  isOpen.value = false;
  document.body.style.overflow = previousOverflow;
  trigger.value?.focus({ preventScroll: true });
}
function dismissBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value || !dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSearch();
}
function submit() {
  const query = normalizeQuery(keyword.value);
  if (!query) { input.value?.focus(); return; }
  closeSearch();
  void router.push({ name: "search", query: { q: query } });
}
watch(() => route.fullPath, closeSearch);
onBeforeUnmount(() => {
  if (isOpen.value) document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <button ref="trigger" class="search-trigger" type="button" aria-label="Open website search" aria-haspopup="dialog" aria-controls="public-search-dialog" :aria-expanded="isOpen" @click="openSearch">
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
  </button>
  <Teleport to="body">
    <dialog id="public-search-dialog" ref="dialog" class="search-dialog" aria-labelledby="public-search-title" aria-describedby="public-search-description" aria-modal="true" @cancel.prevent="closeSearch" @close="afterClose" @click="dismissBackdrop">
      <button class="search-close" type="button" aria-label="Close search" @click="closeSearch"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      <p class="search-eyebrow">Search SNCS</p>
      <h2 id="public-search-title">What are you looking for?</h2>
      <p id="public-search-description">Find school announcements, admissions guidance, and public pages.</p>
      <form class="public-search-form" role="search" aria-label="School website search" @submit.prevent="submit">
        <label for="public-search-keyword">Search website</label>
        <div class="public-search-controls">
          <input id="public-search-keyword" ref="input" v-model="keyword" type="search" name="q" :maxlength="SEARCH_QUERY_LIMIT" placeholder="Try admissions or library" autocomplete="off" />
          <button class="search-submit" type="submit">Search</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.search-trigger,.search-close{display:inline-flex;align-items:center;justify-content:center;flex:none;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:#861e15;cursor:pointer}
.search-trigger{transition:background-color .18s ease}
.search-trigger svg{transition:transform .18s ease}
.search-trigger:focus-visible{background:#f8ebe8}
.search-trigger:focus-visible svg{transform:scale(1.14)}
@media(hover:hover) and (pointer:fine){.search-trigger:hover{background:#f8ebe8}.search-trigger:hover svg{transform:scale(1.14)}}
.search-dialog{box-sizing:border-box;position:fixed;inset:0;width:calc(100% - 2rem);max-width:660px;max-height:calc(100dvh - 2rem);margin:auto;padding:clamp(1.5rem,5vw,2.75rem);overflow:auto;overscroll-behavior:contain;border:1px solid #dedbd5;border-radius:12px;background:#fff;color:#292421;box-shadow:0 24px 90px #210d0b40;font-family:"Libre Franklin",sans-serif;text-align:left}
.search-dialog[open]{animation:search-appear .18s ease-out}
.search-dialog::backdrop{background:rgb(30 16 13 / 48%);backdrop-filter:blur(4px)}
.search-close{position:absolute;top:.65rem;right:.65rem;color:#554e49}
.search-close:hover{background:#f3f1ee}
.search-eyebrow{margin:0 0 .7rem;color:#a72b20;font-size:.875rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
h2{margin:0 0 .85rem;padding-right:1rem;font-family:"DM Serif Text",Georgia,serif;font-size:clamp(1.75rem,5vw,2.5rem);font-weight:400;line-height:1.15;letter-spacing:-.025em}
#public-search-description{margin:0;color:#554e49;font-size:1rem;line-height:1.65}
.public-search-form{margin:1.75rem 0 0;font-size:1rem}
label{display:block;margin-bottom:.55rem;font-weight:700;color:#443733;font-size:.875rem}
.public-search-controls{display:flex;gap:.65rem}
input{box-sizing:border-box;flex:1;min-width:0;width:100%;min-height:50px;padding:.7rem .85rem;border:1px solid #82756d;border-radius:4px;background:white;color:#292421;font:inherit;font-size:1rem}
input::placeholder{color:#655b55}
.search-submit{min-height:50px;padding:.65rem 1.25rem;border:1px solid #a72b20;border-radius:4px;background:#a72b20;color:white;font:inherit;font-weight:700;cursor:pointer}
.search-submit:hover{background:#7f1d15}
input:focus-visible,button:focus-visible{outline:2px solid #a72b20;outline-offset:2px}
@keyframes search-appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:480px){.search-dialog{padding-top:2.75rem}.public-search-controls{flex-direction:column}.search-submit{width:100%}}
@media(prefers-reduced-motion:reduce){.search-trigger,.search-trigger svg{transition:none}.search-dialog[open]{animation:none}.search-trigger:is(:hover,:focus-visible) svg{transform:none}}
</style>
