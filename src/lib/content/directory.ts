import type { ContactOffice, SchoolContactInformation, StudentService } from "./model";
import { getPublishedPublicItems } from "./selectors";
import { defaultContactDetails, toOffices, toSchoolInformation } from "./contact";

const publicContent = { status: "published", visibility: "public", publishedAt: null } as const;
const sourceUrl = "https://www.sncstaguig.com/contacts";
// The built-in contact details; the website shows the Admin-edited copy when it is available.
const schoolInformation: SchoolContactInformation[] = [toSchoolInformation(defaultContactDetails)];
const offices: ContactOffice[] = toOffices(defaultContactDetails);
const services: StudentService[] = [
  { ...publicContent, id: "registrar-service", slug: "registrar", title: "Registrar", description: "Ask about admission requirements and school records.", channel: { label: "Email the Registrar", href: "mailto:officeoftheregistrar@sncstaguig.edu.ph" }, sourceUrl },
  { ...publicContent, id: "guidance-service", slug: "guidance", title: "Guidance and counseling", description: "Connect with the Guidance Office for student support.", channel: { label: "Message Guidance", href: "https://www.messenger.com/t/100063541501667", external: true }, sourceUrl: "https://www.sncstaguig.com/about/student-services" },
  { ...publicContent, id: "clinic-service", slug: "clinic", title: "School Clinic", description: "Find the school’s health-service information and contact channel.", channel: { label: "Visit the Clinic page", href: "https://www.facebook.com/SNCSClinic2019/", external: true }, sourceUrl: "https://www.sncstaguig.com/about/student-services" },
  { ...publicContent, id: "library-service", slug: "library", title: "Library", description: "Explore the school’s online library and reading resources.", channel: { label: "Visit the library website", href: "https://library.sncstaguig.edu.ph/", external: true }, sourceUrl: "https://www.sncstaguig.com/about/student-services" },
];
export const getPublicOffices = () => getPublishedPublicItems(offices);
export const getPublicStudentServices = () => getPublishedPublicItems(services);
export const getPublicSchoolContactInformation = () => getPublishedPublicItems(schoolInformation)[0];
