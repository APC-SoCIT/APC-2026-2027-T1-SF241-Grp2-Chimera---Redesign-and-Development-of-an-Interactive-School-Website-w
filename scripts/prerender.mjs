import { build } from "vite";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, sep, basename } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const staging = resolve(root, ".prerender");
await build({ build: { ssr: "src/entry-server.ts", outDir: staging, emptyOutDir: true } });
const { render } = await import(pathToFileURL(resolve(staging, "entry-server.js")).href);
const template = await readFile(resolve(root, "dist/index.html"), "utf8");
const paths = ["/", "/about", "/admissions", "/campus", "/contact", "/news", "/events", "/resources", "/news/office-transactions", "/news/genyo-learning-platform-2026-2027"];
const site = (process.env.VITE_SITE_URL || "https://sncs-campus-preview.vercel.app").replace(/\/$/, "");
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
for (const path of paths) {
  const page = await render(path);
  const title = page.title + " | Sto. Niño Catholic School, Inc.";
  const output = template.replaceAll("https://sncs-campus-preview.vercel.app", site)
    .replace('<div id="app"></div>', '<div id="app">' + page.html + '</div>')
    .replace(/<title>.*?<\/title>/, '<title>' + escape(title) + '</title>')
    .replace(/<meta property="og:title"[^>]+>/, '<meta property="og:title" content="' + escape(title) + '">')
    .replace(/<meta property="og:url"[^>]+>/, '<meta property="og:url" content="' + escape(site + path) + '">');
  const directory = path === "/" ? resolve(root, "dist") : resolve(root, "dist", path.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "index.html"), output);
}
await writeFile(resolve(root, "dist/robots.txt"), 'User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ' + site + '/sitemap.xml\n');
await writeFile(resolve(root, "dist/sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + paths.map((path) => '<url><loc>' + site + path + '</loc></url>').join("") + '</urlset>');
if (!staging.startsWith(root + sep) || basename(staging) !== ".prerender") throw new Error("Unexpected prerender cleanup path");
await rm(staging, { recursive: true, force: true });
console.log('Pre-rendered ' + paths.length + ' public pages.');
