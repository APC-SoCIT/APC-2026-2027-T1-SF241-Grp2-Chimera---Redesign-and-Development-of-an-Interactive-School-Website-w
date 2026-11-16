export type PublicationStatus = "draft" | "published" | "archived";
export type ContentVisibility = "public" | "private";

export interface PublishableContent {
  id: string;
  slug: string;
  status: PublicationStatus;
  visibility: ContentVisibility;
  publishedAt: string | null;
  sourceUrl?: string;
}

export interface AnnouncementImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
}

export interface Announcement extends PublishableContent {
  title: string;
  summary: string;
  category: "School Advisory" | "Campus News" | "Achievement";
  body: string[];
  formattedBody?: string;
  image?: AnnouncementImage;
  gallery?: AnnouncementImage[];
}

export interface SchoolEvent extends PublishableContent {
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
  location: string | null;
  formattedBody?: string;
  gallery?: AnnouncementImage[];
}

export interface Facility extends PublishableContent {
  name: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  accent: "red" | "gold" | "green";
}

export interface InstitutionalSection extends PublishableContent {
  eyebrow: string;
  title: string;
  body: string;
  commitments?: string[];
}

export interface SchoolProfile extends PublishableContent {
  history: string[];
  milestones: { year: string; title: string }[];
  coreValues: string[];
  motto: string;
}

export interface ContactChannel {
  label: string;
  href: string;
  external?: boolean;
}

export interface ContactOffice extends PublishableContent {
  name: string;
  description: string;
  channels: ContactChannel[];
}

export interface SchoolContactInformation extends PublishableContent {
  address: string;
  officeHours: string;
}

export interface StudentService extends PublishableContent {
  title: string;
  description: string;
  channel: ContactChannel;
}

export interface AdmissionGroup extends PublishableContent {
  title: string;
  introduction: string;
  requirements: string[];
  notes: string[];
}
