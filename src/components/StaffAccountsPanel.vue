<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261114
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261126
  Modified by: Gian Mandac (staff dashboard layout: card styling, reports account-management access)
  Modified Date: 20261124
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getStaffSupabaseClient } from "@/lib/supabase";
import type { StaffRole } from "@/lib/staff-auth";

type Role = StaffRole;
type StaffAccount = { id: string; full_name: string; email: string; role: Role; account_status: string; is_protected_admin: boolean };

// Tells the dashboard whether this Admin can manage staff accounts (Super Admin) or not (Content Admin).
const emit = defineEmits<{
  access: [canManageAccounts: boolean];
  /** Counts for the dashboard's summary cards (this page of the staff list; more = there are further pages). */
  summary: [counts: { total: number; active: number; admins: number; inactive: number; more: boolean }];
}>();

const roles = { admin: "Admin", registrar: "Registrar", teacher: "Teacher", academic_coordinator: "Academic Coordinator" } as const;
const client = getStaffSupabaseClient();
const pageSize = 25;
const accounts = ref<StaffAccount[]>([]);
const offset = ref(0);
const hasMore = ref(false);
const loading = ref(true);
const saving = ref(false);
const accessDenied = ref(false);
const listError = ref("");
const formError = ref("");
const notice = ref("");
const resetResult = ref<{ email: string; password: string }>();
const confirmation = ref<{ account: StaffAccount; action: "reset-password" | "deactivate" }>();
const editingId = ref<string>();
const selectedRole = ref<Role>("teacher");
const fullName = ref("");
const email = ref("");
const password = ref("");
const newRole = ref<Role>("teacher");

async function loadAccounts(nextOffset = offset.value) {
  loading.value = true;
  listError.value = "";
  accessDenied.value = false;
  try {
    const { data, error } = await client.rpc("list_staff_accounts", { p_offset: nextOffset });
    if (error?.code === "42501") {
      accessDenied.value = true;
      accounts.value = [];
      emit("access", false);
      return;
    }
    if (error) throw error;
    emit("access", true);
    const rows = data as StaffAccount[];
    accounts.value = rows.slice(0, pageSize);
    hasMore.value = rows.length > pageSize;
    offset.value = nextOffset;
    if (nextOffset === 0) emit("summary", {
      total: accounts.value.length, more: hasMore.value,
      active: accounts.value.filter((account) => account.account_status === "active").length,
      inactive: accounts.value.filter((account) => account.account_status !== "active").length,
      admins: accounts.value.filter((account) => account.role === "admin").length,
    });
  } catch {
    accounts.value = [];
    listError.value = "Could not load staff accounts.";
  } finally {
    loading.value = false;
  }
}

// Account Creation START
async function createAccount() {
  if (saving.value) return;
  saving.value = true;
  formError.value = "";
  notice.value = "";
  resetResult.value = undefined;
  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) throw new Error("Sign in again to create a staff account.");
    const response = await fetch("/api/staff/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ fullName: fullName.value, email: email.value, password: password.value, role: newRole.value }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.message ?? "Could not create the staff account. Check the account list before retrying.");
    }
    fullName.value = "";
    email.value = "";
    newRole.value = "teacher";
    notice.value = "Staff account created.";
    await loadAccounts(0);
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "Could not create the staff account.";
  } finally {
    password.value = "";
    saving.value = false;
  }
}
// Account Creation END

async function assignRole(account: StaffAccount) {
  if (saving.value) return;
  saving.value = true;
  formError.value = "";
  notice.value = "";
  resetResult.value = undefined;
  try {
    const { error } = await client.rpc("assign_staff_role", { p_staff_id: account.id, p_role: selectedRole.value });
    if (error?.code === "42501") {
      formError.value = "You can change other staff members’ roles while you have account management access.";
      return;
    }
    if (error) throw error;
    editingId.value = undefined;
    notice.value = "Staff role updated.";
    await loadAccounts();
  } catch {
    formError.value = "Could not update the role. Refresh the list before retrying.";
  } finally {
    saving.value = false;
  }
}

