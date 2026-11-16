/*
 * Author: Gian Mandac
 * Created Date: 20261116
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPrintDocument, openPrintableDocument, printDocument } from "./print-form";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("A4 verification form printing", () => {
  it("builds a standalone A4 document containing only the form", () => {
    const html = buildPrintDocument("<h1>Sto. Niño</h1>", "Verification form <SNCS-1>");
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain('<article class="print-form"><h1>Sto. Niño</h1></article>');
    expect(html).toContain("<title>Verification form SNCS-1</title>");
    expect(html).not.toContain("window.print()");
    expect(buildPrintDocument("x", "t", true)).toContain("window.print()");
  });

  it("prints from a hidden frame instead of the dashboard page", () => {
    const pagePrint = vi.spyOn(window, "print").mockImplementation(() => {});
    const frame = printDocument(buildPrintDocument("<p>form</p>", "t"));
    expect(document.body.contains(frame)).toBe(true);
    expect(frame.srcdoc).toContain("<p>form</p>");
    expect(pagePrint).not.toHaveBeenCalled();
  });

  it("opens the printable form in a new tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    URL.createObjectURL = vi.fn(() => "blob:form");
    URL.revokeObjectURL = vi.fn();
    openPrintableDocument("<html></html>");
    expect(open).toHaveBeenCalledWith("blob:form", "_blank", "noopener");
  });
});
