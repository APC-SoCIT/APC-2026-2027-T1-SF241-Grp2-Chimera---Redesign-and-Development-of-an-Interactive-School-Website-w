import { shallowRef, type ShallowRef } from "vue";
import { readLibrary, type CmsLibrary } from "./history";
import { storageKey } from "./preview";

function loadLibrary() {
  try {
    return readLibrary(localStorage.getItem(storageKey));
  } catch {
    return readLibrary(null);
  }
}

const library = shallowRef<CmsLibrary>();

export function useCmsLibrary() {
  if (!library.value) {
    library.value = loadLibrary();
    window.addEventListener("storage", (event) => {
      if (event.storageArea === localStorage && (event.key === storageKey || event.key === null)) {
        library.value = readLibrary(event.newValue);
      }
    });
  }
  return library as ShallowRef<CmsLibrary>;
}

export function writeCmsLibrary(next: CmsLibrary) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    return false;
  }
  library.value = next;
  return true;
}
