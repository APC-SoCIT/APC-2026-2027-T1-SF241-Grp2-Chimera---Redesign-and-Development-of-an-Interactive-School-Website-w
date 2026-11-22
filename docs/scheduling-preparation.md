# Scheduling preparation and Sprint 3 handoff

Updated November 21, 2026, Philippine time; initial preparation November 13. Jira was read; no issues, sprint dates,
assignments or statuses were changed by this work.

## Current branch handoff

November 22 follow-up: the coordinator dashboard now opens the scheduling
workbench through a Supabase role-checked Express gateway. The backend loads
`.env.local` and can start scheduling independently of missing enrollment secrets.
See [coordinator setup and verification](coordinator-scheduling-setup.md). The
earlier isolation notes below describe the initial standalone preparation.

Branch `feat/pb-02-scheduling-workbench` follows `feat/<backlog-id>-<description>`,
using the PB-02 parent scope (Jira SC-9) for the SC-25–SC-28 preparation work. It is
based on current main `1358e98`, including the team's existing Supabase staff
authentication. Connecting this isolated scheduler to those staff routes and
production persistence remains separate integration work.

The available-load daytime trial generated all 933 meetings for 43 teachers and
28 sections, with lessons ending by 16:20 and dismissal by 17:00. It retains
explicit provisional rules and workload allowances, and cannot be published.
The latest clarification and full details appear in the daytime-trial section
below; earlier shift-restricted tests are historical records.

Pre-commit verification: 84 Python checks, 7 timetable rendering checks and all
331 existing application tests passed. Repository typecheck, lint and production
build passed; lint retains 103 existing Vue style warnings outside this feature.
ESLint now declares the standalone scheduler's browser-script and CommonJS test
environments explicitly. No client workbook/PDF, local database, generated
schedule or school input snapshot is included in the commit.

## November 21 implementation and coordinator clarification

Jira SC-25, SC-26, SC-27, SC-28 and SC-41 were read again. The four scheduler
subtasks are still To Do; no Jira statuses, assignments or descriptions were edited.
SC-41 is In Progress and references Jan’s PR #26. Protected portal/Auth/database
integration and school confirmation of publication authority are still dependencies,
so this local work does not mark all Sprint 3 acceptance criteria complete.

The local prototype now has an action dashboard: **Input teacher load** (manual
entry or Excel), **Set school times**, **Generate schedules**, **Review schedules**.
School records and adviser assignments have separate entry points; the period
controls are collapsed until needed. Input issues link to the relevant screen.

New behavior aligned with SC-25/26/27/28:

- Explicit automatic section allocation: a teacher’s load may specify subject,
  per-section weekly meetings and number of sections. CP-SAT decides eligible
  named sections, covers each curriculum class exactly once, and keeps a load’s
  weekly meetings together. Imported unnamed rows are converted only by an explicit
  allocation choice; no teacher or frequency is invented.
- Separate Grades 7–8 / 9–10 / 11 / 12 school-day settings; editable days, class
  periods, morning routines, recess, lunch policy and staggered dismissal windows.
- The supplied coordinator message establishes JHS routines 07:00–07:30, G11
  06:30–07:00 and G12 12:30–13:00. Mon-Fri remains an assumption. Exact breaks,
  dismissal and supervision duration still need school confirmation.
- Advisers are reserved for routines, breaks, dismissal and homeroom. Co-advisers
  are protected too. Duties appear in both timetable projections; teaching-minute
  totals remain separate from supervision.
- Independent verification checks allocation coverage and activity integrity.
  Changed day settings invalidate a draft; bad generations/publications preserve
  the prior published version.

A new unconfirmed **Term 2 · Coordinator rules review (G12 semester unconfirmed)**
working copy contains 43 teachers and 298 loads, including 103 automatic allocation
records. All weekly counts and teachers were retained. Advisers were read from the
converted workbook. Original source files and the previous period were preserved;
SQLite was backed up before creating the new copy. No actual school timetable has
been generated. The PDF-to-Excel reconciliation is still incomplete; input findings
must not all be described as omissions by the coordinator.

Verification: 72 Python behavioral tests plus 6 Node timetable tests pass. Browser
checks exercise dashboard/manual/import navigation, invalid meeting rejection,
separate shifts and blank preset fields, generation with adviser duties, both
schedule projections and the self-contained teacher report download. PDF pagination
in a normal browser is not established by the embedded-browser check.

The older preparation notes below are historical context; the section-allocation
assumption is superseded by the explicit automatic-allocation mode above.

## Verified Jira scope

