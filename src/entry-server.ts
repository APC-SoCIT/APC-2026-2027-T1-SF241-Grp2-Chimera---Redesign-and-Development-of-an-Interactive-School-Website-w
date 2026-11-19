import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import App from "./App.vue";
import router from "./router";

export async function render(path: string) {
  const app = createSSRApp(App);
  app.use(router);
  await router.push(path);
  await router.isReady();
  return {
    html: await renderToString(app),
    title: String(router.currentRoute.value.meta.title ?? "SNCS"),
  };
}
