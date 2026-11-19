# Admissions guidance update

The admissions page renders all six applicant checklists in its initial HTML. Nursery and kindergarten come first, followed by Grade 1, Grade 7, senior high school, transferees/returnees, and continuing SNCS students. Plain anchor links jump to each checklist; JavaScript is not required to reveal requirements. Transferee guidance explicitly includes Grades 2–6 and 8–10 and preserves the conditional document requirements.

The page adds four preparation steps, school-year/date cards, fee-sheet guidance, TLC eligibility context, an FAQ, and an inline inquiry form. Fee inquiries are addressed to Finance; admissions and visit inquiries go to the Registrar. The form prepares a draft in the visitor's email application for review and sending. It does not submit an inquiry to a server, book a visit, or process payment.

## Facts awaiting school confirmation

The published notices refer to SY 2026–2027, but that alone does not establish that admissions are currently open. Opening, deadline, and class-start dates remain unset in `src/lib/content/admissions-guidance.ts` until official dates are supplied. The FAQ identifies mid-year availability and sibling priority as unconfirmed. Current tuition amounts are not inferred from older fee schedules; families can request an itemized schedule for a specific grade and school year.

## Sources checked

- [Preschool requirements](https://www.sncstaguig.com/registration/admission-requirements/new-student/preschool)
- [Incoming Grade 1 requirements](https://www.sncstaguig.com/registration/admission-requirements/new-student/incoming-grade-1)
- [Incoming Grade 7 requirements](https://www.sncstaguig.com/registration/admission-requirements/new-student/incoming-grade-7)
- [Senior high school requirements](https://www.sncstaguig.com/registration/admission-requirements/new-student/senior-high-school)
- [Transferee and returnee requirements](https://www.sncstaguig.com/registration/admission-requirements/new-student/transferee-and-returnee)
- [Continuing-student requirements](https://www.sncstaguig.com/registration/admission-requirements/old-student)
- [SNCS TLC requirements and school-year notice](https://www.sncstaguig.com/registration/admission-requirements/new-student/tlc-requirements)
- [City of Taguig scholarship information](https://sites.google.com/view/taguigcity/transformative/education/scholarships)
- [Published school fee schedules](https://www.sncstaguig.com/registration/school-fees)

## Site-wide improvements

Admissions is first in both desktop and mobile navigation and styled as a desktop button. The footer labels the previous website clearly and adds admissions email, Facebook Messenger, phone, and a map link. Alumni links to the redesigned Campus section. The older multimedia archive is explicitly labeled.

Each pre-rendered public page includes a canonical URL, route-specific Open Graph URL, and School JSON-LD with published contact details, address, and school office hours. Set `VITE_SITE_URL` before rebuilding when moving to the school's custom domain.

## Validation

Production type checks and build, all 200 existing/component tests, initial-HTML checks across ten public pages, and connected standalone-preview smoke checks pass. Checks include six visible server-rendered checklists, prospective-student ordering, four process steps, contact links, metadata, and accessible label associations. The HTTP tests require local network permission.