[SC board](https://milesangelo77.atlassian.net/jira/software/projects/SC/boards/69)
lists **SC Sprint 3 - Scheduler**, November 23 to December 4, 2026, 09:00–18:00
Philippine time at its start/end, in Future state. Its goal is constraint scheduling
and the teacher portal (21 planned points). The dates are later than November 16;
use the board's confirmed dates when coordinating with the team.

Miles Angelo owns PB-02, 13 points, and PB-04, 5 points. All of the following were
To Do when inspected:

| Jira | Planned dates | Acceptance target | Local preparation |
| --- | --- | --- | --- |
| [SC-25](https://milesangelo77.atlassian.net/browse/SC-25) | Nov 23–24 | Inputs and approved hard rules | Original template inspected; shared input model, demo and questions documented. School approval still pending. |
| [SC-26](https://milesangelo77.atlassian.net/browse/SC-26) | Nov 25–27 | Excel parsing and actionable validation | Original SNCS schema import preview and manual editing use the same validator; source row locations retained. |
| [SC-27](https://milesangelo77.atlassian.net/browse/SC-27) | Nov 27–Dec 2 | CP-SAT and conflict checks | Real solver, independent verifier and feasible/impossible/timeout tests implemented locally. School-scale feasibility not established. |
| [SC-28](https://milesangelo77.atlassian.net/browse/SC-28) | Dec 3–4 | Draft review and publication | Frozen local versions and publication/teacher preview implemented. Production persistence and role checks remain. |
| [SC-33](https://milesangelo77.atlassian.net/browse/SC-33) | Dec 7–11 | Regenerate without overwriting publication | New local runs preserve publication; stale drafts blocked. Production PB-04 remains Sprint 4 work. |
| [SC-34](https://milesangelo77.atlassian.net/browse/SC-34) | Dec 10–14 | Changed/unsatisfiable regression | Behavioral tests cover failure preservation, infeasibility, changed inputs and timeouts. |

Parents: [PB-02 / SC-9](https://milesangelo77.atlassian.net/browse/SC-9),
[PB-04 / SC-7](https://milesangelo77.atlassian.net/browse/SC-7).
Teacher portal and authentication remain integration dependencies owned elsewhere
in the team; the local preview is not evidence that their Jira items are complete.

## Confirmed scope addition

The user confirmed: **Academic Coordinator maintains teacher loads, availability
and all scheduling data; teachers view published schedules.** Both manual entry
and Excel import feed one canonical model and one validator. Teacher availability
submission/approval screens are not part of this first version.

This can be documented as an amendment to PB-02/its use cases rather than silently
claiming the previously finalized specification already contains every new role
and workflow. Record the new actor, manual-entry flow, field rules, ownership and
acceptance evidence in the formal project documents when the team/adviser reviews
the change. No external approval or document change was submitted here.

## What the original files establish

Located the original 12-page **FOR APC (3 Terms G11 and 2 Sem G12-SNCS_Summary of
Teaching Loads and Other Assignments-Term 2-SY-2026-2027.pdf**, the SNCS Excel
templates, and an earlier local solver experiment in `Documents/SCHEDULER_SAMPLE`.
The experiment was preserved unchanged.

The inspected working template contains 43 teachers, 28 Grade 7–12 sections,
68 subject definitions and 298 teaching-load records (806 sixty-minute meetings
plus 127 forty-five-minute meetings). **103 load rows have no section**. All
66 bell-template rows have no start/end times. Six unavailable-time rows contain
elementary commitment descriptions without actual day/start/end intervals.

The workbook's Issues & Questions sheet also records unresolved arithmetic,
shared-section allocations, bell schedules, elementary commitments, combined SHS
classes, STEM Medical vs other STEM offerings, overload conventions and the
G11 term/G12 semester mapping. Those are school decisions, not solver guesses.

These figures describe this local working template, not a complete or approved
school dataset. A full school timetable has not been generated or validated.
The real-file validation report is kept locally in ignored
`services/scheduler/.local/school-input-review.json`.

## Preparation sequence

1. **Agree on the active period and curriculum.** Identify which G11 term and
   G12 semester the input applies to. Confirm every section, strand/subtrack,
   subject and weekly 45/60-minute frequency. Required lessons must be tracked
   independently from teacher assignments so an unstaffed class cannot disappear.
2. **Complete allocations and availability.** Resolve all 103 unnamed section
   assignments. Record every fixed elementary class and other unavailable time.
   Enter external weekly teaching minutes as well as blocked times.
3. **Confirm the school rules.** Obtain real bells, recess/lunch windows, daily
   meeting limits and workload policy. Decide which restrictions are immutable
   and which are preferences. Confirm whether rooms, qualifications, consecutive
   periods and student electives must be in the first accepted scheduling scope.
4. **Validate one small, real slice.** Have the coordinator verify the inputs
   and compare the result with a manually checked example. Include a teacher
   crossing grade groups, both period lengths and a known unavailable interval.
5. **Scale to the actual complete dataset.** Measure runtime and test staffing
   shortages, duplicate rows, revised bells, changed teachers, combined strands
   and multiple periods. Do not use the 12-meeting demo as a school-scale benchmark.
6. **Integrate and accept.** Connect staff sessions and database transactions,
   then test Coordinator and Teacher permissions with Jan/Gian. Have a second
   team member review the schedules and preserve acceptance evidence in Jira.

## Handling shortages and requests to force a schedule

A shortage is a condition to explain, not a reason to falsify a successful result.
For example, 30 required one-hour meetings cannot fit into a teacher's 25 available
one-hour periods. The school must reassign some classes, add qualified staffing,
change approved operating times or approve a permissible workload change that
actually creates enough usable capacity. A higher workload allowance does not
create more hours in the day.

| Outcome | Behavior |
| --- | --- |
| Invalid input | Identify the sheet/record/field; correct it before solving. |
| Feasible | Place every required meeting, independently recheck it, then save a reviewable draft. |
| Infeasible | Preserve prior publication; explain the shortage or sufficient conflicting set; require revised inputs. |
| Time limit / unknown | Report uncertainty; retry with more time or simplify/review inputs. Never call it proven impossible. |
| Changed inputs | Create a new version. Recheck before replacing the published schedule. |

Preferences may eventually be relaxed with a visible explanation. Physical
overlaps and fixed unavailability must not be bypassed by a generic Force button.
The local workload allowance is explicit and recorded, but production use still
requires the school's policy and an authorized approver.

## Integration boundary

Source lives in `services/scheduler`. The public Vue site, enrollment API, Supabase
tables and reference SQL were not changed. The Python domain/solver can be reused
behind the Express backend; the buildless local UI is a preparation tool, not the
final Vue portal implementation.

Before production:

- Add protected Express endpoints and the team's existing session/role checks.
  Client-side labels, hidden routes or a typed reviewer name are not authorization.
  The Coordinator can change inputs and create drafts; publication authority
  (Coordinator, Principal or another role) needs explicit school confirmation.
  Teachers can read only their own entries from a published schedule.
- Resolve workbook display names to persistent teacher/subject/section IDs on the
  server. Reject ambiguous matches; verify term and cohort ownership in transactions.
  Section/subject names currently act as term-local identifiers and renaming them
  requires updating references. Do not treat them as production database IDs.
- Add reviewed schema migrations for curriculum requirements, input snapshots,
  failure statuses including UNKNOWN, audit records and teacher/section consistency.
  The reference SQL currently has a teacher overlap exclusion but no equivalent
  section/strand rule, immutable load snapshot or complete verifier contract.
- Publication must atomically revalidate the stored input version and output,
  supersede one old publication, and expose only the new approved version.
  Keep historical snapshots independent from mutable/deletable teacher loads.
- Make period identifiers and the G11-term/G12-semester mapping explicit; the
  free-text local period name alone is not a production academic-calendar model.
- Add whichever school constraints are confirmed in step 3, staffing/qualification
  approval, solver execution limits, operational monitoring and school-scale tests.

The current solver is constraint programming, not machine learning. See Google's
[CP-SAT status documentation](https://developers.google.com/optimization/cp/cp_solver)
for the distinction between FEASIBLE, INFEASIBLE and UNKNOWN.

## Verification evidence

As of November 16, the current automated suite passes 52 behavioral tests: real CP-SAT solving,
independent verification, input and capacity failures, combined SHS cohorts,
unsatisfiable cross-grade teacher conflicts, time limits, local HTTP, import
mapping, concurrent saves, immutable run snapshots and atomic publication.

Browser checks exercised demo validation, generation, local publication, teacher
preview and import preview of the actual SNCS workbook. A synthetic demo publication
is retained locally for review. This does not complete production authorization,
school-data validation, full-scale performance testing or adviser acceptance.

## November 16 manual entry update

The coordinator now has a dedicated teaching-load form with teacher, section and
subject selection, weekly 45/60-minute meetings, calculated minutes and projected
teacher workload. New empty periods support entry without Excel. Save and edit
operations persist locally and validate the assignment on the server using the
same canonical rules as import. Curriculum creation is explicit, duplicate
assignments are rejected, and deleting a load preserves its required lessons.

Browser verification used a separate local test database: an empty period, manual
teacher/section/subject creation, a 225-minute weekly assignment, persistence after
reload, teacher reassignment, invalid fractional meetings and duplicate rejection.
The original local demo database and the shared school database were unchanged.

For the meeting demonstration, open **Edit** on a teaching-load row to show its
form. An incorrect meeting count is rejected on **Save teaching-load changes**;
restore the expected count before saving. The integrated staff portal and
authenticated Coordinator permissions remain pending.

## November 21 actual-file test and authorized trial

### Latest clarification: available load with full daytime hours

The user explained that the coordinator's shift message concerns a revised load
not yet provided. For the available file, they authorized a new full daytime
trial. All groups may start lessons at 07:30, with provisional 07:00–07:30
routines, staggered recess/lunch/dismissal and the unchanged firm 17:00 cutoff.

Run `a238a71512ad4cf3867d276b103d3d6a` places all 933 meetings for 43 teachers and
28 sections from 298 unchanged load rows, plus 560 adviser activities. The
independent verifier passed. Lessons finish by 16:20 and dismissal by 17:00. Both
downloaded audience sets contain every meeting exactly once. Review files and
sample PNG timetables are in ignored `services/scheduler/.local/client-daytime-review-20261121/`.

The new optional weekly-distribution objective reduced extra same-day class
meetings from 169 to 8 during a 60-second search. Eight matches the independent
lower bound from classes needing more than five weekly meetings. Solver status
remains FEASIBLE; teacher gaps, daily load balance, maximum consecutive periods
and rooms are not optimized. Temporary allowances for 22 teachers and the earlier
explicit curriculum/elementary assumptions remain provisional; publication is
blocked. The available source file was unchanged.

84 Python and 7 timetable rendering checks pass. Added regression coverage shows
that revised loads and class times generate a new timetable without changing the
previous snapshot or replacing the existing publication. G11/G12 labels no longer
hardcode a shift; actual per-period school times drive the schedule. The new
checkbox allows coordinators to request weekly subject spreading on regeneration.

### Historical tests before the clarification

**Correction after user review:** the user rejected the extended-hours assumption
and confirmed a firm 5 PM latest end. The earlier trial is withdrawn. Classes,
breaks and dismissal supervision ending after 17:00 now fail preflight, including
in trials and legacy snapshots without school-day plans. The independent verifier
uses that validation; publication cannot accept such inputs. Opening historical
late results shows a policy warning and suppresses timetable review/download
controls; meeting CSV export is rejected and historical publication is hidden.

The corrected local trial retains all 298 client load rows. Generation stops at
seven G12 cohort capacity errors and returns zero meetings. Prepared requirements
currently total 25–37 hours per G12 cohort versus a maximum of 20 weekday hours
from 13:00–17:00 before breaks. This compares the current interpretation; confirm
active semester subjects and contact hours before concluding what the school's
actual weekly demand is. G11 morning-only limits also remain unconfirmed.
The current suite passes 82 Python checks and 7 timetable-rendering checks.

The original converted client workbook and the coordinator-review working copy
were tested without modifying their data. Both stop at preflight: 209 issues in
the raw import, 110 in the prepared copy. The raw import has 103 unnamed section
references that the prepared copy explicitly treats as automatic choices. The
remaining issues include missing bell times, external commitment times and
curriculum frequencies. `INVALID_INPUT` is not a proof of infeasibility.

The user explicitly authorized a separate, labeled trial with provisional times.
It generated all 933 meetings from the 298 unchanged load rows for 43 teachers
and 28 sections, plus 535 adviser activities. Independent verification passed;
the downloaded teacher and section views each contain all meetings exactly once.
The source workbook's SHA-256 stayed unchanged. The frozen run is
`53970b50552b43c5beb0131ee537aa45`; local files and school names remain under
ignored `services/scheduler/.local/client-review-20261121/`.

This result requires prominent qualifications: G11 extends to 15:30 and G12 to
21:20, 22 teachers receive temporary workload allowances, missing curriculum
frequencies are recovered by a documented consensus rule, G11 STEM Medical
sections are trial choices, and elementary is deferred while its weekly teaching
minutes still count. The Computer 7 PDF/Excel frequency discrepancy remains
unresolved. The trial does not establish a feasible morning-only G11 or ordinary
afternoon-only G12 timetable. It cannot be published, enforced in the server as
well as the UI.

For the coordinator meeting, request maximum permitted shift/dismissal times,
exact 45/60-minute periods and staggered breaks, applicable workload and daily
span limits, STEM subtrack and term/semester mapping, and elementary scheduling
priority. Confirm rooms and fixed duties before assessing school readiness.

The current suite passes 78 Python and 7 timetable rendering tests. Full-school
search now uses four workers while retaining every required meeting; this trial
solved in 2.589 seconds. Large-model infeasibility explanations are still generic.
The local browser flow was checked from saved SQLite run through API response,
both timetable views and the two downloaded HTML reports. No production
publication, Jira change or commit was made.
