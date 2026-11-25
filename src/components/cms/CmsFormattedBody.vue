<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { safePreviewLink } from "@/lib/cms/preview";

const props = defineProps<{ body: string }>();

function inline(line: string) {
  return line.split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((text) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(text);
    if (link) return { text: link[1], tag: "a", href: safePreviewLink(link[2]!) };
    if (text.startsWith("**") && text.endsWith("**") && text.length > 4) return { text: text.slice(2, -2), tag: "strong" };
    if (text.startsWith("*") && text.endsWith("*") && text.length > 2) return { text: text.slice(1, -1), tag: "em" };
    return { text, tag: "span" };
  });
}

const blocks = computed(() => {
  const result: { tag: "h3" | "ul" | "p"; lines: string[] }[] = [];
  for (const rawLine of props.body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ")) {
      const last = result.at(-1);
      if (last?.tag === "ul") last.lines.push(line.slice(2));
      else result.push({ tag: "ul", lines: [line.slice(2)] });
    } else if (line.startsWith("## ")) {
      result.push({ tag: "h3", lines: [line.slice(3)] });
    } else {
      result.push({ tag: "p", lines: [line] });
    }
  }
  return result;
});
</script>

<template>
  <component :is="block.tag" v-for="(block, index) in blocks" :key="index">
    <component :is="block.tag === 'ul' ? 'li' : 'span'" v-for="(line, lineIndex) in block.lines" :key="lineIndex">
      <template v-for="(part, tokenIndex) in inline(line)" :key="tokenIndex">
        <RouterLink v-if="part.href?.startsWith('/')" :to="part.href">{{ part.text }}</RouterLink>
        <component v-else :is="part.tag === 'a' && !part.href ? 'span' : part.tag"
          :href="part.href" :target="part.href ? '_blank' : undefined"
          :rel="part.href ? 'noopener noreferrer' : undefined">{{ part.text }}</component>
      </template>
    </component>
  </component>
</template>
