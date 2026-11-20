<script setup lang="ts">
defineProps<{ name: string; size?: number }>();
const paths: Record<string, string> = {
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6m4-6v6",
  undo: "M9 5 4 10l5 5 M4 10h11a5 5 0 0 1 0 10",
  redo: "m15 5 5 5-5 5 M20 10H9a5 5 0 0 0 0 10",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  files: "M8 3h9l4 4v14H8z M17 3v5h4 M4 7v14 M11 12h7m-7 4h7",
  announcement: "M3 10v4l5 1 9 4V5L8 9z M8 15l2 6h3l-2-5 M20 9l2-2m-2 8 2 2",
  event: "M3 6h18v15H3z M3 11h18 M8 3v6m8-6v6 M8 15h2m4 0h2m-8 3h2",
  page: "M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8m-8 4h8",
  resource: "M5 3h10l4 4v14H5z M14 3v5h5 M12 11v6m-3-3 3 3 3-3",
  external: "M13 5h6v6 M19 5l-8 8 M10 5H5v14h14v-5",
  plus: "M12 5v14M5 12h14",
  search: "M21 21l-4.35-4.35 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z",
  check: "m5 12 4 4L19 6",
  archive: "M4 8h16v13H4z M3 3h18v5H3z M10 12h4",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  back: "M20 12H5m6-6-6 6 6 6",
  chevron: "m9 18 6-6-6-6",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M18 6 6 18",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  upload: "M4 16v4h16v-4M12 16V4m-5 5 5-5 5 5",
  info: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M12 11v6m0-10v.1",
};
</script>

<template>
  <svg :width="size || 20" :height="size || 20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name]" />
  </svg>
</template>
