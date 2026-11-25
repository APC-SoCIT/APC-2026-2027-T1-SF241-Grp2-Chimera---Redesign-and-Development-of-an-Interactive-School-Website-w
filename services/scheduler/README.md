# SNCS local scheduling preparation

A local working slice for Miles's PB-02 (SC-9) and advance preparation for PB-04
(SC-7). The Academic Coordinator manages all scheduling inputs, including teacher
availability. Teachers view published schedules. Teacher availability submissions
are outside this version, per the confirmed product decision.

The Python workbench now also opens inside the Academic Coordinator's verified
staff dashboard. Express checks the current Supabase session and coordinator role
on every data request, and the Python gateway mode requires an internal secret.
Storage remains SQLite; Supabase scheduling persistence is not yet implemented.
The standalone loopback preview still runs independently. See
[portal setup](../../docs/coordinator-scheduling-setup.md) for both modes.

Current verification includes **85 Python checks and 8 timetable/portal checks**.
The full daytime trial places all 933 supplied meetings, with lessons ending by
16:20 and dismissal by 17:00. It remains provisional and non-publishable. Original
client files, SQLite databases, trial inputs and generated schedules remain local
under ignored `.local/`; they are not included in source control.

## Start

Requires Python 3.11+ and these packages (installed in the development environment):

```powershell
python -m pip install -r requirements.txt
python app.py serve --port 8765
```

Run these commands from `services/scheduler`, or use `start-scheduler.cmd` on
Windows. Open <http://127.0.0.1:8765>. Stop with Ctrl+C. The server binds only to
127.0.0.1, enforces same-origin writes, and has no public-network host option.
It has no login; do not use it as a network or production staff application.

## Try the complete flow

1. Start on **Dashboard**. Use **Input teacher load** to choose manual entry or
   Excel import. Use **School records & rules** for teachers, subjects, sections,
   curriculum, advisers and commitments. **Try an example first** loads a fictional
   two-teacher/two-section example with automatic allocation and adviser duties.
2. Run readiness checks. Correct errors rather than deleting required lessons.
3. Confirm the curriculum, workload, bell times and availability after review.
   The confirmation is local preparation evidence, not authenticated school approval.
4. Generate a draft. The solver places every required meeting, or reports an input
   error, infeasibility, timeout or model failure. It never returns a partial
   timetable as a successful complete schedule.
5. Review the section schedule, enter a local coordinator/reviewer name, and
   publish locally. The teacher preview reads only the published version.

6. Edit inputs and regenerate. Inputs are frozen per run; a stale draft cannot be
   published, and a failed solve does not overwrite the previous publication.

## Weekly teacher and class schedules

Under **Review schedules**, a verified version has **Class schedules** and
**Teacher schedules** tabs. Select a section or teacher to see its weekday/time
grid. Both views project the same saved meetings; they are never solved separately.
Blocks show the subject, exact times and the teacher (class view) or section
(teacher view). Colors are consistent across both views. Saturday appears when
used. Simultaneous classes for disjoint SHS strands remain visible side by side.
Long labels are available in the block tooltip and expandable **Lesson details**.

**Print / save this schedule as PDF** opens the browser print dialog. Downloads
provide two self-contained HTML documents: all teacher schedules and all class
schedules, with page breaks between records. Open either file in a browser to
print or save as PDF. No internet connection is needed. Each copy identifies its
period, version, draft/published status and demo label. Blank space means no lesson
or school activity in that version. Adviser routines, breaks, dismissal and
co-adviser homeroom supervision are shown separately from teaching. Rooms and
other fixed commitments remain outside the rendered teaching blocks.

Expand **Teaching loads used for this version** to inspect its frozen input loads,
including both meeting frequencies and calculated minutes. The JSON version
download preserves all inputs; later working-copy edits do not alter that record.
Each school year + period has its own working copy and schedule versions. A new
period does not overwrite a previous period. Changing a period's data requires
the current save revision, to prevent silent overwrites from another tab.

## Enter teaching loads manually

