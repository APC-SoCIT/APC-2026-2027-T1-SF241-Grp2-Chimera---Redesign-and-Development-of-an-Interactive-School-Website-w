<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261114
  Modified: Gian Mandac
-->
<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { getStaffSupabaseClient } from "@/lib/supabase";

type ApplicationSummary = {
  reference_no: string;
  first_name: string;
  surname: string;
  email: string;
  status: string;
  submitted_at: string;
};

type ApplicationDetail = ApplicationSummary & {
  middle_name?: string;
  grade_level: string;
  strand?: string;
  applicant_type: string;
  complete_address: string;
  contact_numbers: string;
  parent_email: string;
  registrar_remarks?: string;
  id: number;
};

const pageSize = 25;
const offset = ref(0);
const hasMore = ref(false);
const applications = ref<ApplicationSummary[]>([]);
const loading = ref(true);
const loadError = ref("");

// Search & Filter State
const searchQuery = ref("");
const statusFilter = ref("all");

// Detail Modal State
const selectedApp = ref<ApplicationDetail | null>(null);
const loadingDetail = ref(false);
const updating = ref(false);
const updateSuccess = ref(false);
const updateError = ref("");
const newStatus = ref("");
const newRemarks = ref("");

// Email Confirmation Flow State
const pendingEmailConfirmation = ref(false);
const sendingEmail = ref(false);
const emailSendSuccess = ref(false);
const emailSendError = ref("");

// Dynamic Document Tracking State
const applicantDocuments = ref<{ document_type: string }[]>([]);

const submissionDate = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

