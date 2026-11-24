import { getPublicOffices, getPublicSchoolContactInformation } from "./directory";

export function schoolStructuredData(origin: string) {
  const site = new URL(origin).origin;
  const school = getPublicSchoolContactInformation();
  const offices = getPublicOffices();
  const email = offices.find((office) => office.id === "registrar")?.channels.find((channel) => channel.href.startsWith("mailto:"))?.href.slice(7);
  const telephone = offices.find((office) => office.id === "principal")?.channels.find((channel) => channel.href.startsWith("tel:"))?.href.slice(4);
  return {
    "@context": "https://schema.org",
    "@type": "School",
    "@id": site + "/#school",
    name: "Sto. Niño Catholic School, Inc.",
    url: site + "/",
    logo: site + "/images/source-site/sncs-seal.png",
    telephone,
    email,
    address: { "@type": "PostalAddress", streetAddress: "Sampaloc St., Zone 1, North Signal Village", addressLocality: "Taguig City", addressRegion: "Metro Manila", addressCountry: "PH" },
    description: "Catholic education from nursery to senior high school. School office transactions: " + school?.officeHours + ".",
    openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "17:00" }],
    sameAs: ["https://www.sncstaguig.com/home"],
  };
}
