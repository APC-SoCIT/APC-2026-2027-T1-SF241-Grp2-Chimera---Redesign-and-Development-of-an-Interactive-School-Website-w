export const cmsPreviewEnabled = !import.meta.env.SSR && (import.meta.env.DEV || import.meta.env.VITE_CMS_PREVIEW === "true");