// Load Applications directly from table with filters & pagination
async function loadApplications(nextOffset = offset.value) {
  loading.value = true;
  loadError.value = "";
  try {
    const supabase = getStaffSupabaseClient();
    let query = supabase
      .from("enrollment_applications")
      .select("id, reference_no, first_name, surname, email, status, submitted_at")
      .order("submitted_at", { ascending: false })
      .range(nextOffset, nextOffset + pageSize);

    if (statusFilter.value !== "all") {
      query = query.eq("status", statusFilter.value);
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim();
      query = query.or(`reference_no.ilike.%${q}%,first_name.ilike.%${q}%,surname.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data as ApplicationSummary[]) || [];
    applications.value = rows.slice(0, pageSize);
    hasMore.value = rows.length > pageSize;
    offset.value = nextOffset;
  } catch {
    loadError.value = "Could not load applications. Check your Registrar access and try again.";
  } finally {
    loading.value = false;
  }
}

// Watch filters to reload list dynamically
watch([statusFilter, searchQuery], () => {
  offset.value = 0;
  void loadApplications(0);
});

// Open Application Detail & Fetch Uploaded Documents
async function openApplicationDetail(refNo: string) {
  loadingDetail.value = true;
  updateSuccess.value = false;
  updateError.value = "";
  pendingEmailConfirmation.value = false;
  emailSendSuccess.value = false;
  emailSendError.value = "";
  applicantDocuments.value = [];

  try {
    const supabase = getStaffSupabaseClient();
    
    // 1. Fetch application details
    const { data: appData, error: appError } = await supabase
      .from("enrollment_applications")
      .select("*")
      .eq("reference_no", refNo)
      .single();

    if (appError) throw appError;
    selectedApp.value = appData as ApplicationDetail;
    newStatus.value = appData.status;
    newRemarks.value = appData.registrar_remarks || "";

    // 2. Fetch matching documents from application_documents table
    const { data: docData, error: docError } = await supabase
      .from("application_documents")
      .select("document_type")
      .eq("application_id", appData.id);

    if (!docError && docData) {
      applicantDocuments.value = docData;
    }
  } catch (err) {
    console.error("Error loading application details:", err);
    alert("Failed to load application details.");
  } finally {
    loadingDetail.value = false;
  }
}

// Step 1: Save Status & Remarks to Database First with RLS Check (.select())
async function saveApplicationUpdates() {
  if (!selectedApp.value) return;
  updating.value = true;
  updateSuccess.value = false;
  updateError.value = "";
  pendingEmailConfirmation.value = false;
  emailSendSuccess.value = false;
  emailSendError.value = "";

  try {
    const supabase = getStaffSupabaseClient();
    
    // Update status & remarks in database with .select() to verify write success
    const { data, error } = await supabase
      .from("enrollment_applications")
      .update({
        status: newStatus.value,
        registrar_remarks: newRemarks.value,
      })
      .eq("reference_no", selectedApp.value.reference_no)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error("Update blocked by database RLS policy. Please check table policies.");
    }

    // Update local state & refresh table
    selectedApp.value.status = newStatus.value;
    selectedApp.value.registrar_remarks = newRemarks.value;
    updateSuccess.value = true;
    await loadApplications(offset.value);

    // Prompt registrar to confirm sending email
    pendingEmailConfirmation.value = true;
  } catch (err: any) {
    console.error("Update failed:", err);
    updateError.value = `Failed to update: ${err.message || "Please check database permissions."}`;
  } finally {
    updating.value = false;
  }
}

// Step 2: Confirm and Send Email via Edge Function
async function confirmAndSendEmail() {
  if (!selectedApp.value) return;
  sendingEmail.value = true;
  emailSendError.value = "";
  emailSendSuccess.value = false;

  try {
    const supabase = getStaffSupabaseClient();
    
    const { error: emailErr } = await supabase.functions.invoke('send-application-status-email', {
      body: {
        reference_no: selectedApp.value.reference_no,
        email: selectedApp.value.email,
        status: newStatus.value,
        remarks: newRemarks.value
      }
    });

    if (emailErr) throw emailErr;

    emailSendSuccess.value = true;
    setTimeout(() => {
      pendingEmailConfirmation.value = false;
    }, 2500);
  } catch (err: any) {
    console.error("Email dispatch failed:", err);
    
    let detailedMsg = err.message || "Unknown error";
    try {
      if (err.context && typeof err.context.json === 'function') {
        const errBody = await err.context.json();
        detailedMsg = errBody.error || errBody.message || JSON.stringify(errBody);
      }
    } catch (parseErr) {
      // ignore parsing failure
    }

    emailSendError.value = `Failed to send email: ${detailedMsg}`;
  } finally {
    sendingEmail.value = false;
  }
}

// Step 3: Skip Email Dispatch
function skipEmailConfirmation() {
  pendingEmailConfirmation.value = false;
}

// Print A4 Verification Form
function printForm() {
  const originalTitle = document.title;
  document.title = "";
  window.print();
  setTimeout(() => {
    document.title = originalTitle;
  }, 1000);
}

onMounted(() => void loadApplications());
</script>

<template>
  <section class="registrar-container print-hide" aria-labelledby="registrar-applications-heading">
    <!-- Header Card -->
    <div class="panel-header-card">
      <div>
        <span class="badge-subtitle">Registrar Portal</span>
        <h2 id="registrar-applications-heading" class="section-title">Enrollment Applications</h2>
        <p class="section-desc">Manage, review, and process incoming student enrollment requests.</p>
      </div>
    </div>

    <!-- Search & Filter Bar Card -->
    <div class="filter-card">
      <div class="search-wrapper">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="search"
          v-model="searchQuery"
          placeholder="Search by reference no, applicant name, or email…"
          class="search-input"
          aria-label="Search applications"
        />
      </div>
      <select v-model="statusFilter" class="status-select" aria-label="Filter by status">
        <option value="all">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="for_review">For Review</option>
        <option value="complete">Complete</option>
        <option value="incomplete">Incomplete</option>
      </select>
    </div>

    <!-- Content Area -->
    <div class="table-container-card">
      <div v-if="loading" class="state-box">
        <div class="spinner"></div>
        <p>Loading applications…</p>
      </div>
      <template v-else-if="loadError">
        <div class="state-box error-box">
          <p role="alert">{{ loadError }}</p>
          <button type="button" class="btn-primary" @click="loadApplications()">Try again</button>
        </div>
      </template>
      <template v-else>
        <div v-if="!applications.length" class="state-box">
          <p>No enrollment applications found matching your criteria.</p>
        </div>
        <div v-else class="table-responsive">
          <table aria-label="Enrollment application summaries">
            <thead>
              <tr>
                <th scope="col">Reference Number</th>
                <th scope="col">Applicant Name</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted (PHT)</th>
                <th scope="col" class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="app in applications" :key="app.reference_no" class="table-row">
                <th scope="row">
                  <button class="ref-link" @click="openApplicationDetail(app.reference_no)">
                    {{ app.reference_no }}
                  </button>
                </th>
                <td class="applicant-name">{{ app.first_name }} {{ app.surname }}</td>
                <td>
                  <span :class="['status-badge', app.status]">
                    {{ app.status.replaceAll("_", " ") }}
                  </span>
                </td>
                <td class="timestamp">
                  <time :datetime="app.submitted_at">
                    {{ submissionDate.format(new Date(app.submitted_at)) }}
                  </time>
                </td>
                <td class="text-right">
                  <button class="btn-review" @click="openApplicationDetail(app.reference_no)">
                    Review
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Pagination Footer -->
        <div class="pagination-footer" v-if="offset > 0 || hasMore">
          <button v-if="offset" type="button" class="btn-secondary" @click="loadApplications(offset - pageSize)">
            ← Previous
          </button>
          <span class="page-indicator">Showing batch starting at offset {{ offset }}</span>
          <button v-if="hasMore" type="button" class="btn-secondary" @click="loadApplications(offset + pageSize)">
            Next →
          </button>
        </div>
      </template>
    </div>
  </section>

  <!-- Application Review Modal -->
  <div v-if="selectedApp" class="modal-backdrop print-hide-backdrop" role="dialog" aria-modal="true">
    <div class="modal-content printable-area">
      <div class="modal-header print-hide">
        <div class="modal-title-group">
          <span class="badge-subtitle">Application File</span>
          <h3><code>{{ selectedApp.reference_no }}</code></h3>
        </div>
        <button class="close-btn" @click="selectedApp = null" aria-label="Close modal">✕</button>
      </div>

      <div v-if="loadingDetail" class="state-box">
        <div class="spinner"></div>
        <p>Loading full application details…</p>
      </div>
      
      <div v-else class="modal-body">
        <!-- Professional Print Header (Visually Appealing Soft Copy) -->
        <div class="print-header">
          <div class="print-brand-header">
            <h2>Sto. Niño Catholic School, Inc.</h2>
            <p class="print-sub-address">Taguig City, Metro Manila • Office of the Registrar</p>
            <div class="print-doc-badge">Official Enrollment Verification Form</div>
          </div>
          <div class="print-ref-meta">
            <span><strong>Ref No:</strong> {{ selectedApp.reference_no }}</span>
            <span><strong>Date Generated:</strong> {{ new Date().toLocaleDateString() }}</span>
          </div>
          <hr class="print-divider" />
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Full Name</span>
            <span class="detail-val">{{ selectedApp.first_name }} {{ selectedApp.middle_name || '' }} {{ selectedApp.surname }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Grade Level</span>
            <span class="detail-val">{{ selectedApp.grade_level.toLowerCase().startsWith('grade') ? selectedApp.grade_level : 'Grade ' + selectedApp.grade_level }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Strand / Track</span>
            <span class="detail-val">{{ selectedApp.strand || 'N/A' }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Applicant Type</span>
            <span class="detail-val">{{ selectedApp.applicant_type }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Email Address</span>
            <span class="detail-val">{{ selectedApp.email }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Contact Number</span>
            <span class="detail-val">{{ selectedApp.contact_numbers }}</span>
          </div>
          <div class="detail-item full-width">
            <span class="detail-label">Complete Address</span>
            <span class="detail-val">{{ selectedApp.complete_address }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Parent / Guardian Email</span>
            <span class="detail-val">{{ selectedApp.parent_email }}</span>
          </div>
          <div class="detail-item" v-if="selectedApp.registrar_remarks">
            <span class="detail-label">Registrar Remarks</span>
            <span class="detail-val">{{ selectedApp.registrar_remarks }}</span>
          </div>
        </div>

        <!-- Dynamic Requirement Checklist -->
        <div class="section-card-inner">
          <h4>Requirement Checklist</h4>
          <ul class="checklist">
            <li>
              <span :class="['check-box', applicantDocuments.some(d => d.document_type.toLowerCase().includes('form 138') || d.document_type.toLowerCase().includes('report card')) ? 'checked-yes' : 'checked-no']">
                {{ applicantDocuments.some(d => d.document_type.toLowerCase().includes('form 138') || d.document_type.toLowerCase().includes('report card')) ? '✓' : '✕' }}
              </span> 
              Form 138 (Report Card)
            </li>
            <li>
              <span :class="['check-box', applicantDocuments.some(d => d.document_type.toLowerCase().includes('birth') || d.document_type.toLowerCase().includes('psa')) ? 'checked-yes' : 'checked-no']">
                {{ applicantDocuments.some(d => d.document_type.toLowerCase().includes('birth') || d.document_type.toLowerCase().includes('psa')) ? '✓' : '✕' }}
              </span> 
              Birth Certificate (PSA)
            </li>
            <li>
              <span :class="['check-box', applicantDocuments.some(d => d.document_type.toLowerCase().includes('good moral')) ? 'checked-yes' : 'checked-no']">
                {{ applicantDocuments.some(d => d.document_type.toLowerCase().includes('good moral')) ? '✓' : '✕' }}
              </span> 
              Good Moral Certificate
            </li>
          </ul>
        </div>

        <!-- Print Signature Block -->
        <div class="print-signature-block">
          <div class="sig-line"></div>
          <p class="sig-label">Verified & Approved by Registrar</p>
        </div>

        <!-- Status & Remarks Update Form -->
        <div class="section-card-inner print-hide">
          <h4>Review Actions & Status Update</h4>
          <p v-if="updateSuccess && !pendingEmailConfirmation" class="success-msg">Application successfully updated in database!</p>
          <p v-if="updateError" class="error-text">{{ updateError }}</p>

          <label class="form-label">
            Application Status
            <select v-model="newStatus" class="form-select" :disabled="pendingEmailConfirmation">
              <option value="pending">Pending</option>
              <option value="for_review">For Review</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
            </select>
          </label>

          <label class="form-label">
            Registrar Remarks / Notes
            <textarea v-model="newRemarks" rows="3" placeholder="Enter notes or feedback for this applicant…" :disabled="pendingEmailConfirmation"></textarea>
          </label>

          <!-- Save Button -->
          <div class="action-buttons" v-if="!pendingEmailConfirmation">
            <button type="button" class="btn-primary" :disabled="updating" @click="saveApplicationUpdates">
              {{ updating ? "Saving Changes…" : "Save Status & Remarks" }}
            </button>
          </div>

          <!-- Email Confirmation Prompt (Appears after successful save) -->
          <div v-if="pendingEmailConfirmation" class="email-confirmation-prompt">
            <h5>📧 Send Email Notification to Applicant?</h5>
            <p>Changes saved successfully. Would you like to send an automated status update email to <strong>{{ selectedApp.email }}</strong>?</p>
            
            <p v-if="emailSendSuccess" class="success-msg">Email sent successfully!</p>
            <p v-if="emailSendError" class="error-text">{{ emailSendError }}</p>

            <div class="action-buttons-group">
              <button type="button" class="btn-secondary" :disabled="sendingEmail" @click="skipEmailConfirmation">
                Skip / Close
              </button>
              <button type="button" class="btn-primary" :disabled="sendingEmail" @click="confirmAndSendEmail">
                {{ sendingEmail ? "Sending Email…" : "Yes, Send Email Now" }}
              </button>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer print-hide">
          <button type="button" class="btn-secondary" @click="printForm">
            🖨️ Print A4 Verification Form
          </button>
          <button type="button" class="btn-primary-outline" @click="selectedApp = null">
            Close Window
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:root {
  --primary-red: #990000;
  --primary-red-hover: #7a0000;
  --primary-red-light: #fdf2f2;
  --primary-red-border: #f8d7d7;
}

.registrar-container {
  margin-top: 2rem;
  font-family: inherit;
}

/* Header Card */
.panel-header-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-left: 5px solid #990000;
  padding: 1.5rem 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(153, 0, 0, 0.03);
  margin-bottom: 1.5rem;
}

.badge-subtitle {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: #990000;
  background: #fdf2f2;
  padding: 0.25rem 0.6rem;
  border-radius: 20px;
  display: inline-block;
  margin-bottom: 0.5rem;
}

.section-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
}

.section-desc {
  color: #64748b;
  font-size: 0.95rem;
  margin-top: 0.25rem;
}

/* Filter Card Bar */
.filter-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.02);
  flex-wrap: wrap;
  align-items: center;
}

.search-wrapper {
  position: relative;
  flex: 1;
  min-width: 280px;
}

.search-icon {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: #94a3b8;
}

.search-input {
  width: 100%;
  padding: 0.7rem 1rem 0.7rem 2.6rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.95rem;
  background: #f8fafc;
  transition: all 0.2s;
}

.search-input:focus, .status-select:focus, .form-select:focus, textarea:focus {
  outline: none;
  border-color: #990000;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(153, 0, 0, 0.08);
}

.status-select {
  padding: 0.7rem 1rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 0.95rem;
  font-weight: 500;
  color: #334155;
  cursor: pointer;
}

/* Table Card */
.table-container-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.03);
  overflow: hidden;
}

.table-responsive {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

th {
  background: #faf5f5;
  color: #990000;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1rem 1.25rem;
  border-bottom: 2px solid #f3e8e8;
}

td {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
  font-size: 0.95rem;
}

.table-row {
  transition: background-color 0.15s;
}

.table-row:hover {
  background-color: #fcf8f8;
}

.applicant-name {
  font-weight: 600;
  color: #0f172a;
}

.timestamp {
  color: #64748b;
  font-size: 0.9rem;
}

.text-right {
  text-align: right;
}

.ref-link {
  background: none;
  border: none;
  color: #990000;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.95rem;
  padding: 0;
  font-family: monospace;
}

.ref-link:hover {
  text-decoration: underline;
}

/* Status Badges */
.status-badge {
  display: inline-block;
  padding: 0.3rem 0.8rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: capitalize;
  background: #f1f5f9;
  color: #475569;
}

.status-badge.pending {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.for_review {
  background: #e0f2fe;
  color: #0369a1;
}

.status-badge.complete {
  background: #dcfce7;
  color: #166534;
}

.status-badge.incomplete {
  background: #fee2e2;
  color: #991b1b;
}

/* Buttons */
.btn-primary {
  background-color: #990000;
  color: #ffffff;
  border: none;
  padding: 0.65rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(153, 0, 0, 0.2);
}

.btn-primary:hover {
  background-color: #7a0000;
  box-shadow: 0 4px 8px rgba(153, 0, 0, 0.3);
}

.btn-secondary {
  background-color: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
  padding: 0.65rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background-color: #f8fafc;
  border-color: #94a3b8;
}

.btn-primary-outline {
  background: transparent;
  color: #990000;
  border: 1px solid #990000;
  padding: 0.65rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary-outline:hover {
  background: #fdf2f2;
}

.btn-review {
  background-color: #fdf2f2;
  color: #990000;
  border: 1px solid #f8d7d7;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-review:hover {
  background-color: #990000;
  color: #ffffff;
  border-color: #990000;
}

/* Pagination Footer */
.pagination-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: #faf5f5;
  border-top: 1px solid #f3e8e8;
}

.page-indicator {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 500;
}

/* State Boxes */
.state-box {
  padding: 4rem 2rem;
  text-align: center;
  color: #64748b;
  background: #ffffff;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #f3e8e8;
  border-top-color: #990000;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal Styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
}

.modal-content {
  background: #ffffff;
  width: 100%;
  max-width: 760px;
  max-height: 90vh;
  overflow-y: auto;
  border-radius: 14px;
  padding: 2.5rem;
  box-shadow: 0 20px 40px rgba(0,0,0,0.25);
  border-top: 6px solid #990000;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 1.25rem;
  margin-bottom: 1.5rem;
}

.modal-title-group h3 {
  margin: 0.25rem 0 0 0;
  font-size: 1.25rem;
  color: #0f172a;
}

.close-btn {
  background: #f1f5f9;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  cursor: pointer;
  color: #475569;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
  background: #f8fafc;
  padding: 1.5rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.full-width {
  grid-column: span 2;
}

.detail-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: #64748b;
}

.detail-val {
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.section-card-inner {
  background: #fdf2f2;
  padding: 1.5rem;
  border-radius: 10px;
  margin-bottom: 1.5rem;
  border: 1px solid #f8d7d7;
}

.section-card-inner h4 {
  color: #990000;
  margin: 0 0 0.75rem 0;
  font-size: 1.05rem;
}

.checklist {
  list-style: none;
  padding: 0;
  margin: 0;
}

.checklist li {
  margin-bottom: 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 500;
  color: #334155;
}

.check-box {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: bold;
}

.check-box.checked-yes { 
  background: #166534; 
  color: #ffffff; 
} 

.check-box.checked-no { 
  background: #991b1b; 
  color: #ffffff; 
}

.form-label {
  display: block;
  font-weight: 600;
  margin-bottom: 1rem;
  font-size: 0.95rem;
  color: #334155;
}

.form-select, textarea {
  width: 100%;
  padding: 0.75rem;
  margin-top: 0.4rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.95rem;
  background: #ffffff;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}

.email-confirmation-prompt {
  background: #ffffff;
  border: 2px dashed #990000;
  padding: 1.25rem;
  border-radius: 8px;
  margin-top: 1rem;
}

.email-confirmation-prompt h5 {
  color: #990000;
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

.email-confirmation-prompt p {
  font-size: 0.9rem;
  color: #334155;
  margin-bottom: 1rem;
}

.action-buttons-group {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.success-msg {
  color: #166534;
  font-weight: 600;
  margin-bottom: 1rem;
  background: #dcfce7;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  border: 1px solid #bbf7d0;
}

.error-text {
  color: #991b1b;
  font-weight: 600;
  margin-bottom: 1rem;
  background: #fee2e2;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  border: 1px solid #fecaca;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #e2e8f0;
  padding-top: 1.5rem;
}

/* Print Header Styling (Hidden on screen, shown on print) */
.print-header {
  display: none;
}

.print-signature-block {
  display: none;
}

/* Print Stylesheet */
@media print {
  @page {
    size: A4;
    margin: 15mm;
  }

  body {
    background: #ffffff !important;
    margin: 0 !important;
  }
  
  body * { 
    visibility: hidden !important; 
  }
  
  .printable-area, .printable-area * { 
    visibility: visible !important; 
  }
  
  .modal-backdrop, .print-hide-backdrop { 
    position: absolute !important; 
    inset: 0 !important; 
    background: none !important; 
    padding: 0 !important; 
    backdrop-filter: none !important; 
  }
  
  .modal-content, .printable-area { 
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: 100% !important; 
    max-height: none !important; 
    box-shadow: none !important; 
    padding: 0 !important; 
    border: none !important; 
    background: #ffffff !important;
  }
  
  .print-hide { 
    display: none !important; 
  }
  
  .print-header { 
    display: block !important; 
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .print-brand-header h2 {
    font-size: 18pt;
    font-weight: 800;
    color: #990000;
    margin: 0;
  }

  .print-sub-address {
    font-size: 9pt;
    color: #475569;
    margin: 4px 0 8px 0;
  }

  .print-doc-badge {
    display: inline-block;
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #990000;
    background: #fdf2f2;
    border: 1px solid #f8d7d7;
    padding: 4px 12px;
    border-radius: 4px;
    margin-top: 4px;
  }

  .print-ref-meta {
    display: flex;
    justify-content: space-between;
    font-size: 9.5pt;
    color: #334155;
    margin-top: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #990000;
  }

  .detail-grid {
    background: #ffffff !important;
    border: 1px solid #cbd5e1 !important;
    padding: 1rem !important;
    box-shadow: none !important;
    margin-bottom: 1rem !important;
  }

  .section-card-inner {
    background: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    padding: 1rem !important;
    margin-bottom: 1rem !important;
  }

  .print-signature-block {
    display: block !important;
    margin-top: 3rem;
    text-align: right;
    page-break-inside: avoid;
  }

  .sig-line {
    display: inline-block;
    width: 220px;
    border-bottom: 1px solid #0f172a;
    margin-bottom: 4px;
  }

  .sig-label {
    font-size: 9pt;
    color: #475569;
    font-weight: 600;
    margin: 0;
  }
}
</style>