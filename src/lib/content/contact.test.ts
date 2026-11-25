import { describe, expect, it } from "vitest";
import {
  contactDetailsProblems, defaultContactDetails, phoneHref, readContactDetails, tidyContactDetails, toOffices,
  type ContactDetails,
} from "./contact";

const copy = (): ContactDetails => structuredClone(defaultContactDetails);

describe("contact details", () => {
  it("builds the same office links the website showed before", () => {
    const offices = toOffices(defaultContactDetails);
    expect(offices.map((office) => office.slug)).toEqual(["registrar", "principal", "finance", "library"]);
    expect(offices[0].channels).toEqual([
      { label: "officeoftheregistrar@sncstaguig.edu.ph", href: "mailto:officeoftheregistrar@sncstaguig.edu.ph" },
      { label: "Message the Registrar", href: "https://www.facebook.com/messages/t/1626374049", external: true },
    ]);
    expect(offices[1].channels.slice(0, 2)).toEqual([
      { label: "(02) 8837-9702", href: "tel:+63288379702" },
      { label: "(02) 8295-5861", href: "tel:+63282955861" },
    ]);
  });

  it("turns Philippine and international numbers into phone links", () => {
    expect(phoneHref("(02) 8866-0281")).toBe("tel:+63288660281");
    expect(phoneHref("0917 123 4567")).toBe("tel:+639171234567");
    expect(phoneHref("+63 2 8837 9702")).toBe("tel:+63288379702");
  });

  it("accepts the built-in details and reports each problem by field", () => {
    expect(contactDetailsProblems(defaultContactDetails)).toEqual({});
    const details = copy();
    details.address = "";
    details.mainPhone = "call us";
    details.admissionsEmail = "registrar";
    details.offices[0].name = "";
    details.offices[0].channels[1] = { kind: "link", value: "http://example.com", label: "" };
    details.offices[2].channels = [];
    expect(Object.keys(contactDetailsProblems(details)).sort()).toEqual([
      "address", "admissionsEmail", "mainPhone",
      "office-0-channel-1-label", "office-0-channel-1-value", "office-0-name", "office-2-channels",
    ]);
  });

  it("trims fields and gives new offices a unique link name", () => {
    const details = copy();
    details.address = "  New address  ";
    details.offices.push({ slug: "", name: " Guidance Office ", description: "", channels: [{ kind: "phone", value: " (02) 8000-0000 " }] });
    details.offices.push({ slug: "", name: "Guidance office", description: "", channels: [{ kind: "email", value: "g@sncs.edu.ph" }] });
    const tidy = tidyContactDetails(details);
    expect(tidy.address).toBe("New address");
    expect(tidy.offices.slice(-2).map((office) => office.slug)).toEqual(["guidance-office", "guidance-office-2"]);
    expect(tidy.offices[4].channels[0].value).toBe("(02) 8000-0000");
  });

  it("ignores saved details that are malformed or break the rules", () => {
    expect(readContactDetails(structuredClone(defaultContactDetails))).toEqual(defaultContactDetails);
    expect(readContactDetails(null)).toBeNull();
    expect(readContactDetails({ ...copy(), offices: "none" })).toBeNull();
    expect(readContactDetails({ ...copy(), mainPhone: "phone" })).toBeNull();
    const unknownKind = copy() as unknown as { offices: { channels: { kind: string }[] }[] };
    unknownKind.offices[0].channels[0].kind = "fax";
    expect(readContactDetails(unknownKind)).toBeNull();
  });
});
