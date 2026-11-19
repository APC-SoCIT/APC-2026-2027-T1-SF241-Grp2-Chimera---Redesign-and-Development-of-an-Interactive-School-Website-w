<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261114
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261114
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getStaffSupabaseClient } from "@/lib/supabase";

type Role = "admin" | "registrar" | "teacher";
type StaffAccount = { id: string; full_name: string; email: string; role: Role; account_status: string };

const roles = { admin: "Admin", registrar: "Registrar", teacher: "Teacher" } as const;
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
      return;
    }
    if (error) throw error;
    const rows = data as StaffAccount[];
    accounts.value = rows.slice(0, pageSize);
    hasMore.value = rows.length > pageSize;
    offset.value = nextOffset;
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
      <h3>Create account</h3>
      <form class="account-form" @submit.prevent="createAccount">
        <label>Full name <input v-model="fullName" autocomplete="off" required maxlength="150" /></label>
        <label>Email <input v-model="email" type="email" autocomplete="off" required maxlength="254" /></label>
        <label>Initial password <input v-model="password" type="password" autocomplete="new-password" required minlength="12" maxlength="72" /></label>
        <label>Role
          <select v-model="newRole">
            <option v-for="(label, role) in roles" :key="role" :value="role">{{ label }}</option>
          </select>
        </label>
        <button class="button button-secondary" type="submit" :disabled="saving">Create account</button>
      </form>
      <p v-if="formError" role="alert">{{ formError }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <div v-if="resetResult" class="account-notice" role="status">
        <p>Temporary password for {{ resetResult.email }}. Share it privately. It’s shown only here.</p>
        <p><code>{{ resetResult.password }}</code></p>
        <button type="button" @click="resetResult = undefined">Dismiss password</button>
      </div>
      <p v-if="!accounts.length">No staff accounts found.</p>
      <div v-else class="account-table">
        <table aria-label="Staff account list">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
          <tbody>
            <tr v-for="account in accounts" :key="account.id">
              <th scope="row">{{ account.full_name }}</th>
              <td>{{ account.email }}</td>
              <td>
                <select v-if="editingId === account.id" v-model="selectedRole" :aria-label="`Role for ${account.full_name}`">
                  <option v-for="(label, role) in roles" :key="role" :value="role">{{ label }}</option>
                </select>
                <template v-else>{{ roles[account.role] }}</template>
              </td>
              <td>{{ account.account_status }}</td>
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
                  <button type="button" :disabled="saving" @click="editingId = account.id; selectedRole = account.role; confirmation = undefined">Change role</button>
                  <template v-if="account.account_status === 'active'">
                    <button type="button" :disabled="saving" @click="confirmation = { account, action: 'reset-password' }; editingId = undefined">Reset password</button>
                    <button type="button" :disabled="saving" @click="confirmation = { account, action: 'deactivate' }; editingId = undefined">Deactivate</button>
                  </template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="offset || hasMore" class="account-actions">
        <button type="button" :disabled="saving || !offset" @click="loadAccounts(offset - pageSize)">Previous</button>
        <button type="button" :disabled="saving || !hasMore" @click="loadAccounts(offset + pageSize)">Next</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.staff-accounts { margin-top: 2rem; }
h3 { margin-top: 1.5rem; }
.account-form { display: flex; flex-wrap: wrap; align-items: end; gap: 1rem; margin: 1rem 0 1.5rem; }
label { display: grid; gap: .35rem; font-weight: 700; }
input, select { min-height: 44px; border: 1px solid var(--muted); border-radius: 4px; padding: .45rem; font: inherit; }
.account-table { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: var(--white); }
th, td { border-bottom: 1px solid var(--line); padding: .7rem; text-align: left; }
.account-actions button { margin: .25rem; min-height: 36px; }
.account-notice { background: var(--cream-100); padding: 0 1rem 1rem; overflow-wrap: anywhere; }
</style>