Choose **Input teacher load → Enter manually**. Select the teacher, subject and
section, then enter the weekly 60-minute and 45-minute meeting counts. Choose
**Let the scheduler choose sections** to enter an automatic assignment and the
number of sections. Meetings are entered per section; weekly minutes and projected
workload include the whole batch. Editing an existing automatic record edits one
section allocation, without changing other records. The form shows calculated weekly minutes and the
teacher's projected workload. Use **Show assignments for** to review one teacher
and their total weekly teaching time. For an existing curriculum requirement, the meeting
counts are filled from that requirement. Saving does not silently change it.

If a class has no curriculum requirement yet, explicitly select the option to
create one with the entered meeting counts, or add it through the Curriculum tab.
This records an input for later school review; it does not confer school approval.

**Save teaching load locally** validates and persists the assignment together with
the current period inputs. Other incomplete school records may remain drafts.
Duplicate classes, incorrect grades/strands, invalid counts, curriculum mismatches
and excess workload are rejected without changing saved data. Use **Edit** beside
an assignment to change it; **Cancel edit** preserves the saved assignment.
Removing an assignment leaves its required lessons in Curriculum, so an unstaffed
class remains visible in readiness checks.

To start entirely without Excel, choose **New empty period**, enter its school
year and term/semester, then add teacher, section and subject records using the
dashboard School records buttons. Return to Input teacher load to enter assignments. Existing
saved periods and published versions are preserved. No school bell rules are
invented; generation still waits for complete, validated scheduling inputs.

## Import the existing workbook

Choose **Input teacher load → Import an Excel file** and select the existing **SNCS_Teaching_Load_Template.xlsx**
or its `SNCS_Teaching_Load_Templatee.xlsx` working copy. Review the preview before
applying it. Import does not save or publish. Enter the correct target school year
and term/semester, fix the records, then save locally. Missing named sections
remain visible until the coordinator explicitly chooses automatic allocation.
**Let scheduler assign unassigned sections** converts those records into solver
allocation decisions, without altering teachers or meeting counts.

The parser detects headers in the first 12 rows and accepts the original six input
sheets: Teachers, Sections, Subjects, Teaching Loads, Bell Schedule and Unavailable
Times. It reads editable cells without evaluating formulas. The Grade, Weekly
Minutes, Check, Summary and Recess Group formulas are not trusted; relevant values
are recomputed. Formula-only empty rows are ignored; formulas in editable input
cells are rejected. Excel time values are normalized to clock times.

The older `Teacher_Load_Import_Example.xlsx` and `Admin_Scheduling_Input_Example.xlsx`
are different schemas and are deliberately rejected with a clear missing-sheet
message. PDF/DOCX summaries are reference material, not directly importable inputs.

Imported **Curriculum** records are a starting point for review: named assignments
seed requirements, while missing Core/Homeroom combinations receive blank weekly
counts. They must be confirmed against the official curriculum. Strand/subtrack
choices must be explicit; for example, a STEM Medical subject is not automatically
required for every STEM section. The school must confirm those offerings.

The source workbook is incomplete. Correct invalid worksheet rows before applying
the workbook. Import errors include the original sheet, row and field where
available. The preview does not change saved inputs, and an invalid worksheet
row in an edited import prevents the whole working copy from being saved.
Missing bell coverage and curriculum confirmation can be completed in the
workbench before generating a timetable.

Read-only CLI validation:

```powershell
python app.py check "C:\path\SNCS_Teaching_Load_Template.xlsx" --school-year "2026-2027" --period "Term 2 - confirm G12 mapping" --report ".local\input-review.json"
```

A nonzero exit code means input issues were found. The report provides sheet,
original row and field locations. Unused bell rows with both times blank are
allowed; every scheduled grade group still needs actual class periods.

## School times and adviser duties

**Set school times** has separate settings for Grades 7–8, Grades 9–10, Grade 11
and Grade 12. Enter arrival/routines, recess, an explicit lunch/no-lunch decision,
dismissal start, and the end of adviser supervision. Add separate day settings
when Friday or another day differs. The class-period editor accepts 45/60-minute
slots. It rejects classes during routines/breaks or beyond dismissal.

**Use coordinator’s starting times** fills only missing arrival/routine fields:
JHS 07:00–07:30, G11 06:30–07:00, G12 12:30–13:00. It preserves existing times.
Mon-Fri is an editable starting assumption. Actual recess/lunch/dismissal values
are never invented. Lunch for afternoon Grade 12 remains a school decision.

