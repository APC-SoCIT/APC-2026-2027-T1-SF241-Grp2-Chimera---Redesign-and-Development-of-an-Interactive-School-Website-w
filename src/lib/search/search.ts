import { isPubliclyVisible } from "../content/selectors";

export interface SearchDocument {
  id: string;
  type: "page" | "announcement";
  title: string;
  body: string;
  href: string;
  status: "draft" | "published" | "archived";
  visibility: "public" | "private";
  deletedAt?: string | null;
}

export interface SearchResult {
  id: string;
  type: SearchDocument["type"];
  title: string;
  excerpt: string;
  href: string;
}

export const SEARCH_QUERY_LIMIT = 120;

export function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, SEARCH_QUERY_LIMIT);
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en");
}

export function searchText(body: string): string {
  return body.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\n)\s*[-#]+\s*/g, " ")
    .replace(/\*\*?|`/g, "").replace(/\s+/g, " ").trim();
}

function excerpt(body: string, terms: string[]): string {
  const text = searchText(body);
  const folded = fold(text);
  const phrase = folded.indexOf(terms.join(" "));
  const firstTerm = terms.map(term => folded.indexOf(term)).find(index => index >= 0) ?? 0;
  let start = Math.max(0, (phrase >= 0 ? phrase : firstTerm) - 45);
  // Start at a word boundary rather than in the middle of a word.
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space >= 0 && space < start + 25) start = space + 1;
  }
  const end = Math.min(text.length, start + 180);
  const boundary = end < text.length ? text.lastIndexOf(" ", end) : end;
  const finish = boundary > start ? boundary : end;
  return (start ? "…" : "") + text.slice(start, finish) + (finish < text.length ? "…" : "");
}

/** Search only content that is currently published and public. Treat keywords literally. */
export function searchDocuments(documents: readonly SearchDocument[], keyword: string): SearchResult[] {
  const query = normalizeQuery(keyword);
  if (!query) return [];
  const terms = fold(query).split(" ");
  return documents.flatMap(document => {
    if (!isPubliclyVisible(document)) return [];
    const title = fold(document.title);
    const text = title + " " + fold(searchText(document.body));
    if (!terms.every(term => text.includes(term))) return [];
    return [{
      score: terms.reduce((score, term) => score + (title.includes(term) ? 2 : 0), 0),
      result: { id: document.id, type: document.type, title: document.title,
        excerpt: excerpt(document.body, terms) || document.title, href: document.href },
    }];
  }).sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title))
    .map(entry => entry.result);
}
