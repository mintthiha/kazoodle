import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { BRAND } from "../src/brand";

const ICONS = ["icons/icon-192.png", "icons/icon-512.png"];

const TEMPLATE = fileURLToPath(new URL("./serviceWorker.template.js", import.meta.url));

/** What the browser reads to offer "add to home screen". */
export function manifest(): string {
  return JSON.stringify(
    {
      name: BRAND.name,
      short_name: BRAND.name,
      start_url: "/",
      display: "standalone",
      background_color: "#000000",
      theme_color: "#000000",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    null,
    2,
  );
}

/** Every URL the service worker must save for the app to work with no network. */
export function precacheList(bundled: string[]): string[] {
  const files = bundled.filter((f) => !f.endsWith(".map")).map((f) => `/${f}`);
  return [...new Set(["/index.html", ...files, ...ICONS.map((f) => `/${f}`)])];
}

/** Fills in the template. The cache name is a hash of the file list, and those names
 * contain hashes of their contents, so any change to the app gives a new cache and
 * every browser picks up the new version. */
export function renderServiceWorker(template: string, files: string[]): string {
  const hash = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
  return template
    .replace("__CACHE_NAME__", `pg-shell-${hash}`)
    .replace("__PRECACHE_FILES__", JSON.stringify(files));
}

/** Adds the service worker and the manifest to a production build. Only a build: in
 * `npm run dev` there are no stable file names to save, and a cache in front of a dev
 * server would serve stale code. */
export function offlineShell(): Plugin {
  return {
    name: "pg-offline-shell",
    apply: "build",
    // After Vite's own HTML step, so that index.html's hashed file names are final.
    enforce: "post",

    transformIndexHtml() {
      return [
        {
          tag: "link",
          attrs: { rel: "manifest", href: "/manifest.webmanifest" },
          injectTo: "head",
        },
      ];
    },

    generateBundle(_options, bundle) {
      const files = precacheList(Object.keys(bundle));
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: renderServiceWorker(readFileSync(TEMPLATE, "utf8"), files),
      });
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: manifest() });
    },
  };
}
