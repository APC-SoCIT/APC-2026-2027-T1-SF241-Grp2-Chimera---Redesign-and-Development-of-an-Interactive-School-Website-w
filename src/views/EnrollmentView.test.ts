// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EnrollmentView from './EnrollmentView.vue';
import { validApplication } from '@/lib/enrollment/fixtures';

describe('enrollment applicant workflow', () => {
  let wrapper: VueWrapper;
  const fetchMock = vi.fn();
  const captcha = { template: '<button type="button" @click="$emit(\'token\', \'test-token\')">Complete security check</button>', emits: ['token'], methods: { reset() {} } };
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ status: 'open', schoolYear: '2026-2027', periodId: '1', siteKey: 'test-key' }) });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });
  async function render() {
    wrapper = mount(EnrollmentView, { attachTo: document.body, global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, EnrollmentCaptcha: captcha } } });
    await flushPromises();
  }
  async function fill() {
    for (const [key, value] of Object.entries(validApplication)) {
      if (key !== 'schoolYear') await wrapper.get(`#${key}`).setValue(value);
    }
  }
  it('shows closed enrollment without rendering a submit form', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'closed', schoolYear: '', periodId: null, siteKey: 'test' }) });
    await render(); expect(wrapper.text()).toContain('Enrollment is currently closed'); expect(wrapper.find('form').exists()).toBe(false);
  });
  it('fails closed when configuration is unavailable and lets the user retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await render(); expect(wrapper.find('form').exists()).toBe(false);
    await wrapper.get('button').trigger('click'); await flushPromises(); expect(wrapper.find('form').exists()).toBe(true);
  });
  it('clears incompatible grade/strand values when changing school level', async () => {
    await render(); await wrapper.get('#level').setValue('SHS'); await wrapper.get('#gradeLevel').setValue('Grade 12'); await wrapper.get('#strand').setValue('12-STEM');
    await wrapper.get('#gradeLevel').setValue('Grade 11');
    expect((wrapper.get('#strand').element as HTMLSelectElement).value).toBe('');
    expect(wrapper.get('#strand').text()).toContain('11-TECHPRO');
    await wrapper.get('#level').setValue('JHS'); expect(wrapper.find('#strand').exists()).toBe(false);
  });
  it('offers all four school levels and resets grade and strand when switching to the new levels', async () => {
    await render();
    expect(wrapper.get('#level').findAll('option').slice(1).map(option => option.text()))
      .toEqual(['Pre-school', 'Elementary', 'Junior High School', 'Senior High School']);
    await wrapper.get('#level').setValue('SHS'); await wrapper.get('#gradeLevel').setValue('Grade 12'); await wrapper.get('#strand').setValue('12-STEM');
    await wrapper.get('#level').setValue('Preschool');
    expect(wrapper.find('#strand').exists()).toBe(false);
    expect((wrapper.get('#gradeLevel').element as HTMLSelectElement).value).toBe('');
    expect(wrapper.get('#gradeLevel').findAll('option').slice(1).map(option => option.text())).toEqual(['Nursery', 'Kindergarten']);
    await wrapper.get('#gradeLevel').setValue('Nursery');
    await wrapper.get('#level').setValue('Elementary');
    expect((wrapper.get('#gradeLevel').element as HTMLSelectElement).value).toBe('');
    expect(wrapper.get('#gradeLevel').findAll('option').slice(1).map(option => option.text()))
      .toEqual(['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6']);
  });
  it('shows field errors before review and preserves data when editing', async () => {
    await render(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('#firstName').attributes('aria-invalid')).toBe('true');
    await fill(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.text()).toContain('Review your application');
    await wrapper.get('.button-edit').trigger('click');
    expect((wrapper.get('#firstName').element as HTMLInputElement).value).toBe('Test');
  });
  it('enforces contact limits and shows errors on blur, then clears them when corrected', async () => {
    await render();
    for (const key of ['contact', 'fatherContact', 'motherContact', 'guardianContact']) {
      const field = wrapper.get(`#${key}`);
      expect(field.attributes('maxlength')).toBe('11'); expect(field.attributes('pattern')).toBe('09[0-9]{9}'); expect(field.attributes('inputmode')).toBe('numeric');
      await field.setValue('08171234567'); await field.trigger('blur');
      expect(field.attributes('aria-invalid')).toBe('true');
      expect(wrapper.get(`#${key}-help`).text()).toContain('exactly 11 digits starting with 09');
      await field.setValue('09171234567');
      expect(field.attributes('aria-invalid')).toBe('false');
    }
  });
  it('blocks review when maxlength is removed and an overlong contact is entered', async () => {
    await render(); await fill();
    const contact = wrapper.get('#contact'); contact.element.removeAttribute('maxlength');
    await contact.setValue('091712345678'); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(contact.attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).not.toContain('Review your application'); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('applies field-specific limits and validates names, optional emails and addresses on blur', async () => {
    await render();
    expect(wrapper.get('#firstName').attributes('maxlength')).toBe('100');
    expect(wrapper.get('#guardianFullName').attributes('maxlength')).toBe('150');
    expect(wrapper.get('#address').attributes('maxlength')).toBe('1000');
    for (const [key, value] of [['firstName', 'Test123'], ['parentEmail', 'a@-example.com'], ['address', '---']]) {
      await wrapper.get(`#${key}`).setValue(value); await wrapper.get(`#${key}`).trigger('blur');
      expect(wrapper.get(`#${key}`).attributes('aria-invalid')).toBe('true');
    }
  });
  it('submits only after review, confirmation and CAPTCHA, then shows saved receipt', async () => {
    await render(); await fill(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('button[type=submit]').attributes('disabled')).toBeDefined();
    await wrapper.get('#confirmation').setValue(true);
    expect(wrapper.get('button[type=submit]').attributes('disabled')).toBeDefined();
    await wrapper.get('#privacyConsent').setValue(true);
    await wrapper.get('#captcha button').trigger('click');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ reference: 'SNCS-TEST-RECEIPT', status: 'Pending', message: 'Proceed to the Registrar’s Office.' }) });
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.text()).toContain('SNCS-TEST-RECEIPT'); expect(wrapper.text()).toContain('Pending'); expect(wrapper.find('form').exists()).toBe(false);
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body.get('application'));
    expect(payload.privacyConsent).toBe(true); expect(payload.periodId).toBe('1');
  });
  it('shows the family the same requirement checklist the Registrar uses, on review and on the receipt', async () => {
    await render(); await fill(); await wrapper.get('form').trigger('submit'); await flushPromises();
    const preview = wrapper.get('.checklist-preview');
    expect(preview.text()).toContain('What to bring');
    expect(preview.text()).toContain('Baptismal certificate');
    expect(preview.text()).toContain('Certificate of good moral character');
    expect(preview.text()).toContain('Parents’ marriage certificate (if applicable)');
    await wrapper.get('#confirmation').setValue(true);
    await wrapper.get('#privacyConsent').setValue(true);
    await wrapper.get('#captcha button').trigger('click');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ reference: 'SNCS-LIST', status: 'Pending', message: 'Proceed to the Registrar’s Office.' }) });
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('.checklist-preview').text()).toContain('Recommendation form in a sealed envelope');
  });
  it('keeps the same submission identifier after an uncertain network failure', async () => {
    await render(); await fill(); await wrapper.get('form').trigger('submit'); await flushPromises();
    await wrapper.get('#confirmation').setValue(true); await wrapper.get('#privacyConsent').setValue(true); await wrapper.get('#captcha button').trigger('click');
    fetchMock.mockRejectedValueOnce(new Error('network failure'));
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.text()).toContain('could not confirm'); expect(wrapper.find('.receipt-reference').exists()).toBe(false);
    const firstId = fetchMock.mock.calls[1][1].body.get('submissionId');
    await wrapper.get('#captcha button').trigger('click');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ reference: 'SNCS-RETRY', status: 'Pending' }) });
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(fetchMock.mock.calls[2][1].body.get('submissionId')).toBe(firstId);
  });
});
