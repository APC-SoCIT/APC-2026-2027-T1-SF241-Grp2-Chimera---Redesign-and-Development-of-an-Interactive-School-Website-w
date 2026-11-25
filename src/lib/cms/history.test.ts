import { describe, expect, it } from "vitest";
import { permanentlyRemoveItem, readLibrary, recordChange, stepHistory } from "./history";
import { blankItem } from "./preview";

const deletedAt = "2026-11-18T06:00:00.000Z";

describe("permanent CMS removal", () => {
  it("only removes items already in Trash", () => {
    const library = readLibrary(null);
    expect(permanentlyRemoveItem(library, library.items[0]!.id)).toBe(library);
    expect(permanentlyRemoveItem(library, "missing")).toBe(library);
  });

  it("keeps imported website content removed across reloads and later edits", () => {
    let library = readLibrary(null);
    const source = library.items.find((item) => item.id === "office-transactions")!;
    library = recordChange(library, { ...source, deletedAt }, "Trash source");
    library = permanentlyRemoveItem(library, source.id);
    const other = { ...blankItem("page"), id: "other-page", title: "Another page" };
    library = recordChange(library, other, "Create another page");
    library = readLibrary(JSON.stringify(library));
    expect(library.items.some((item) => item.id === source.id)).toBe(false);
    expect(library.permanentlyDeletedIds).toContain(source.id);
    expect(library.changes.some((change) => change.after.id === source.id)).toBe(false);
  });

  it("preserves other items' applied and pending history without resurrecting the removed item", () => {
    let library = readLibrary(null);
    const removed = { ...blankItem("page"), id: "removed", title: "Removed page" };
    const kept = { ...blankItem("page"), id: "kept", title: "Kept page" };
    library = recordChange(library, removed, "Create removed");
    library = recordChange(library, kept, "Create kept");
    library = recordChange(library, { ...removed, deletedAt }, "Trash removed");
    library = recordChange(library, { ...kept, title: "Renamed page" }, "Rename kept");
    library = stepHistory(library, "undo");
    library = permanentlyRemoveItem(library, removed.id);
    expect(library.cursor).toBe(1);
    expect(library.changes.map((change) => change.label)).toEqual(["Create kept", "Rename kept"]);
    library = stepHistory(library, "redo");
    expect(library.items.find((item) => item.id === kept.id)?.title).toBe("Renamed page");
    library = stepHistory(stepHistory(library, "undo"), "undo");
    library = stepHistory(stepHistory(library, "redo"), "redo");
    expect(library.items.some((item) => item.id === removed.id)).toBe(false);
  });

  it("releases removed images while retaining shared images and images needed by other history", () => {
    let library = readLibrary(null);
    const image = (id: string) => ({ id, name: id + ".png", alt: id });
    const asset = { src: "data:image/png;base64,eA==", width: 100, height: 50 };
    const removed = { ...blankItem("page"), id: "removed", images: [image("unique"), image("shared")] };
    const kept = { ...blankItem("page"), id: "kept", images: [image("shared"), image("history-only")] };
    library = recordChange(library, removed, "Create removed", { unique: asset, shared: asset });
    library = recordChange(library, kept, "Create kept", { "history-only": asset });
    library = recordChange(library, { ...kept, images: [] }, "Clear kept images");
    library = recordChange(library, { ...removed, deletedAt }, "Trash removed");
    library = permanentlyRemoveItem(library, removed.id);
    expect(Object.keys(library.imageAssets).sort()).toEqual(["history-only", "shared"]);
    expect(stepHistory(library, "undo").items.find((item) => item.id === kept.id)?.images).toHaveLength(2);
  });
});
