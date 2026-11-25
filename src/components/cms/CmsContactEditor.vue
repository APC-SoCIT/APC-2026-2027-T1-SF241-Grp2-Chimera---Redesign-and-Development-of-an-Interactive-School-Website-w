<!--
  Author: Gian Mandac
  Created Date: 20261126
  Contact details editor: the school's address, office hours, main phone, admissions email and
  offices, as shown on the Contact page, the header, the footer and the home page.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import CmsIcon from "./CmsIcon.vue";
import { useBlurValidation } from "@/lib/cms/blur-validation";
import { loadContactForEditing, saveContactDetails, type EditableContactDetails } from "@/lib/cms/contact";
import { formatCmsDate } from "@/lib/cms/preview";
import {
  contactDetailsProblems, contactLimits, tidyContactDetails,
  type ContactChannelKind, type ContactDetails, type ContactDetailsChannel, type ContactDetailsOffice,
} from "@/lib/content/contact";

const props = defineProps<{ connected: boolean; actor: string }>();
const emit = defineEmits<{ dirty: [value: boolean] }>();

type FormChannel = ContactDetailsChannel & { key: number };
type FormOffice = Omit<ContactDetailsOffice, "channels"> & { key: number; channels: FormChannel[] };
type Form = Omit<ContactDetails, "offices"> & { offices: FormOffice[] };

const kindLabels: Record<ContactChannelKind, string> = { phone: "Phone", email: "Email", link: "Link" };
let nextKey = 1;
const loaded = ref<EditableContactDetails | null>(null);
const form = ref<Form | null>(null);
const loading = ref(true);
const loadError = ref("");
const saving = ref(false);
const saveError = ref("");
const notice = ref("");

function toForm(details: ContactDetails): Form {
  return {
    ...details,
    offices: details.offices.map((office) => ({
      ...office, key: nextKey++, channels: office.channels.map((channel) => ({ ...channel, key: nextKey++ })),
    })),
  };
}

const current = computed(() => form.value ? tidyContactDetails(form.value) : null);
const dirty = computed(() => Boolean(current.value && loaded.value)
  && JSON.stringify(current.value) !== JSON.stringify(tidyContactDetails(loaded.value!.details)));
watch(dirty, (value) => emit("dirty", value), { immediate: true });

const { message: fieldError, focusField, blurField, validateAll } = useBlurValidation(
  () => current.value ? contactDetailsProblems(current.value) : {},
);

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    loaded.value = await loadContactForEditing();
    form.value = toForm(loaded.value.details);
  } catch (issue) {
    loadError.value = issue instanceof Error && issue.message ? issue.message : "The contact details could not be loaded.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function addOffice() {
  form.value?.offices.push({ key: nextKey++, slug: "", name: "", description: "", channels: [{ key: nextKey++, kind: "phone", value: "" }] });
}

function moveOffice(index: number, step: -1 | 1) {
  const offices = form.value?.offices;
  if (!offices || !offices[index + step]) return;
  [offices[index], offices[index + step]] = [offices[index + step], offices[index]];
}

function addChannel(office: FormOffice) {
  office.channels.push({ key: nextKey++, kind: "email", value: "" });
}

function changeKind(channel: FormChannel, kind: ContactChannelKind) {
  channel.kind = kind;
  if (kind === "link") channel.label ??= "";
  else delete channel.label;
}

function discard() {
  if (!loaded.value) return;
  form.value = toForm(loaded.value.details);
  saveError.value = "";
  notice.value = "";
}

async function save() {
  if (!form.value || !loaded.value || saving.value) return;
  notice.value = "";
  saveError.value = "";
  const issues = validateAll();
  if (Object.keys(issues).length) {
    saveError.value = "Review the highlighted fields before saving. Field errors appear after you leave each field.";
    const first = Object.keys(issues)[0];
    document.querySelector<HTMLElement>(`[data-validation-key="${first}"]`)?.focus();
    return;
  }
  saving.value = true;
  try {
    loaded.value = await saveContactDetails(form.value, loaded.value, props.actor);
    form.value = toForm(loaded.value.details);
    notice.value = props.connected ? "Contact details saved. The school website shows them now." : "Contact details saved in this browser's preview.";
  } catch (issue) {
    saveError.value = issue instanceof Error && issue.message ? issue.message : "The contact details could not be saved. Please try again.";
  } finally {
    saving.value = false;
  }
}

const describedBy = (key: string, help?: string) => [help, fieldError(key) ? `${key}-error` : ""].filter(Boolean).join(" ") || undefined;
</script>

