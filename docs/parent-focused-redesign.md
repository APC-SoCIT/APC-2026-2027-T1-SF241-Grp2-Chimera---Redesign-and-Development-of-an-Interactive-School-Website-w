# Public website redesign — November 2026

The homepage now prioritizes prospective families with a full-width campus
photograph, the school's purpose as the main headline, learning levels,
admissions guidance, fee and visit inquiries, FAQs, and verified school contact
information. Current-family links are grouped farther down the page. The
illustrated rotating campus model is on `/campus`, with the small roof lettering
removed. The school keeps its own red, gold, serif, and sans-serif identity.

The user's reference is [De La Salle University](https://www.dlsu.edu.ph/).
Its site returned HTTP 403 to automated retrieval. Native browser inspection
also stopped because its URL could not be verified. The implementation is an
original institutional layout and does not claim to reproduce the current
DLSU page.

## Content and trust

- Learning levels and applicant groups come from the existing admission
  checklists and school facility descriptions.
- Contact numbers, Registrar email, Finance email, address, and office hours
  follow the [school contacts](https://www.sncstaguig.com/contacts) and
  [homepage notice](https://www.sncstaguig.com/home).
- September 2026 activities are labeled as previously announced when no
  future events have been supplied. New published future events automatically
  replace these on the homepage.
- Missing publication dates are labeled, rather than assigned invented dates.
- The GENYO poster remains on the full article, with a text summary in lists.
  The official school's contact addresses are not replaced with the student
  project's Vercel hostname.
- The existing alumni image is identified as a 2019 archive tribute.
  No testimonials, current classroom photos, tuition amounts, or accreditation
  badges are fabricated. School-approved recent student/activity photographs
  and current recognition documents remain content inputs for launch.
- Admission inquiries prepare an email for review in the visitor's own mail
  app. This is not a backend form submission or a confirmed campus appointment.

## Rendering and hosting

`pnpm build` produces the browser app and pre-renders ten public pages using
Vue's server renderer. `vercel.json` routes known pages to their generated
HTML. JavaScript mounts the interactive application after that initial HTML.
The browser-local CMS is excluded from server rendering, and `/admin` remains
available when `VITE_CMS_PREVIEW=true` is set for the browser build.

Open Graph metadata, a sitemap, and robots.txt are generated for sharing and
discovery. Set `VITE_SITE_URL` to the approved custom origin when one is
connected. The current origin remains the classroom Vercel preview. CMS edits
and uploads remain local to each browser; production authentication and shared
content persistence are outside this design update.

The resting public inquiry field borders exceed 3:1 against white. Body text
uses dark colors on white or pale neutral surfaces; white hero text is placed
over a dark image overlay. New field feedback uses blur validation and a 2px
focus outline with a 2px offset.
