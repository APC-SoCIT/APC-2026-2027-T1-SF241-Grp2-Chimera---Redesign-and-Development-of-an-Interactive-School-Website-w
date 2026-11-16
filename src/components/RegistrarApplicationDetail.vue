<!--
  Author: Gian Mandac
  Created Date: 20261116
  Review Application Details & Documents, View Dynamic Requirement Checklist,
  Update Application Status & Registrar Remarks, Trigger Outbound Status Email (only after
  the Registrar previews and confirms it) and Print A4 Verification Form, following the
  Manage Enrollment Application use case.
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
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

const departments = { preschool: "Preschool", grade_school: "Grade School", jhs: "Junior High School", shs: "Senior High School" } as const;
const applicantTypes = { new: "New", old: "Old (returning)", returnee: "Returnee / transferee" } as const;
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
  <div class="detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="application-detail-heading" @keydown.esc="emit('close')">
    <div class="detail-card">
      <header class="detail-header">
        <div>
          <p class="eyebrow-small">Review application</p>
          <h3 id="application-detail-heading"><code>{{ reference }}</code></h3>
        </div>
        <div class="detail-nav">
          <button type="button" class="button-small" :disabled="!hasPrevious || loading" @click="emit('previous')">← Previous</button>
          <button type="button" class="button-small" :disabled="!hasNext || loading" @click="emit('next')">Next →</button>
          <button type="button" class="button-small" aria-label="Close application" @click="emit('close')">✕</button>
        </div>
      </header>

      <p v-if="loading" class="state">Loading application…</p>
      <div v-else-if="notFound" class="state" role="alert">
        <p>Application not found. It may have been removed, or the reference number is wrong.</p>
        <button type="button" class="button button-secondary" @click="emit('close')">Back to the list</button>
      </div>
      <div v-else-if="loadError" class="state" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" class="button button-secondary" @click="load">Try again</button>
      </div>

      <div v-else-if="application" class="detail-body">
        <p class="status-line">
          Status: <span :class="['status-badge', application.status]">{{ applicationStatuses[application.status] }}</span>
          · Submitted {{ dateTime.format(new Date(application.submitted_at)) }}
        </p>

        <section aria-labelledby="enrollment-details">
          <h4 id="enrollment-details">Enrollment details</h4>
          <dl class="fields">
            <div><dt>School year</dt><dd>{{ application.school_year }}</dd></div>
            <div><dt>Department</dt><dd>{{ departments[application.department] }}</dd></div>
            <div><dt>Grade level</dt><dd>{{ application.grade_level }}</dd></div>
            <div v-if="application.strand"><dt>Strand</dt><dd>{{ application.strand }}</dd></div>
            <div><dt>Applicant type</dt><dd>{{ applicantTypes[application.applicant_type] }}</dd></div>
            <div><dt>Mode of payment</dt><dd>{{ payments[application.mode_of_payment] ?? application.mode_of_payment }}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="student-details">
          <h4 id="student-details">Student information</h4>
          <dl class="fields">
            <div><dt>Full name</dt><dd>{{ fullName }}</dd></div>
            <div><dt>Birth date</dt><dd>{{ birthDate(application.birth_date) }}</dd></div>
            <div><dt>Gender</dt><dd class="capitalize">{{ application.gender }}</dd></div>
            <div><dt>Place of birth</dt><dd>{{ application.place_of_birth }}</dd></div>
            <div><dt>Religion</dt><dd>{{ application.religion }}</dd></div>
            <div><dt>Contact numbers</dt><dd>{{ application.contact_numbers }}</dd></div>
            <div><dt>Email</dt><dd>{{ application.email }}</dd></div>
            <div><dt>Parent email</dt><dd>{{ application.parent_email || "—" }}</dd></div>
            <div><dt>Guardian Messenger</dt><dd>{{ application.guardian_messenger }}</dd></div>
            <div class="wide"><dt>Complete address</dt><dd>{{ application.complete_address }}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="family-details">
          <h4 id="family-details">Parents and guardian</h4>
          <p v-if="!application.guardians.length" class="muted">No parent or guardian details were submitted.</p>
          <dl v-else class="fields">
            <div v-for="guardian in application.guardians" :key="guardian.relationship">
              <dt>{{ relationships[guardian.relationship] }}</dt>
              <dd>
                {{ guardian.full_name }}<br />
                <span class="muted">{{ guardian.occupation || "Occupation not given" }} · {{ guardian.contact_number || "No contact number" }}</span>
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="school-details">
          <h4 id="school-details">Last school attended</h4>
          <dl class="fields">
            <div><dt>School</dt><dd>{{ application.last_school_name || "—" }}</dd></div>
            <div class="wide"><dt>Address</dt><dd>{{ application.last_school_address || "—" }}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="documents-heading">
          <h4 id="documents-heading">Attached documents</h4>
          <p v-if="!application.documents.length" class="muted">
            No documents were uploaded. Online uploads are disabled; the applicant presents requirements at the Registrar’s Office.
          </p>
          <ul v-else class="documents">
            <li v-for="document in application.documents" :key="document.id">
              {{ document.document_type }} <span class="muted">· uploaded {{ dateTime.format(new Date(document.uploaded_at)) }}</span>
            </li>
          </ul>
        </section>

        <section aria-labelledby="checklist-heading">
          <h4 id="checklist-heading">Requirement checklist</h4>
          <p class="muted">
            {{ checklist.received }} of {{ checklist.required }} required items received for a
            {{ applicantTypes[application.applicant_type].toLowerCase() }} {{ application.grade_level }} applicant.
            Tick each requirement as it is presented onsite.
          </p>
          <p v-if="checklistError" class="error" role="alert">{{ checklistError }}</p>
          <ul class="checklist">
            <li v-for="item in requirements" :key="item.key">
              <label>
                <input
                  type="checkbox"
                  :checked="application.requirement_checks[item.key] === true"
                  :disabled="checklistSaving === item.key"
                  @change="toggleRequirement(item.key, ($event.target as HTMLInputElement).checked)"
                />
                {{ item.label }} <span v-if="item.optional" class="muted">(if applicable)</span>
              </label>
            </li>
          </ul>
        </section>

        <section class="actions-card" aria-labelledby="status-heading">
          <h4 id="status-heading">Update status and remarks</h4>
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
              placeholder="For example, which requirements are still missing"
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
              <button type="button" class="button button-secondary" :disabled="saving" @click="confirmStatusUpdate">
                {{ saving ? "Saving…" : "Confirm" }}
              </button>
              <button type="button" class="button-small" :disabled="saving" @click="confirming = false">Cancel</button>
            </div>
          </div>
          <div v-else class="row">
            <button type="button" class="button button-secondary" :disabled="!statusChanged || saving" @click="askToConfirm">
              Save status
            </button>
            <button v-if="!emailPrompt && application.status !== 'pending'" type="button" class="button-small" :disabled="statusChanged" @click="openEmailPrompt">
              Email applicant an update
            </button>
          </div>
        </section>

        <section v-if="emailPrompt" class="email-card" role="alertdialog" aria-labelledby="email-heading">
          <h4 id="email-heading">Send a status update email?</h4>
          <p>Review the message below. Nothing is sent until you confirm.</p>
          <div class="email-preview">
            <p><strong>To:</strong> {{ application.email }}</p>
            <p><strong>Subject:</strong> Enrollment Application Update - [{{ application.reference_no }}]</p>
            <p><strong>Status:</strong> {{ applicationStatuses[application.status] }}</p>
            <p v-if="application.registrar_remarks"><strong>Remarks:</strong> {{ application.registrar_remarks }}</p>
            <p><strong>Requirements received:</strong></p>
            <ul v-if="emailChecklist.received.length"><li v-for="item in emailChecklist.received" :key="item.key">{{ item.label }}</li></ul>
            <p v-else class="muted">None recorded yet.</p>
            <p><strong>Requirements still needed:</strong></p>
            <ul v-if="emailChecklist.missing.length"><li v-for="item in emailChecklist.missing" :key="item.key">{{ item.label }}</li></ul>
            <p v-else class="muted">None. All required documents have been received.</p>
          </div>
          <p v-if="emailState === 'failed'" class="error" role="alert">The email could not be sent. Check the connection and try again.</p>
          <div class="row">
            <button type="button" class="button button-secondary" :disabled="emailState === 'sending'" @click="confirmEmail">
              {{ emailState === "sending" ? "Sending…" : "Confirm and send email" }}
            </button>
            <button type="button" class="button-small" :disabled="emailState === 'sending'" @click="emailPrompt = false">Don’t send</button>
          </div>
        </section>

        <footer class="detail-footer">
          <div class="row">
            <button type="button" class="button button-primary" @click="printForm">Print A4 verification form</button>
            <button type="button" class="button-small" @click="openPrintableForm">Open printable form in new tab</button>
          </div>
          <button type="button" class="button-small" @click="emit('close')">Close</button>
        </footer>
      </div>
    </div>

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
        <tr><th>School year</th><td>{{ application.school_year }}</td><th>Department</th><td>{{ departments[application.department] }}</td></tr>
        <tr><th>Grade level</th><td>{{ application.grade_level }}</td><th>Strand</th><td>{{ application.strand || "—" }}</td></tr>
        <tr><th>Applicant type</th><td>{{ applicantTypes[application.applicant_type] }}</td><th>Mode of payment</th><td>{{ payments[application.mode_of_payment] ?? application.mode_of_payment }}</td></tr>
        <tr><th>Submitted</th><td colspan="3">{{ dateTime.format(new Date(application.submitted_at)) }}</td></tr>
      </table>
      <h2>Student information</h2>
      <table>
        <tr><th>Full name</th><td colspan="3">{{ fullName }}</td></tr>
        <tr><th>Birth date</th><td>{{ birthDate(application.birth_date) }}</td><th>Gender</th><td class="capitalize">{{ application.gender }}</td></tr>
        <tr><th>Place of birth</th><td>{{ application.place_of_birth }}</td><th>Religion</th><td>{{ application.religion }}</td></tr>
        <tr><th>Contact numbers</th><td>{{ application.contact_numbers }}</td><th>Email</th><td>{{ application.email }}</td></tr>
        <tr><th>Parent email</th><td>{{ application.parent_email || "—" }}</td><th>Guardian Messenger</th><td>{{ application.guardian_messenger }}</td></tr>
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
        <tr><th>School</th><td>{{ application.last_school_name || "—" }}</td><th>Address</th><td>{{ application.last_school_address || "—" }}</td></tr>
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
.detail-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: start center; overflow-y: auto; padding: 2rem 1rem; background: rgb(42 33 31 / 55%); }
.detail-card { width: min(920px, 100%); background: var(--white); border-radius: 8px; box-shadow: var(--shadow); }
.detail-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.2rem 1.5rem; border-bottom: 1px solid var(--line); }
.detail-header h3 { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
.eyebrow-small { margin: 0; color: var(--red-700); font-size: .75rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.detail-nav, .row, .detail-footer { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.detail-body { display: grid; gap: 1.6rem; padding: 1.5rem; }
.detail-footer { justify-content: space-between; padding-top: 1rem; border-top: 1px solid var(--line); }
.state { padding: 2rem 1.5rem; }
h4 { margin: 0 0 .6rem; color: var(--red-900); font-size: 1.05rem; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .8rem 1.4rem; margin: 0; }
.fields .wide { grid-column: 1 / -1; }
dt { color: var(--muted); font-size: .8rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
dd { margin: .15rem 0 0; overflow-wrap: anywhere; }
.capitalize { text-transform: capitalize; }
.muted { color: var(--muted); }
.status-line { margin: 0; }
.status-badge { display: inline-block; padding: .15rem .6rem; border-radius: 999px; background: var(--cream-100); font-weight: 800; font-size: .85rem; }
.status-badge.pending { background: #fff3cd; color: #7a5a00; }
.status-badge.for_review { background: #e3ecff; color: #1f3f8f; }
.status-badge.complete { background: #dcf3e3; color: #1d6b38; }
.status-badge.incomplete { background: #fde2df; color: var(--red-800); }
.checklist, .documents { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
.checklist label { display: flex; gap: .6rem; align-items: flex-start; cursor: pointer; }
.checklist input { width: 1.15rem; height: 1.15rem; margin-top: .2rem; accent-color: var(--red-700); }
.actions-card { display: grid; gap: .8rem; padding: 1.2rem; border: 1px solid var(--line); border-radius: 6px; background: var(--cream-50); }
.field { display: grid; gap: .35rem; font-weight: 700; }
.field select, .field textarea { font: inherit; font-weight: 400; padding: .6rem .7rem; border: 1px solid var(--line); border-radius: 4px; background: var(--white); }
.confirm { display: grid; gap: .7rem; padding: 1rem; border: 1px solid var(--gold-500); border-radius: 6px; background: var(--cream-100); }
.confirm p { margin: 0; }
.email-card { display: grid; gap: .7rem; padding: 1.2rem; border: 1px solid var(--gold-500); border-radius: 6px; background: var(--cream-100); }
.email-card > p { margin: 0; }
.email-preview { padding: 1rem; border: 1px solid var(--line); border-radius: 4px; background: var(--white); }
.email-preview p { margin: .3rem 0; }
.email-preview ul { margin: .2rem 0 .6rem; padding-left: 1.2rem; }
.hint { margin: 0; color: #1d6b38; font-weight: 700; }
.error { margin: 0; color: var(--red-700); font-weight: 700; }
.success { margin: 0; color: #1d6b38; font-weight: 700; }
.button-small { min-height: 40px; padding: .45rem .85rem; border: 1px solid var(--line); border-radius: 4px; background: var(--white); color: var(--ink); font-weight: 700; cursor: pointer; }
.button-small:disabled, .button:disabled { opacity: .5; cursor: not-allowed; }
.print-source { display: none; }
</style>

