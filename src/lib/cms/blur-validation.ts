import { ref } from "vue";

export function useBlurValidation(validate: () => Record<string, string>) {
  const errors = ref<Record<string, string>>({});
  const blurred = ref(new Set<string>());
  const focused = ref("");
  const keyOf = (event: FocusEvent) => {
    const field = event.target as HTMLElement;
    return field.matches("input, select, textarea")
      ? field.getAttribute("data-validation-key") ?? field.getAttribute("name") ?? "" : "";
  };

  function focusField(event: FocusEvent) {
    focused.value = keyOf(event);
  }

  function blurField(event: FocusEvent) {
    const key = keyOf(event);
    if (!key) return;
    focused.value = "";
    blurred.value.add(key);
    const issue = validate()[key];
    if (issue) errors.value[key] = issue;
    else delete errors.value[key];
  }

  function message(key: string) {
    return blurred.value.has(key) && focused.value !== key ? errors.value[key] : undefined;
  }

  function validateAll() {
    errors.value = validate();
    return errors.value;
  }

  return { errors, message, focusField, blurField, validateAll };
}
