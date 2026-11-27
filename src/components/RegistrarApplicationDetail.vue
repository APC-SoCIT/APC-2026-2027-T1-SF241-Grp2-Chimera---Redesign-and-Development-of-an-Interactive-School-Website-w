<!--
  Author: Gian Mandac
  Created Date: 20261116
  Review Application Details & Documents, View Dynamic Requirement Checklist,
  Update Application Status & Registrar Remarks, Trigger Outbound Status Email (only after
  the Registrar previews and confirms it) and Print A4 Verification Form, following the
  Manage Enrollment Application use case.
  Modified by: Gian Mandac (slide-in review panel with a requirements progress bar)
  Modified Date: 20261118
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  applicationStatuses, getApplication, processingStatuses, RegistrarError, sendStatusEmail, setRequirement, updateStatus,
  type ApplicationDetail, type ProcessingStatus,
} from "@/lib/enrollment/registrar";
import { buildPrintDocument, openPrintableDocument, printDocument } from "@/lib/enrollment/print-form";
import { requirementsFor, splitChecklist, summarizeChecklist } from "@/lib/enrollment/requirements";

const props = defineProps<{ reference: string; hasPrevious: boolean; hasNext: boolean }>();
const emit = defineEmits<{ close: []; previous: []; next: []; updated: [reference: string, status: ApplicationDetail["status"]] }>();

const application = ref<ApplicationDetail>();
const loading = ref(true);
const loadError = ref("");
const notFound = ref(false);

const checklistSaving = ref<string>();
const checklistError = ref("");

const newStatus = ref<ProcessingStatus>("for_review");
const newRemarks = ref("");
const confirming = ref(false);
const saving = ref(false);
const saveError = ref("");
const saveNotice = ref("");
const emailPrompt = ref(false);
const emailState = ref<"idle" | "sending" | "sent" | "failed">("idle");

// Labels match the enrollment form so the Registrar sees the same wording as the applicant.
const departments = { preschool: "Pre-school", grade_school: "Elementary", jhs: "Junior High School", shs: "Senior High School" } as const;
const applicantTypes = { new: "New", old: "Old", returnee: "Returnee" } as const;
const payments: Record<string, string> = { full_cash: "Full payment / cash", monthly: "Monthly", quarterly: "Quarterly", semi_annual: "Semi-annual" };
const relationships = { father: "Father", mother: "Mother", guardian: "Guardian" } as const;
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
const dateOnly = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });

const requirements = computed(() => application.value ? requirementsFor(application.value) : []);
const checklist = computed(() => summarizeChecklist(requirements.value, application.value?.requirement_checks ?? {}));
const emailChecklist = computed(() => splitChecklist(requirements.value, application.value?.requirement_checks ?? {}));
const fullName = computed(() => application.value
  ? [application.value.first_name, application.value.middle_name, application.value.surname].filter(Boolean).join(" ") : "");
const statusChanged = computed(() => !!application.value && (newStatus.value !== application.value.status
  || newRemarks.value.trim() !== (application.value.registrar_remarks ?? "")));
const printedAt = ref(new Date());
const progress = computed(() => checklist.value.required
  ? Math.round((checklist.value.received / checklist.value.required) * 100) : 0);
const subtitle = computed(() => application.value
  ? `${application.value.grade_level}, ${applicantTypes[application.value.applicant_type].toLowerCase()} applicant, submitted ${dateTime.format(new Date(application.value.submitted_at))}`
  : "");

// Move keyboard focus into the panel and stop the page behind it from scrolling.
const panel = ref<HTMLElement>();
let previousOverflow = "";
onMounted(() => {
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  panel.value?.focus();
});
onUnmounted(() => {
  document.body.style.overflow = previousOverflow;
});

function birthDate(value: string) {
  return dateOnly.format(new Date(`${value}T00:00:00+08:00`));
}