// Reset and Deactivate START
async function confirmAccountAction() {
  if (saving.value || !confirmation.value) return;
  const { account, action } = confirmation.value;
  confirmation.value = undefined;
  saving.value = true;
  formError.value = "";
  notice.value = "";
  resetResult.value = undefined;
  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) throw new Error("Sign in again to update a staff account.");
    const response = await fetch("/api/staff/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, staffId: account.id }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message ?? "Could not complete the staff account request.");
    if (action === "deactivate") {
      notice.value = "Staff account deactivated.";
    } else {
      if (typeof result?.temporaryPassword !== "string") throw new Error("The temporary password was unavailable. Reset again to generate a new one.");
      resetResult.value = { email: account.email, password: result.temporaryPassword };
    }
    await loadAccounts();
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "Could not update this account.";
  } finally {
    saving.value = false;
  }
}
// Reset and Deactivate END

onMounted(() => void loadAccounts());
</script>

<template>
  <section class="staff-accounts" aria-labelledby="staff-accounts-heading">
    <h2 id="staff-accounts-heading">Staff accounts</h2>
    <p v-if="loading" role="status">Loading staff accounts…</p>
    <p v-else-if="accessDenied">An Admin with account management permission can manage staff accounts.</p>
    <template v-else-if="listError">
      <p role="alert">{{ listError }}</p>
      <button type="button" class="button button-secondary" @click="loadAccounts()">Try again</button>
    </template>
    <template v-else>
      <div class="account-card">
      <h3 id="create-account-heading" tabindex="-1">Create account</h3>
      <p class="account-hint">Add a staff member and choose their role. They sign in with this email.</p>
      <form class="account-form" @submit.prevent="createAccount">
        <label>Full name <input v-model="fullName" autocomplete="off" required maxlength="150" /></label>
        <label>Email <input v-model="email" type="email" autocomplete="off" required maxlength="254" /></label>
        <label>Initial password <input v-model="password" type="password" autocomplete="new-password" required minlength="12" maxlength="72" /></label>
        <label>Role
          <select v-model="newRole">
            <option v-for="(label, role) in roles" :key="role" :value="role">{{ label }}</option>
          </select>
        </label>
        <button class="account-primary" type="submit" :disabled="saving">Create account</button>
      </form>
      <p v-if="formError" class="account-error" role="alert">{{ formError }}</p>
      <p v-if="notice" class="account-success" role="status">{{ notice }}</p>
      </div>
      <div v-if="resetResult" class="account-notice" role="status">
        <p>Temporary password for {{ resetResult.email }}. Share it privately. It’s shown only here.</p>
        <p><code>{{ resetResult.password }}</code></p>
        <button type="button" @click="resetResult = undefined">Dismiss password</button>
      </div>
      <div class="account-card account-list-card">
      <h3 class="account-list-title">Staff list</h3>
      <p class="account-hint">Change roles, reset passwords or deactivate accounts.</p>
      <p v-if="!accounts.length">No staff accounts found.</p>
      <div v-else class="account-table">
        <table aria-label="Staff account list">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
          <tbody>
            <tr v-for="account in accounts" :key="account.id">
              <th scope="row">{{ account.full_name }}<span v-if="account.is_protected_admin"> — Protected top-level Admin</span></th>
              <td>{{ account.email }}</td>
              <td>
                <select v-if="editingId === account.id" v-model="selectedRole" :aria-label="`Role for ${account.full_name}`">
                  <option v-for="(label, role) in roles" :key="role" :value="role">{{ label }}</option>
                </select>
                <template v-else>{{ roles[account.role] }}</template>
              </td>
              <td><span class="account-status" :data-status="account.account_status">{{ account.account_status }}</span></td>
              <td class="account-actions">
                <template v-if="editingId === account.id">
                  <button type="button" :disabled="saving || selectedRole === account.role" @click="assignRole(account)">Save role</button>
                  <button type="button" :disabled="saving" @click="editingId = undefined">Cancel</button>
                </template>
                <template v-else-if="confirmation?.account.id === account.id">
                  <p>Confirm {{ confirmation.action === "deactivate" ? "deactivation" : "password reset" }} for {{ account.full_name }}.</p>
                  <button type="button" :disabled="saving" @click="confirmAccountAction">Confirm</button>
                  <button type="button" :disabled="saving" @click="confirmation = undefined">Cancel</button>
                </template>
                <template v-else>
                  <button type="button" :disabled="saving || account.is_protected_admin" @click="editingId = account.id; selectedRole = account.role; confirmation = undefined">Change role</button>
                  <template v-if="account.account_status === 'active'">
                    <button type="button" :disabled="saving" @click="confirmation = { account, action: 'reset-password' }; editingId = undefined">Reset password</button>
                    <button type="button" :disabled="saving || account.is_protected_admin" @click="confirmation = { account, action: 'deactivate' }; editingId = undefined">Deactivate</button>
                  </template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="offset || hasMore" class="account-actions account-pages">
        <button type="button" :disabled="saving || !offset" @click="loadAccounts(offset - pageSize)">Previous</button>
        <button type="button" :disabled="saving || !hasMore" @click="loadAccounts(offset + pageSize)">Next</button>
      </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* Matches the staff dashboard cards (see StaffDashboardView). */
