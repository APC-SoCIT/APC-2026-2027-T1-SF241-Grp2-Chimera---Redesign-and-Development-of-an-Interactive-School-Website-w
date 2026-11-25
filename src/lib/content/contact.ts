/*
 * Author: Gian Mandac
 * Created Date: 20261126
 * The school's contact details: address, office hours, main phone, admissions email and offices.
 * Admins edit them in the content workspace; the website falls back to the built-in copy below
 * whenever the saved copy is not available. The database checks the same rules on save
 * (cms_check_contact_details in 202611260002_pb01_site_contact_details.sql).
 */
import type { ContactChannel, ContactOffice, SchoolContactInformation } from "./model";

export type ContactChannelKind = "phone" | "email" | "link";

export interface ContactDetailsChannel {
  kind: ContactChannelKind;
  /** A phone number, an email address or an https:// link. */
  value: string;
  /** Text shown for a link. Phone numbers and email addresses show themselves. */
  label?: string;
}

export interface ContactDetailsOffice {
  /** The office's anchor on the Contact page (/contact#registrar). */
  slug: string;
  name: string;
  description: string;
  channels: ContactDetailsChannel[];
}

export interface ContactDetails {
  address: string;
  officeHours: string;
  mainPhone: string;
  admissionsEmail: string;
  offices: ContactDetailsOffice[];
}

export const contactLimits = { offices: 12, channels: 8 } as const;

export const defaultContactDetails: ContactDetails = {
  address: "Sampaloc St., Zone 1, North Signal Village, Taguig City",
  officeHours: "Monday to Friday, 8:00 AM–5:00 PM",
  mainPhone: "(02) 8837-9702",
  admissionsEmail: "officeoftheregistrar@sncstaguig.edu.ph",
  offices: [
    {
      slug: "registrar", name: "Registrar / Admissions",
      description: "Enrollment guidance, admission requirements, school records, and document requests.",
      channels: [
        { kind: "email", value: "officeoftheregistrar@sncstaguig.edu.ph" },
        { kind: "link", value: "https://www.facebook.com/messages/t/1626374049", label: "Message the Registrar" },
      ],
    },
    {
      slug: "principal", name: "Office of the Principal",
      description: "General school inquiries and academic concerns.",
      channels: [
        { kind: "phone", value: "(02) 8837-9702" },
        { kind: "phone", value: "(02) 8295-5861" },
        { kind: "email", value: "sncsofficeoftheprincipal@gmail.com" },
        { kind: "email", value: "sncs_tagig@yahoo.com" },
      ],
    },
    {
      slug: "finance", name: "Finance Office",
      description: "Current school fees, accounting, and payment inquiries.",
      channels: [
        { kind: "phone", value: "(02) 8866-0281" },
        { kind: "email", value: "sncsfinance@gmail.com" },
      ],
    },
    {
      slug: "library", name: "School Library",
      description: "Library services, research, and reading resources.",
      channels: [
        { kind: "phone", value: "(02) 7919-5211" },
        { kind: "link", value: "https://library.sncstaguig.edu.ph/", label: "Visit the library website" },
      ],
    },
  ],
};

const phonePattern = /^[0-9+() .-]{7,25}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isPhone = (value: string) => phonePattern.test(value) && value.replace(/\D/g, "").length >= 7
  && value.replace(/\D/g, "").length <= 15;
export const isEmail = (value: string) => emailPattern.test(value) && value.length <= 254;
export const isLink = (value: string) => /^https:\/\/\S+$/.test(value) && value.length <= 500;

/** Philippine numbers: (02) 8837-9702 → tel:+63288379702. */
export function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return `tel:+${digits}`;
  return digits.startsWith("0") ? `tel:+63${digits.slice(1)}` : `tel:${digits}`;
}

export function officeSlug(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "office";
}

export function channelLink(channel: ContactDetailsChannel): ContactChannel {
  if (channel.kind === "phone") return { label: channel.value, href: phoneHref(channel.value) };
  if (channel.kind === "email") return { label: channel.value, href: `mailto:${channel.value}` };
  return { label: channel.label?.trim() || channel.value, href: channel.value, external: true };
}

const published = { status: "published", visibility: "public", publishedAt: null } as const;
const sourceUrl = "https://www.sncstaguig.com/contacts";

export function toSchoolInformation(details: ContactDetails): SchoolContactInformation {
  return { ...published, id: "school-contact-information", slug: "school-contact-information", sourceUrl,
    address: details.address, officeHours: details.officeHours };
}

export function toOffices(details: ContactDetails): ContactOffice[] {
  return details.offices.map((office) => ({
    ...published, id: office.slug, slug: office.slug, name: office.name, description: office.description,
    channels: office.channels.map(channelLink), sourceUrl,
  }));
}