// Review Application Details START
async function load() {
  loading.value = true;
  loadError.value = "";
  notFound.value = false;
  confirming.value = false;
  saveError.value = "";
  saveNotice.value = "";
  checklistError.value = "";
  emailPrompt.value = false;
  emailState.value = "idle";
  try {
    const record = await getApplication(props.reference);
    application.value = record;
    newStatus.value = record.status === "pending" ? "for_review" : record.status;
    newRemarks.value = record.registrar_remarks ?? "";
  } catch (error) {
    application.value = undefined;
    if (error instanceof RegistrarError && error.kind === "not-found") notFound.value = true;
    else loadError.value = error instanceof RegistrarError ? error.message : "Could not load the application.";
  } finally {
    loading.value = false;
  }
}
watch(() => props.reference, load, { immediate: true });
// Review Application Details END

// Requirement Checklist START
async function toggleRequirement(key: string, received: boolean) {
  if (!application.value) return;
  checklistSaving.value = key;
  checklistError.value = "";
  const previous = application.value.requirement_checks[key];
  application.value.requirement_checks = { ...application.value.requirement_checks, [key]: received };
  try {
    await setRequirement(application.value.reference_no, key, received);
  } catch (error) {
    const checks = { ...application.value.requirement_checks };
    if (previous === undefined) delete checks[key]; else checks[key] = previous;
    application.value.requirement_checks = checks;
    checklistError.value = error instanceof RegistrarError ? error.message : "Could not save the checklist.";
  } finally {
    checklistSaving.value = undefined;
  }
}
// Requirement Checklist END

// Update Status START
function askToConfirm() {
  saveError.value = "";
  saveNotice.value = "";
  if (newRemarks.value.trim().length > 1000) {
    saveError.value = "Remarks must be 1,000 characters or fewer.";
    return;
  }
  confirming.value = true;
}

async function confirmStatusUpdate() {
  if (!application.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const result = await updateStatus(application.value.reference_no, newStatus.value, newRemarks.value);
    application.value.status = result.status;
    application.value.registrar_remarks = result.registrar_remarks;
    confirming.value = false;
    saveNotice.value = "Status saved and recorded in the audit trail.";
    emit("updated", application.value.reference_no, result.status);
    // Never email automatically: offer a preview the Registrar must confirm.
    if (result.changed) openEmailPrompt();
  } catch (error) {
    saveError.value = error instanceof RegistrarError ? error.message : "Could not save the status. Try again.";
  } finally {
    saving.value = false;
  }
}

// Trigger Outbound Status Email START
function openEmailPrompt() {
  emailState.value = "idle";
  emailPrompt.value = true;
}

async function confirmEmail() {
  if (!application.value) return;
  emailState.value = "sending";
  try {
    await sendStatusEmail(application.value.reference_no);
    emailState.value = "sent";
    emailPrompt.value = false;
  } catch {
    emailState.value = "failed";
  }
}
// Trigger Outbound Status Email END
// Update Status END

// Print A4 Verification Form START
// Printing only opens the browser print dialog; it never changes the application.
const printSource = ref<HTMLElement>();

async function printableDocument(withPrintButton: boolean) {
  printedAt.value = new Date();
  await nextTick();
  if (!printSource.value || !application.value) return undefined;
  return buildPrintDocument(printSource.value.innerHTML, `Verification form ${application.value.reference_no}`, withPrintButton);
}

async function printForm() {
  const html = await printableDocument(false);
  if (html) printDocument(html);
}

async function openPrintableForm() {
  const html = await printableDocument(true);
  if (html) openPrintableDocument(html);
}
// Print A4 Verification Form END
</script>

