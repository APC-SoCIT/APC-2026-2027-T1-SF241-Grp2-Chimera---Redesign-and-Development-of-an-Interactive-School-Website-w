import { describe, expect, it } from "vitest";
import { normalizeQuery, searchDocuments, type SearchDocument } from "./search";
import { publicPageDocuments } from "./public-pages";

const page: SearchDocument = {
  id: "page", type: "page", title: "Admissions at Sto. Niño", body: "## What to prepare\nBring your **PSA birth certificate** and [report card](/admissions).",
  href: "/pages/admissions", status: "published", visibility: "public",
};

describe("public keyword search", () => {
  it("matches title and body, ignores case and accents, and returns plain excerpts and links", () => {
    expect(searchDocuments([page], "  NINO admissions ")).toEqual([{
      id: page.id, type: "page", title: page.title, href: page.href,
      excerpt: "What to prepare Bring your PSA birth certificate and report card.",
    }]);
    expect(searchDocuments([page], "birth certificate")).toHaveLength(1);
    expect(searchDocuments([page], "birth missing")).toEqual([]);
  });
  it("excludes drafts, archives, private content and Trash even when the keyword matches", () => {
    const hidden = [
      { ...page, status: "draft" as const }, { ...page, status: "archived" as const },
      { ...page, visibility: "private" as const }, { ...page, deletedAt: "2026-11-26" },
    ];
    expect(searchDocuments(hidden, "Admissions")).toEqual([]);
  });
  it("handles empty and literal punctuation queries without treating them as regular expressions", () => {
    expect(searchDocuments([page], "  ")).toEqual([]);
    expect(searchDocuments([page], ".* [ %_")).toEqual([]);
    expect(normalizeQuery("x".repeat(121))).toHaveLength(120);
  });
  it("prioritizes title matches and keeps long excerpts short and near the matching text", () => {
    const bodyMatch = { ...page, id: "body", title: "School information", body: "General details. ".repeat(30) + "Scholarship guidance for applicants. " + "More details. ".repeat(30) };
    const titleMatch = { ...page, id: "title", title: "Scholarship guidance" };
    const results = searchDocuments([bodyMatch, titleMatch], "scholarship");
    expect(results.map(item => item.id)).toEqual(["title", "body"]);
    expect(results[1].excerpt).toContain("Scholarship");
    expect(results[1].excerpt.length).toBeLessThanOrEqual(182);
    expect(results[1]).not.toHaveProperty("body");
  });
  it("indexes published school page content including specific admission documents and office contacts", () => {
    const documents = publicPageDocuments();
    expect(searchDocuments(documents, "PSA birth certificate")).toEqual(expect.arrayContaining([expect.objectContaining({ href: "/admissions", excerpt: expect.stringContaining("PSA birth certificate") })]));
    expect(searchDocuments(documents, "1988")).toEqual(expect.arrayContaining([expect.objectContaining({ href: "/about" })]));
    expect(searchDocuments(documents, "sncsfinance@gmail.com")).toEqual(expect.arrayContaining([expect.objectContaining({ href: "/contact" })]));
  });
});