<template>
  <div class="cms-heading">
    <div>
      <h1 tabindex="-1">Contact details</h1>
      <p>The school's address, office hours and office contacts on the Contact page, the header, the footer and the home page.</p>
    </div>
  </div>

  <div v-if="loading" class="cms-panel cms-loading" role="status">Loading contact details…</div>
  <div v-else-if="loadError || !form" class="cms-panel cms-loading">
    <p class="cms-error" role="alert">{{ loadError }}</p>
    <button type="button" class="cms-button" @click="load">Try again</button>
  </div>
  <form v-else class="cms-editor-grid" novalidate autocomplete="off" aria-label="Contact details"
    @submit.prevent="save" @focusin="focusField" @focusout="blurField">
    <div class="cms-contact-main">
      <p v-if="notice" class="cms-notice" role="status"><CmsIcon name="check" :size="18" />{{ notice }}</p>

      <section class="cms-panel cms-form-panel" aria-labelledby="contact-school-title">
        <h2 id="contact-school-title">School</h2>
        <div class="cms-field">
          <label for="contact-address">Address</label>
          <textarea id="contact-address" v-model="form.address" data-validation-key="address" rows="2" maxlength="300" required
            :aria-invalid="Boolean(fieldError('address'))" :aria-describedby="describedBy('address')"></textarea>
          <small v-if="fieldError('address')" id="address-error" class="cms-error">{{ fieldError('address') }}</small>
        </div>
        <div class="cms-field">
          <label for="contact-hours">Office hours</label>
          <input id="contact-hours" v-model="form.officeHours" data-validation-key="officeHours" type="text" maxlength="200" required
            :aria-invalid="Boolean(fieldError('officeHours'))" :aria-describedby="describedBy('officeHours')" />
          <small v-if="fieldError('officeHours')" id="officeHours-error" class="cms-error">{{ fieldError('officeHours') }}</small>
        </div>
        <div class="cms-contact-pair">
          <div class="cms-field">
            <label for="contact-phone">Main phone number</label>
            <input id="contact-phone" v-model="form.mainPhone" data-validation-key="mainPhone" type="tel" maxlength="25" required
              :aria-invalid="Boolean(fieldError('mainPhone'))" :aria-describedby="describedBy('mainPhone', 'contact-phone-help')" />
            <small id="contact-phone-help">Shown at the top of every page and in the footer.</small>
            <small v-if="fieldError('mainPhone')" id="mainPhone-error" class="cms-error">{{ fieldError('mainPhone') }}</small>
          </div>
          <div class="cms-field">
            <label for="contact-email">Admissions email</label>
            <input id="contact-email" v-model="form.admissionsEmail" data-validation-key="admissionsEmail" type="email" maxlength="254" required
              spellcheck="false" autocapitalize="none" :aria-invalid="Boolean(fieldError('admissionsEmail'))"
              :aria-describedby="describedBy('admissionsEmail', 'contact-email-help')" />
            <small id="contact-email-help">Where "Email admissions" and the inquiry form send families.</small>
            <small v-if="fieldError('admissionsEmail')" id="admissionsEmail-error" class="cms-error">{{ fieldError('admissionsEmail') }}</small>
          </div>
        </div>
      </section>

      <section class="cms-panel cms-form-panel" aria-labelledby="contact-offices-title">
        <div class="cms-contact-section-heading">
          <h2 id="contact-offices-title">Offices</h2>
          <button type="button" class="cms-button" :disabled="form.offices.length >= contactLimits.offices" @click="addOffice">
            <CmsIcon name="plus" :size="17" /> Add office
          </button>
        </div>
        <p v-if="fieldError('offices') || !form.offices.length" class="cms-error">{{ fieldError('offices') || 'List at least one office.' }}</p>

        <fieldset v-for="(office, n) in form.offices" :key="office.key" class="cms-contact-office">
          <legend>{{ office.name.trim() || 'New office' }}</legend>
          <div class="cms-contact-office-actions">
            <button type="button" class="cms-button" :disabled="n === 0" :aria-label="'Move ' + (office.name || 'office') + ' up'" @click="moveOffice(n, -1)">Move up</button>
            <button type="button" class="cms-button" :disabled="n === form.offices.length - 1" :aria-label="'Move ' + (office.name || 'office') + ' down'" @click="moveOffice(n, 1)">Move down</button>
            <button type="button" class="cms-button cms-trash-action" :aria-label="'Remove ' + (office.name || 'office')" @click="form.offices.splice(n, 1)">Remove</button>
          </div>
          <div class="cms-field">
            <label :for="'office-name-' + office.key">Office name</label>
            <input :id="'office-name-' + office.key" v-model="office.name" :data-validation-key="`office-${n}-name`" type="text" maxlength="100" required
              :aria-invalid="Boolean(fieldError(`office-${n}-name`))" :aria-describedby="describedBy(`office-${n}-name`)" />
            <small v-if="fieldError(`office-${n}-name`)" :id="`office-${n}-name-error`" class="cms-error">{{ fieldError(`office-${n}-name`) }}</small>
          </div>
          <div class="cms-field">
            <label :for="'office-description-' + office.key">What families can contact this office about <small>(optional)</small></label>
            <textarea :id="'office-description-' + office.key" v-model="office.description" :data-validation-key="`office-${n}-description`" rows="2" maxlength="400"
              :aria-invalid="Boolean(fieldError(`office-${n}-description`))" :aria-describedby="describedBy(`office-${n}-description`)"></textarea>
            <small v-if="fieldError(`office-${n}-description`)" :id="`office-${n}-description-error`" class="cms-error">{{ fieldError(`office-${n}-description`) }}</small>
          </div>

          <p class="cms-contact-channels-label" :id="'office-channels-' + office.key">Ways to reach this office</p>
          <ul class="cms-contact-channels" :aria-labelledby="'office-channels-' + office.key">
            <li v-for="(channel, m) in office.channels" :key="channel.key">
              <div class="cms-field">
                <label :for="'channel-kind-' + channel.key">Type</label>
                <select :id="'channel-kind-' + channel.key" :value="channel.kind" @change="changeKind(channel, ($event.target as HTMLSelectElement).value as ContactChannelKind)">
                  <option v-for="(label, kind) in kindLabels" :key="kind" :value="kind">{{ label }}</option>
                </select>
              </div>
              <div class="cms-field">
                <label :for="'channel-value-' + channel.key">{{ channel.kind === 'phone' ? 'Phone number' : channel.kind === 'email' ? 'Email address' : 'Link (https://…)' }}</label>
                <input :id="'channel-value-' + channel.key" v-model="channel.value" :data-validation-key="`office-${n}-channel-${m}-value`"
                  :type="channel.kind === 'phone' ? 'tel' : channel.kind === 'email' ? 'email' : 'url'" maxlength="500" required spellcheck="false" autocapitalize="none"
                  :aria-invalid="Boolean(fieldError(`office-${n}-channel-${m}-value`))" :aria-describedby="describedBy(`office-${n}-channel-${m}-value`)" />
                <small v-if="fieldError(`office-${n}-channel-${m}-value`)" :id="`office-${n}-channel-${m}-value-error`" class="cms-error">{{ fieldError(`office-${n}-channel-${m}-value`) }}</small>
              </div>
              <div v-if="channel.kind === 'link'" class="cms-field">
                <label :for="'channel-label-' + channel.key">Text visitors see</label>
                <input :id="'channel-label-' + channel.key" v-model="channel.label" :data-validation-key="`office-${n}-channel-${m}-label`" type="text" maxlength="100" required
                  placeholder="e.g. Message the Registrar" :aria-invalid="Boolean(fieldError(`office-${n}-channel-${m}-label`))"
                  :aria-describedby="describedBy(`office-${n}-channel-${m}-label`)" />
                <small v-if="fieldError(`office-${n}-channel-${m}-label`)" :id="`office-${n}-channel-${m}-label-error`" class="cms-error">{{ fieldError(`office-${n}-channel-${m}-label`) }}</small>
              </div>
              <button type="button" class="cms-button" :disabled="office.channels.length === 1"
                :aria-label="'Remove ' + (channel.value || kindLabels[channel.kind].toLowerCase()) + ' from ' + (office.name || 'this office')"
                @click="office.channels.splice(m, 1)">Remove</button>
            </li>
          </ul>
          <small v-if="fieldError(`office-${n}-channels`)" class="cms-error">{{ fieldError(`office-${n}-channels`) }}</small>
          <button type="button" class="cms-button" :disabled="office.channels.length >= contactLimits.channels" @click="addChannel(office)">
            <CmsIcon name="plus" :size="17" /> Add a way to reach {{ office.name.trim() || 'this office' }}
          </button>
        </fieldset>
      </section>
    </div>

    <aside class="cms-editor-side">
      <section class="cms-panel cms-form-panel">
        <h2>Publication</h2>
        <span class="cms-status" data-state="published">published</span>
        <p>{{ connected ? 'Saving updates the school website right away.' : 'Saving updates the public preview in this browser.' }}</p>
        <dl class="cms-record-details">
          <dt>Last edited by</dt><dd>{{ loaded?.updatedBy }}</dd>
          <dt>Last updated</dt><dd>{{ loaded?.updatedAt ? formatCmsDate(loaded.updatedAt) : 'Not edited yet' }}</dd>
        </dl>
      </section>
    </aside>
    <div class="cms-editor-footer">
      <p v-if="saveError" class="cms-error" role="alert">{{ saveError }}</p>
      <button type="button" class="cms-button" :disabled="!dirty || saving" @click="discard">Discard changes</button>
      <button type="submit" class="cms-button cms-primary" :disabled="!dirty || saving">{{ saving ? 'Saving…' : 'Save changes' }}</button>
    </div>
  </form>
</template>