<template>
  <div class="detail-layer" role="dialog" aria-modal="true" aria-labelledby="application-detail-heading" @keydown.esc="emit('close')">
    <div class="detail-scrim" aria-hidden="true" @click="emit('close')"></div>
    <aside ref="panel" class="detail-panel" tabindex="-1">
      <header class="detail-header">
        <div class="detail-top">
          <div class="detail-title">
            <h2 id="application-detail-heading">{{ application ? fullName : "Review application" }}</h2>
            <p>
              <span class="detail-ref">{{ reference }}</span>
              <span v-if="subtitle">, {{ subtitle }}</span>
            </p>
          </div>
          <div class="detail-nav">
            <span v-if="application" :class="['status-badge', application.status]">{{ applicationStatuses[application.status] }}</span>
            <button type="button" class="button-small" :disabled="!hasPrevious || loading" @click="emit('previous')">Previous</button>
            <button type="button" class="button-small" :disabled="!hasNext || loading" @click="emit('next')">Next</button>
            <button type="button" class="button-small close" aria-label="Close application" @click="emit('close')">✕</button>
          </div>
        </div>
        <div v-if="application" class="progress">
          <div class="progress-label">
            <span>Requirements received</span>
            <span>{{ checklist.received }} of {{ checklist.required }}</span>
          </div>
          <div class="progress-track" role="progressbar" aria-label="Required documents received" :aria-valuenow="checklist.received" aria-valuemin="0" :aria-valuemax="checklist.required">
            <span :class="{ full: checklist.complete }" :style="{ width: `${progress}%` }"></span>
          </div>
        </div>
      </header>

      <div class="detail-scroll">
        <p v-if="loading" class="state">Loading application…</p>
        <div v-else-if="notFound" class="state" role="alert">
          <p>Application not found. It may have been removed, or the reference number is wrong.</p>
          <button type="button" class="button-maroon" @click="emit('close')">Back to the list</button>
        </div>
        <div v-else-if="loadError" class="state" role="alert">
          <p>{{ loadError }}</p>
          <button type="button" class="button-maroon" @click="load">Try again</button>
        </div>

        <div v-else-if="application" class="detail-body">
          <div class="detail-info">
            <section aria-labelledby="enrollment-details">
              <h3 id="enrollment-details">Enrollment details</h3>
              <dl class="fields">
                <div><dt>School year</dt><dd>{{ application.school_year }}</dd></div>
                <div><dt>School level</dt><dd>{{ departments[application.department] }}</dd></div>
                <div><dt>Grade level</dt><dd>{{ application.grade_level }}</dd></div>
                <div v-if="application.strand"><dt>Strand</dt><dd>{{ application.strand }}</dd></div>
                <div><dt>Student status</dt><dd>{{ applicantTypes[application.applicant_type] }}</dd></div>
                <div><dt>Mode of payment</dt><dd>{{ payments[application.mode_of_payment] ?? application.mode_of_payment }}</dd></div>
              </dl>
            </section>

            <section aria-labelledby="student-details">
              <h3 id="student-details">Student information</h3>
              <dl class="fields">
                <div><dt>Full name</dt><dd>{{ fullName }}</dd></div>
                <div><dt>Birthday</dt><dd>{{ birthDate(application.birth_date) }}</dd></div>
                <div><dt>Gender</dt><dd class="capitalize">{{ application.gender }}</dd></div>
                <div><dt>Place of birth</dt><dd>{{ application.place_of_birth }}</dd></div>
                <div><dt>Religion</dt><dd>{{ application.religion }}</dd></div>
                <div><dt>Contact number</dt><dd>{{ application.contact_numbers }}</dd></div>
                <div><dt>Email</dt><dd>{{ application.email }}</dd></div>
                <div><dt>Parent’s email address</dt><dd>{{ application.parent_email || "—" }}</dd></div>
                <div><dt>Parent/guardian’s Messenger account</dt><dd>{{ application.guardian_messenger }}</dd></div>
                <div class="wide"><dt>Complete address</dt><dd>{{ application.complete_address }}</dd></div>
              </dl>
            </section>

            <section aria-labelledby="family-details">
              <h3 id="family-details">Parents and guardian</h3>
              <p v-if="!application.guardians.length" class="muted">No parent or guardian details were submitted.</p>
              <dl v-else class="fields">
                <div v-for="guardian in application.guardians" :key="guardian.relationship">
                  <dt>{{ relationships[guardian.relationship] }}</dt>
                  <dd>
                    {{ guardian.full_name }}<br />
                    <span class="muted small">{{ guardian.occupation || "Occupation not given" }}, {{ guardian.contact_number || "no contact number" }}</span>
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="school-details">
              <h3 id="school-details">Last school attended</h3>
              <dl class="fields">
                <div><dt>Former school’s name</dt><dd>{{ application.last_school_name || "—" }}</dd></div>
                <div class="wide"><dt>Former school’s complete address</dt><dd>{{ application.last_school_address || "—" }}</dd></div>
              </dl>
            </section>

            <section aria-labelledby="documents-heading">
              <h3 id="documents-heading">Attached documents</h3>
              <p v-if="!application.documents.length" class="muted">
                No documents were uploaded. Online uploads are disabled; the applicant presents requirements at the Registrar’s Office.
              </p>
              <ul v-else class="documents">
                <li v-for="document in application.documents" :key="document.id">
                  {{ document.document_type }} <span class="muted">(uploaded {{ dateTime.format(new Date(document.uploaded_at)) }})</span>
                </li>
              </ul>
            </section>
          </div>

          <div class="detail-rail">
            <section class="rail-card" aria-labelledby="checklist-heading">
              <h3 id="checklist-heading">Requirement checklist</h3>
              <p class="muted small">
                {{ checklist.received }} of {{ checklist.required }} required items received for a
                {{ applicantTypes[application.applicant_type].toLowerCase() }} {{ application.grade_level }} applicant.
                Tick each requirement as it is presented onsite.
              </p>
              <p v-if="checklistError" class="error" role="alert">{{ checklistError }}</p>
              <ul class="checklist">
                <li v-for="item in requirements" :key="item.key">
                  <label :class="{ done: application.requirement_checks[item.key] === true }">
                    <input
                      type="checkbox"
                      :checked="application.requirement_checks[item.key] === true"
                      :disabled="checklistSaving === item.key"
                      @change="toggleRequirement(item.key, ($event.target as HTMLInputElement).checked)"
                    />
                    <span>{{ item.label }} <span v-if="item.optional" class="muted">(if applicable)</span></span>
                  </label>
                </li>
              </ul>
            </section>

            <section class="rail-card actions-card" aria-labelledby="status-heading">
              <h3 id="status-heading">Update status and remarks</h3>
              <p v-if="checklist.complete && application.status !== 'complete'" class="hint">
                All required items are received. You can mark this application Complete.
              </p>
              <label class="field">
                New status
                <select v-model="newStatus" :disabled="confirming || saving">
                  <option v-for="status in processingStatuses" :key="status" :value="status">{{ applicationStatuses[status] }}</option>
                </select>
              </label>
              <label class="field">
                Registrar remarks (shown in the email update, if you send one)
                <textarea
                  v-model="newRemarks"
                  rows="3"
                  maxlength="1000"
                  :disabled="confirming || saving"
                  placeholder="Which requirements are still missing"
                ></textarea>
              </label>
              <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
              <p v-if="saveNotice" class="success" role="status">{{ saveNotice }}</p>
              <p v-if="emailState === 'sent'" class="success" role="status">Status email sent to {{ application.email }}.</p>

              <div v-if="confirming" class="confirm" role="alertdialog" aria-labelledby="confirm-heading">
                <p id="confirm-heading">
                  Change the status from <strong>{{ applicationStatuses[application.status] }}</strong> to
                  <strong>{{ applicationStatuses[newStatus] }}</strong>? You can choose whether to email the applicant next.
                </p>
                <div class="row">
                  <button type="button" class="button-maroon" :disabled="saving" @click="confirmStatusUpdate">
                    {{ saving ? "Saving…" : "Confirm" }}
                  </button>
                  <button type="button" class="button-small" :disabled="saving" @click="confirming = false">Cancel</button>
                </div>
              </div>
              <div v-else class="row">
                <button type="button" class="button-maroon" :disabled="!statusChanged || saving" @click="askToConfirm">
                  Save status
                </button>
                <button v-if="!emailPrompt && application.status !== 'pending'" type="button" class="button-small" :disabled="statusChanged" @click="openEmailPrompt">
                  Email applicant an update
                </button>
              </div>
            </section>

            <section v-if="emailPrompt" class="rail-card email-card" role="alertdialog" aria-labelledby="email-heading">
              <h3 id="email-heading">Send a status update email?</h3>
              <p class="small">Review the message below. Nothing is sent until you confirm.</p>
              <div class="email-preview">
                <p><strong>To:</strong> {{ application.email }}</p>
                <p><strong>Subject:</strong> Enrollment Application Update - [{{ application.reference_no }}]</p>
                <p><strong>Status:</strong> {{ applicationStatuses[application.status] }}</p>
                <p v-if="application.registrar_remarks"><strong>Remarks:</strong> {{ application.registrar_remarks }}</p>
                <p><strong>Requirements still needed</strong> (bring to the Registrar's Office for onsite verification):</p>
                <ul v-if="emailChecklist.missing.length"><li v-for="item in emailChecklist.missing" :key="item.key">{{ item.label }}</li></ul>
                <p v-else class="muted">None. All required documents have been received.</p>
                <p><strong>Already received:</strong></p>
                <ul v-if="emailChecklist.received.length"><li v-for="item in emailChecklist.received" :key="item.key">{{ item.label }}</li></ul>
                <p v-else class="muted">None recorded yet.</p>
                <p class="muted">Includes the reference number, office hours and the Registrar's Office address.</p>
              </div>
              <p v-if="emailState === 'failed'" class="error" role="alert">The email could not be sent. Check the connection and try again.</p>
              <div class="row">
                <button type="button" class="button-maroon" :disabled="emailState === 'sending'" @click="confirmEmail">
                  {{ emailState === "sending" ? "Sending…" : "Confirm and send email" }}
                </button>
                <button type="button" class="button-small" :disabled="emailState === 'sending'" @click="emailPrompt = false">Don’t send</button>
              </div>
            </section>

            <section class="rail-card" aria-labelledby="print-heading">
              <h3 id="print-heading">Verification form</h3>
              <div class="row">
                <button type="button" class="button-gold" @click="printForm">Print A4 verification form</button>
                <button type="button" class="button-small" @click="openPrintableForm">Open printable form in new tab</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </aside>

    <!-- Print A4 Verification Form source: never shown; copied into a standalone A4 document. -->
    <div v-if="application" ref="printSource" class="print-source" aria-hidden="true">
      <header class="print-head">
        <h1>Sto. Niño Catholic School, Inc.</h1>
        <p>Office of the Registrar · Enrollment Verification Form</p>
        <p class="print-meta">
          <span>Reference no.: <strong>{{ application.reference_no }}</strong></span>
          <span>Status: {{ applicationStatuses[application.status] }}</span>
          <span>Printed: {{ dateTime.format(printedAt) }}</span>
        </p>
      </header>
      <h2>Enrollment details</h2>
      <table>
        <tr><th>School year</th><td>{{ application.school_year }}</td><th>School level</th><td>{{ departments[application.department] }}</td></tr>
        <tr><th>Grade level</th><td>{{ application.grade_level }}</td><th>Strand</th><td>{{ application.strand || "—" }}</td></tr>
        <tr><th>Student status</th><td>{{ applicantTypes[application.applicant_type] }}</td><th>Mode of payment</th><td>{{ payments[application.mode_of_payment] ?? application.mode_of_payment }}</td></tr>
        <tr><th>Submitted</th><td colspan="3">{{ dateTime.format(new Date(application.submitted_at)) }}</td></tr>
      </table>
      <h2>Student information</h2>
      <table>
        <tr><th>Full name</th><td colspan="3">{{ fullName }}</td></tr>
        <tr><th>Birthday</th><td>{{ birthDate(application.birth_date) }}</td><th>Gender</th><td class="capitalize">{{ application.gender }}</td></tr>
        <tr><th>Place of birth</th><td>{{ application.place_of_birth }}</td><th>Religion</th><td>{{ application.religion }}</td></tr>
        <tr><th>Contact number</th><td>{{ application.contact_numbers }}</td><th>Email</th><td>{{ application.email }}</td></tr>
        <tr><th>Parent’s email address</th><td>{{ application.parent_email || "—" }}</td><th>Messenger account</th><td>{{ application.guardian_messenger }}</td></tr>
        <tr><th>Address</th><td colspan="3">{{ application.complete_address }}</td></tr>
      </table>
      <h2>Parents and guardian</h2>
      <table class="guardians">
        <tr><th>Relationship</th><th>Name</th><th>Occupation</th><th>Contact</th></tr>
        <tr v-for="guardian in application.guardians" :key="guardian.relationship">
          <td>{{ relationships[guardian.relationship] }}</td><td>{{ guardian.full_name }}</td>
          <td>{{ guardian.occupation || "—" }}</td><td>{{ guardian.contact_number || "—" }}</td>
        </tr>
      </table>
      <h2>Last school attended</h2>
      <table>
        <tr><th>Former school</th><td>{{ application.last_school_name || "—" }}</td><th>Address</th><td>{{ application.last_school_address || "—" }}</td></tr>
      </table>
      <h2>Requirements ({{ checklist.received }} of {{ checklist.required }} required received)</h2>
      <ul class="print-checklist">
        <li v-for="item in requirements" :key="item.key">
          {{ application.requirement_checks[item.key] ? "☑" : "☐" }} {{ item.label }}<span v-if="item.optional"> (if applicable)</span>
        </li>
      </ul>
      <h2>Registrar remarks</h2>
      <p class="print-remarks">{{ application.registrar_remarks || "None" }}</p>
      <div class="print-signatures">
        <div><span></span>Verified by (Registrar’s signature over printed name)</div>
        <div><span></span>Date</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-layer {
  --pending: #8f5c00; --pending-bg: #fff1cc; --review: #1f4fa8; --review-bg: #e4ecfb;
  --complete: #17703d; --complete-bg: #dcf2e3; --incomplete: #a51d12; --incomplete-bg: #fde3df;
  position: fixed; inset: 0; z-index: 60;
}
.detail-layer :focus-visible { outline: 3px solid var(--gold-500); outline-offset: 2px; }
.detail-scrim { position: absolute; inset: 0; background: rgb(42 16 10 / 45%); animation: fade-in .2s ease-out; }
.detail-panel { position: absolute; top: 0; right: 0; bottom: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); width: min(1000px, 100%); background: var(--cream-50); box-shadow: -20px 0 50px rgb(40 10 5 / 25%); animation: slide-in .28s ease-out; }
.detail-panel:focus { outline: none; }
@keyframes slide-in { from { transform: translateX(100%); } }
@keyframes fade-in { from { opacity: 0; } }