/** Trims every field and gives new offices a unique anchor; run before checking and saving. */
export function tidyContactDetails(details: ContactDetails): ContactDetails {
  const used = new Set<string>();
  return {
    address: details.address.trim(),
    officeHours: details.officeHours.trim(),
    mainPhone: details.mainPhone.trim(),
    admissionsEmail: details.admissionsEmail.trim(),
    offices: details.offices.map((office) => {
      const name = office.name.trim();
      let slug = slugPattern.test(office.slug) ? office.slug : officeSlug(name);
      for (let n = 2; used.has(slug); n += 1) slug = `${officeSlug(name).slice(0, 56)}-${n}`;
      used.add(slug);
      return {
        slug, name, description: office.description.trim(),
        channels: office.channels.map((channel) => ({
          kind: channel.kind, value: channel.value.trim(),
          ...(channel.kind === "link" ? { label: channel.label?.trim() ?? "" } : {}),
        })),
      };
    }),
  };
}

/**
 * Problems with the details, keyed by field: address, officeHours, mainPhone, admissionsEmail,
 * offices, office-<n>-name, office-<n>-description, office-<n>-channels,
 * office-<n>-channel-<m>-value and office-<n>-channel-<m>-label (n and m count from 0).
 */
export function contactDetailsProblems(details: ContactDetails): Record<string, string> {
  const issues: Record<string, string> = {};
  if (!details.address || details.address.length > 300) issues.address = "Enter the school address (up to 300 characters).";
  if (!details.officeHours || details.officeHours.length > 200) issues.officeHours = "Enter the office hours (up to 200 characters).";
  if (!isPhone(details.mainPhone)) issues.mainPhone = "Enter a phone number, for example (02) 8837-9702.";
  if (!isEmail(details.admissionsEmail)) issues.admissionsEmail = "Enter an email address, for example registrar@school.edu.ph.";
  if (!details.offices.length || details.offices.length > contactLimits.offices) issues.offices = `List between 1 and ${contactLimits.offices} offices.`;
  details.offices.forEach((office, n) => {
    const at = `office-${n}`;
    if (!office.name || office.name.length > 100) issues[`${at}-name`] = "Enter the office name (up to 100 characters).";
    if (office.description.length > 400) issues[`${at}-description`] = "Keep the description to 400 characters or fewer.";
    if (!office.channels.length || office.channels.length > contactLimits.channels) {
      issues[`${at}-channels`] = `Add between 1 and ${contactLimits.channels} ways to reach this office.`;
    }
    office.channels.forEach((channel, m) => {
      const field = `${at}-channel-${m}`;
      if (channel.kind === "phone" && !isPhone(channel.value)) issues[`${field}-value`] = "Enter a phone number, for example (02) 8837-9702.";
      if (channel.kind === "email" && !isEmail(channel.value)) issues[`${field}-value`] = "Enter an email address.";
      if (channel.kind === "link") {
        if (!isLink(channel.value)) issues[`${field}-value`] = "Enter a link that starts with https://.";
        if (!channel.label || channel.label.length > 100) issues[`${field}-label`] = "Enter the text visitors will see for this link.";
      }
    });
  });
  return issues;
}

/** Saved details from storage or the database, or null when they are missing or malformed. */
export function readContactDetails(value: unknown): ContactDetails | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = (entry: unknown) => (typeof entry === "string" ? entry : null);
  if (!Array.isArray(raw.offices)) return null;
  const offices: ContactDetailsOffice[] = [];
  for (const entry of raw.offices as unknown[]) {
    const office = (entry ?? {}) as Record<string, unknown>;
    if (!Array.isArray(office.channels)) return null;
    const channels: ContactDetailsChannel[] = [];
    for (const item of office.channels as unknown[]) {
      const channel = (item ?? {}) as Record<string, unknown>;
      const kind = channel.kind;
      if ((kind !== "phone" && kind !== "email" && kind !== "link") || text(channel.value) === null) return null;
      channels.push({ kind, value: channel.value as string, ...(kind === "link" ? { label: text(channel.label) ?? "" } : {}) });
    }
    const slug = text(office.slug);
    const name = text(office.name);
    if (slug === null || name === null) return null;
    offices.push({ slug, name, description: text(office.description) ?? "", channels });
  }
  const details = {
    address: text(raw.address), officeHours: text(raw.officeHours),
    mainPhone: text(raw.mainPhone), admissionsEmail: text(raw.admissionsEmail), offices,
  };
  if (details.address === null || details.officeHours === null || details.mainPhone === null || details.admissionsEmail === null) return null;
  const result = details as ContactDetails;
  return Object.keys(contactDetailsProblems(result)).length ? null : result;
}
