import { getPublicFacilities, getPublicInstitutionalSections, getPublicSchoolProfile } from "../content/content.js";
import { getPublicAdmissionGroups } from "../content/admissions.js";
import { admissionsFaqs, admissionsSteps } from "../content/admissions-guidance.js";
import { getPublicOffices, getPublicSchoolContactInformation, getPublicStudentServices } from "../content/directory.js";
import type { SearchDocument } from "./search.js";

/** Fixed public pages use the same approved content sources as their page components.
 * Announcements and CMS pages are added separately from their current publication state.
 */
export function publicPageDocuments(): SearchDocument[] {
  const profile = getPublicSchoolProfile();
  const contact = getPublicSchoolContactInformation();
  const pages = [
    { href: "/", title: "Sto. Niño Catholic School, Inc.", body: "Forming learners for lives of purpose. A Catholic learning community in Signal Village, Taguig City. Nursery, kindergarten, elementary, junior high school and senior high school." },
    { href: "/about", title: "About SNCS — History, mission and vision", body: [
      ...(profile?.history ?? []), ...(profile?.milestones.map(item => item.year + " " + item.title) ?? []),
      ...(profile?.coreValues ?? []), profile?.motto ?? "",
      ...getPublicInstitutionalSections().flatMap(item => [item.title, item.body, ...(item.commitments ?? [])]),
    ].join(" ") },
    { href: "/admissions", title: "Admissions — Requirements and enrollment guidance", body: [
      "What to prepare, step by step. Request a fee sheet. Request a campus visit. Taguig Learner’s Certificate (TLC) scholarship guidance.",
      ...getPublicAdmissionGroups().flatMap(item => [item.title, item.introduction, ...item.requirements, ...item.notes]),
      ...admissionsSteps.flatMap(item => [item.title, item.body]),
      ...admissionsFaqs.flatMap(item => [item.question, item.answer]),
    ].join(" ") },
    { href: "/campus", title: "Campus life — Facilities and student services", body: [
      "Alumni community. Rooted here, making a difference everywhere. School buildings and amenities.",
      ...getPublicFacilities().flatMap(item => [item.name, item.description]),
      ...getPublicStudentServices().flatMap(item => [item.title, item.description]),
    ].join(" ") },
    { href: "/contact", title: "Contact — School offices and visiting information", body: [
      contact?.address ?? "", contact?.officeHours ?? "",
      ...getPublicOffices().flatMap(item => [item.name, item.description, ...item.channels.map(channel => channel.label)]),
    ].join(" ") },
    { href: "/resources", title: "Resources — Official documents and downloads", body: "Public school documents and downloadable PDF forms. Taguig Learner’s Certificate (TLC) scholarship application forms." },
    { href: "/news", title: "News — School announcements", body: "Read published school announcements and notices from Sto. Niño Catholic School." },
    { href: "/events", title: "Events — School calendar", body: "Browse the school activity calendar and published events." },
    { href: "/enrollment", title: "Enrollment application", body: "Apply for enrollment at Sto. Niño Catholic School. Check the current application period and submit an enrollment application." },
  ];
  return pages.map(page => ({ ...page, id: "public-page:" + page.href, type: "page", status: "published", visibility: "public" }));
}