.detail-header { display: grid; gap: .8rem; padding: 1.1rem 1.5rem 1rem; border-top: 5px solid var(--red-900); border-bottom: 1px solid var(--line); background: var(--white); }
.detail-top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: .8rem 1rem; }
.detail-title { min-width: 0; }
.detail-title h2 { margin: 0; font-size: clamp(1.4rem, 3vw, 1.75rem); font-weight: 800; letter-spacing: -.03em; line-height: 1.15; overflow-wrap: anywhere; }
.detail-title p { margin: .2rem 0 0; color: var(--muted); line-height: 1.45; }
.detail-ref { color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.detail-nav { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
.close { min-width: 40px; }
.progress { display: grid; gap: .35rem; }
.progress-label { display: flex; justify-content: space-between; font-size: .88rem; font-weight: 700; }
.progress-track { height: 8px; overflow: hidden; border-radius: 99px; background: var(--line); }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--gold-500); transition: width .3s ease; }
.progress-track span.full { background: var(--complete); }

.detail-scroll { overflow-y: auto; overscroll-behavior: contain; }
.state { display: grid; justify-items: start; gap: .7rem; margin: 0; padding: 2rem 1.5rem; }
.state p { margin: 0; }
.detail-body { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(300px, 1fr); align-items: start; gap: 1.5rem; padding: 1.5rem; }
.detail-info section { margin-bottom: 1.2rem; padding-bottom: 1.2rem; border-bottom: 1px solid var(--line); }
.detail-info section:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; }
h3 { margin: 0 0 .7rem; color: var(--red-900); font-size: 1.02rem; letter-spacing: -.01em; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .7rem 1.2rem; margin: 0; }
.fields .wide { grid-column: 1 / -1; }
dt { color: var(--muted); font-size: .8rem; font-weight: 700; }
dd { margin: .1rem 0 0; overflow-wrap: anywhere; }
.capitalize { text-transform: capitalize; }
.muted { color: var(--muted); }
.small { margin: 0; font-size: .88rem; }
.documents { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }

.detail-rail { position: sticky; top: 0; display: grid; gap: 1rem; }
.rail-card { display: grid; gap: .7rem; padding: 1rem 1.1rem; border: 1px solid var(--line); border-radius: 10px; background: var(--white); }
.rail-card h3 { margin: 0; color: var(--ink); }
.checklist { display: grid; gap: .1rem; margin: 0; padding: 0; list-style: none; }
.checklist label { display: flex; align-items: flex-start; gap: .6rem; padding: .45rem .5rem; border-radius: 6px; cursor: pointer; }
.checklist label:hover { background: var(--cream-100); }
.checklist label.done > span { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--gold-500); }
.checklist input { flex: none; width: 1.15rem; height: 1.15rem; margin-top: .2rem; accent-color: var(--red-900); }
.field { display: grid; gap: .35rem; font-size: .9rem; font-weight: 700; }
.field select, .field textarea { width: 100%; padding: .55rem .7rem; border: 1px solid var(--line); border-radius: 6px; background: var(--white); color: var(--ink); font: inherit; font-weight: 400; }
.confirm { display: grid; gap: .7rem; padding: 1rem; border: 1px solid var(--gold-500); border-radius: 8px; background: var(--cream-100); }
.confirm p { margin: 0; }
.email-card { border-color: var(--gold-500); background: var(--cream-100); }
.email-preview { padding: .9rem 1rem; border: 1px solid var(--line); border-radius: 6px; background: var(--white); font-size: .92rem; }
.email-preview p { margin: .3rem 0; }
.email-preview ul { margin: .2rem 0 .6rem; padding-left: 1.2rem; }
.hint { margin: 0; color: var(--complete); font-weight: 700; }
.error { margin: 0; color: var(--red-700); font-weight: 700; }
.success { margin: 0; color: var(--complete); font-weight: 700; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.status-badge { display: inline-flex; align-items: center; gap: .4rem; padding: .25rem .7rem; border-radius: 999px; font-size: .85rem; font-weight: 700; white-space: nowrap; }
.status-badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.status-badge.pending { background: var(--pending-bg); color: var(--pending); }
.status-badge.for_review { background: var(--review-bg); color: var(--review); }
.status-badge.complete { background: var(--complete-bg); color: var(--complete); }
.status-badge.incomplete { background: var(--incomplete-bg); color: var(--incomplete); }
.button-small { min-height: 40px; padding: .45rem .85rem; border: 1px solid var(--line); border-radius: 6px; background: var(--white); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer; }
.button-small:hover:not(:disabled) { border-color: #d9c8b6; background: var(--cream-50); }
.button-maroon, .button-gold { min-height: 42px; padding: .55rem 1.1rem; border: 0; border-radius: 6px; font: inherit; font-weight: 700; cursor: pointer; }
.button-maroon { background: var(--red-900); color: var(--white); }
.button-maroon:hover:not(:disabled) { background: var(--red-700); }
.button-gold { background: var(--gold-500); color: var(--red-950); font-weight: 800; }
.button-gold:hover { background: var(--gold-300); }
.button-small:disabled, .button-maroon:disabled { opacity: .5; cursor: not-allowed; }
.print-source { display: none; }

@media (max-width: 860px) {
  .detail-body { grid-template-columns: 1fr; padding: 1rem; }
  .detail-rail { position: static; }
  .detail-header { padding: 1rem; }
}
@media (prefers-reduced-motion: reduce) {
  .detail-panel, .detail-scrim { animation: none; }
  .progress-track span { transition: none; }
}
</style>