Break intervals (recess or lunch) cannot overlap between different groups; release
windows cannot overlap between different groups. These are time separation rules,
not a numerical cafeteria-capacity model. Within each group its sections share the
settings. Dismissal end is the adviser supervision end, not another teaching slot.

Assign one or more advisers through **Class advisers**. For active school-day
settings, every section needs valid advisers. All advisers are blocked during their
section’s routines, recess, lunch and dismissal. Homeroom is assigned to an adviser;
co-advisers are also reserved during its generated time. Supervision is distinct
from the teacher’s teaching-minute budget. Duty overlaps are actionable errors.

Optional schema-version-1 extensions: `day_plans` is a list of simple records with
`group`, `days`, `arrival`, `morning_end`, `recess_start`, `recess_end`, `lunch`
(`yes`, `no`, `unconfirmed`), `lunch_start`, `lunch_end`, `dismissal_start`,
`dismissal_end`. Sections use comma-separated teacher IDs in `advisers`.
Older snapshots without day plans retain their original behavior; old `11-12`
bells are understood for review. The editor explicitly separates those old slots
for morning/afternoon planning. Unused groups may retain unfinished draft settings.

Automatic loads use `allocation: "auto"`, blank `section`, and optional
comma-separated `candidate_sections`. Each record is one section’s entire weekly
load. The solver allocates it to exactly one eligible, unstaffed curriculum class
with matching frequency, grade and strand. No required class can disappear or
receive two teacher loads. All meetings of one load stay with its chosen section.
Manual `section_count` expands 1–50 records in one atomic save. A failed batch
saves none. Curriculum stays independent and must be entered explicitly.

## Rules and limits

Implemented: exact weekly 45/60-minute counts, independent curriculum vs teacher
assignment checks, grade matching, single teacher per class, daily meeting limit,
teacher overlap across staggered grade-group bells, section/strand overlap, Core
classes occupying all strands, breaks and fixed unavailability.

Other teaching minutes count toward workload. Teachers who also teach elementary
need actual blocked intervals, external weekly minutes and an explicit completeness
confirmation. Workload above a configured limit warns during readiness and draft
generation. Publication still requires the workload to be within the limit or
covered by an allowance. A declared allowance needs a recorded reason/approver. This
does not authorize an allowance under school policy: the school must decide which
limits can be adjusted. An allowance never bypasses overlap or unavailable times.

The solver uses fixed 45/60-minute bell periods and a configurable maximum of
1–6 meetings of a class per day. It does not infer free-form start times. The
default one-meeting-per-day rule is an assumption for school review.

Not yet modeled: room assignment/capacity, teacher qualifications, individual
student elective overlap, travel between buildings, fixed lesson locks, preferred
periods, maximum consecutive teaching periods and timetable quality objectives.
`OPTIMAL` currently means the feasibility model has been solved, not that gaps or
teacher preferences have been optimized. These limitations appear in the UI.

`INFEASIBLE` means no complete timetable satisfies the current model. The solver
returns a sufficient conflicting set of classes where possible; it is not guaranteed
minimal, and does not automatically diagnose the best staffing change. `UNKNOWN`
means the time limit ended without either a schedule or an infeasibility proof.

## Data and verification

Local SQLite data, source audits and generated versions live under ignored
`.local/`. Original school files are not copied into tracked source. Back up the
SQLite file while the server is stopped, or download individual working copies and
version snapshots from the UI. Downloads are JSON, CSV and printable HTML; the original workbook is
never modified.

```powershell
python -m unittest -v
node --check web/app.js
node --check web/workspace.js
node --test test_timetable.cjs
```

The tests cover actual solver behavior, independent verification, invalid inputs,
staff shortages, concurrent saves, frozen versions, atomic publication, failed
regeneration, import mapping and the local HTTP flow. HTTP tests require permission
to use loopback sockets in restricted execution environments.

See [the Sprint 3 handoff](../../docs/scheduling-preparation.md) for Jira mapping,
remaining school decisions, and the production integration steps.

## November 21 client-load trial

### Current full daytime trial

The user clarified that the coordinator's shift message applies to a revised load
not yet supplied, and authorized scheduling the available load without those old
shift restrictions. The current trial opens lessons at 07:30 for all groups and
retains the firm 17:00 boundary, with provisional staggered breaks and dismissal.
G11/G12 editor labels no longer hardcode morning/afternoon shifts.

