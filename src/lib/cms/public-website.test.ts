// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLibrary, recordChange, stepHistory } from "./history";
import { blankItem, sampleItems } from "./preview";
import { usePublicWebsite } from "./public-website";
import { useCmsLibrary, writeCmsLibrary } from "./store";

vi.mock("./config", () => ({ cmsPreviewEnabled: true }));

const timestamp = "2026-11-16T15:00:00.000Z";

describe("connected CMS preview", () => {
  beforeEach(() => writeCmsLibrary(readLibrary(null)));

  it("imports the existing site content and preserves its image metadata", () => {
    const { announcements } = usePublicWebsite();
    const genyo = announcements.value.find((item) => item.id === "genyo-2026-2027");
    expect(genyo?.image?.src).toContain("genyo-2026-2027.png");
    expect(genyo?.publishedAt).toBeNull();
    expect(announcements.value).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "c1" })]));
  });

  it("keeps prior records and change history when connecting an older workspace", () => {
    const original = { ...sampleItems[0], status: "published" as const };
    const updated = { ...original, title: "My school update", updatedAt: timestamp };
    const library = readLibrary(JSON.stringify({
      items: [updated],
      changes: [{ label: "Edit", before: original, after: updated }],
      cursor: 1,
    }));

    expect(library.items.find((item) => item.id === original.id)?.title).toBe(updated.title);
    expect(library.items.some((item) => item.id === "office-transactions")).toBe(true);
    expect(library.changes[0].before?.status).toBe("draft");
  });

  it("updates public content as records are published, moved to Trash, and restored by Undo", () => {
    const library = useCmsLibrary();
    const { announcements, events, pages } = usePublicWebsite();
    const page = { ...blankItem("page"), id: "new-page", slug: "new-page", title: "New page" };
    writeCmsLibrary(recordChange(library.value, page, "Create draft"));
    expect(pages.value).toEqual([]);
    const published = { ...page, status: "published" as const, publishedAt: timestamp };
    writeCmsLibrary(recordChange(library.value, published, "Publish page"));
    expect(pages.value).toEqual([published]);
    writeCmsLibrary(recordChange(library.value, { ...published, deletedAt: timestamp }, "Trash page"));
    expect(pages.value).toEqual([]);
    writeCmsLibrary(stepHistory(library.value, "undo"));
    expect(pages.value).toEqual([published]);

    const event = { ...blankItem("event"), id: "event-preview", eventDate: "2026-12-01", title: "Campus event", body: "**Event details**", status: "published" as const };
    writeCmsLibrary(recordChange(library.value, event, "Publish event"));
    expect(events.value).toContainEqual(expect.objectContaining({
      id: event.id, startDate: event.eventDate, endDate: event.eventDate, summary: "Event details",
    }));

    const source = library.value.items.find((item) => item.id === "office-transactions")!;
    writeCmsLibrary(recordChange(library.value, { ...source, status: "draft" }, "Unpublish announcement"));
    expect(announcements.value.some((item) => item.id === source.id)).toBe(false);
  });
});
