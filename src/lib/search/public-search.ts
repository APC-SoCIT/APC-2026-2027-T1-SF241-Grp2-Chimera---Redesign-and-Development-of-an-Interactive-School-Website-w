import { computed } from "vue";
import { usePublicWebsite } from "../cms/public-website";
import { publicPageDocuments } from "./public-pages";
import { searchDocuments, type SearchDocument } from "./search";

/** Search the same published CMS records that power public pages. No second backend. */
export function usePublicSearch() {
  const website = usePublicWebsite();
  const documents = computed((): SearchDocument[] => [
    ...publicPageDocuments(),
    ...website.announcements.value.map(item => ({
      ...item, type: "announcement" as const,
      body: item.formattedBody ?? [item.summary, ...item.body].join(" "),
      href: "/news/" + encodeURIComponent(item.slug),
    })),
    ...website.pages.value.map(item => ({ ...item, type: "page" as const, href: "/pages/" + encodeURIComponent(item.slug) })),
  ]);
  return { loading: website.loading, error: website.error, refresh: website.refresh,
    find: (query: string) => searchDocuments(documents.value, query) };
}