Run `a238a71512ad4cf3867d276b103d3d6a` contains all 933 meetings from the 298
unchanged load rows, for 43 teachers and 28 sections, plus 560 adviser activities.
Independent verification passed. Latest lesson end is 16:20; dismissal supervision
ends by 17:00. The current review package is under ignored
`.local/client-daytime-review-20261121/START-HERE-daytime-review.html`.

Optional `spread_lessons: true` minimizes extra meetings of the same class on one
day while keeping every hard constraint. The 60-second search returned FEASIBLE
and reduced the repeat score from 169 to 8. An independent five-day frequency
bound is also 8 (some classes require six/eight weekly meetings). This establishes
the minimum repeat score, not general timetable quality or teacher-gap optimality.
The stored solver status remains FEASIBLE. The preference is available in Generate
schedules and is preserved in snapshots.

The trial retains explicit temporary workload allowances for 22 teachers, the
documented curriculum preparation and deferred elementary policy. It remains
unconfirmed and non-publishable. Actual source files were unchanged.

Current checks: 84 Python and 7 timetable rendering tests pass. A revised-load and
time test verifies regeneration, immutable earlier snapshots, unconfirmed-draft
publication rejection and preservation of the previous publication. Existing
checks cover shortages, missing data, stale drafts and concurrent saves.

### Earlier restricted-shift experiments

**Withdrawn after user correction:** the extended-hours experiment below is
historical evidence only. The school has a firm **17:00** latest end, including
dismissal supervision. Preflight, independent verification and publication enforce
this boundary. Historical late results are flagged and cannot be offered as
current timetables or exported as meeting CSVs.

The corrected trial is `TRIAL - Client loads, firm 5 PM cutoff - 2026-11-21`.
It retains all client load rows and stops at seven G12 cohort capacity errors,
with no timetable generated. The prepared requirements total 25–37 hours per
G12 cohort; 13:00–17:00 Monday–Friday provides at most 20 hours before breaks.
This is a limitation of the current period/curriculum interpretation, not proof
that the school cannot be scheduled. Confirm active semester subjects and contact
hours against the coordinator PDF and intended shift windows. The review package
entry page now explains this correction; earlier linked timetable files show
withdrawal notices and preserve their old contents separately.

The exact client workbook was tested through the production importer. It stops
at preflight with incomplete inputs (209 issues); the prepared coordinator-review
copy has 110. Neither result proves timetable infeasibility. Their original data
was preserved, and the source workbook's SHA-256 remained unchanged.

With explicit user authorization, a separate `trial: true` workspace uses all
298 supplied loads, 43 teachers and 28 sections. All 933 required meetings and
535 adviser activities were generated and independently verified. Both downloaded
audience views contain each meeting exactly once. The local review package lives
under ignored `.local/client-review-20261121/START-HERE-client-trial.html`.

This experiment extends G11 to 15:30 and G12 to 21:20, applies 22 temporary workload
allowances, fills documented curriculum gaps and defers six undated elementary
commitment placeholders. It **does not** establish feasibility within the intended
morning/afternoon shifts, authorize workload excess or establish elementary
feasibility. All supplied teaching counts remain unchanged. The package records
every provisional choice, per-teacher allowance and automatic section assignment.
Trial labels and assumptions appear in review and HTML downloads. The server
rejects trial publication even when review confirmation is true.

`elementary_after_secondary` is allowed only in explicit trials. It retains known
external weekly teaching minutes and any dated fixed commitments. Only undated
elementary placeholders explicitly marked `deferred` may be skipped; school-data
generation keeps its normal completeness checks.

School-size models (100+ loads) use four search workers with every required load
explicitly enabled. Equivalent automatic assignments are ordered to remove row
permutation symmetry. Smaller models retain assumption-based conflict explanations;
large infeasible runs currently have no sufficient conflict-set explanation. The
search limit is configurable up to 300 seconds. This client trial solved in 2.589
seconds on the local machine; that timing is not a general performance guarantee.

Current checks: 78 Python tests plus 7 timetable rendering tests pass, including
the large-model hard-requirement path, trial publication rejection, deferred
commitment boundaries and trial output labeling.