.staff-accounts h2 { margin: 0 0 1rem; font-size: 1.35rem; letter-spacing: -.02em; }
.staff-accounts > p { margin: 0; padding: 1rem 1.2rem; border: 1px solid #ece3e1; border-radius: 13px; background: #fff; color: #665b60; }
.account-card { margin: 0 0 1.1rem; padding: 1.1rem 1.2rem 1.2rem; border: 1px solid #ece3e1; border-radius: 13px; background: #fff; box-shadow: 0 2px 8px #3f191605; }
.account-card h3 { margin: 0; font-size: 1.15rem; letter-spacing: -.02em; }
.account-card h3:focus { outline: none; }
.account-hint { margin: .3rem 0 0; color: #665b60; font-size: .88rem; }
.account-form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; align-items: end; gap: .7rem; margin: 1rem 0 0; }
label { display: grid; gap: .35rem; min-width: 0; font-size: .85rem; font-weight: 700; }
input, select { width: 100%; min-height: 42px; border: 1px solid #817078; border-radius: 8px; padding: .45rem .6rem; background: #fff; font: inherit; font-weight: 400; }
button { min-height: 36px; padding: .35rem .75rem; border: 1px solid #dfd2d1; border-radius: 8px; background: #fff; color: #4f323a; font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; }
button:hover:not(:disabled) { background: #f5ecec; }
button:disabled { opacity: .6; cursor: default; }
.account-primary { min-height: 42px; border-color: var(--red-700); background: var(--red-700); color: #fff; }
.account-primary:hover:not(:disabled) { background: var(--red-800); }
:focus-visible { outline: 2px solid #245d96; outline-offset: 2px; }
.account-error, .account-success { margin: .8rem 0 0; padding: .6rem .8rem; border-radius: 8px; font-weight: 700; }
.account-error { background: #fde3df; color: var(--red-800); }
.account-success { background: #e7f4eb; color: #28654e; }
.account-list-card { padding-inline: 0; padding-bottom: .3rem; }
.account-list-card > h3, .account-list-card > p { margin-inline: 1.2rem; }
.account-list-card > p:not(.account-hint) { margin-block: 1rem; }
.account-table { margin-top: 1rem; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { border-top: 1px solid #ece3e1; padding: .75rem 1.2rem; text-align: left; vertical-align: middle; }
thead th { background: #fbf7f6; color: #665b60; font-size: .76rem; }
.account-status { display: inline-block; padding: .15rem .55rem; border-radius: 999px; background: #f0e9ed; color: #66515c; font-size: .76rem; font-weight: 700; text-transform: capitalize; }
.account-status[data-status="active"] { background: #e7f4eb; color: #28654e; }
.account-actions button { margin: .2rem; }
.account-actions p { margin: 0 0 .3rem; font-size: .85rem; }
.account-pages { padding: .6rem 1rem; border-top: 1px solid #ece3e1; }
.account-notice { margin: 0 0 1.1rem; padding: .3rem 1.2rem 1rem; border: 1px solid #e8d7bb; border-radius: 13px; background: #fff8e8; overflow-wrap: anywhere; }

@media (max-width: 960px) { .account-form { grid-template-columns: 1fr 1fr; } }
@media (max-width: 540px) { .account-form { grid-template-columns: 1fr; } }
</style>
