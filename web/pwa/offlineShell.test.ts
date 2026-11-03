import { describe, expect, it } from "vitest";
import { manifest, precacheList, renderServiceWorker } from "./offlineShell";

describe("precacheList", () => {
  it("includes the bundle, the page and the icons", () => {
    const got = precacheList(["assets/index-abc.js", "assets/index-def.css", "index.html"]);
    expect(got).toContain("/assets/index-abc.js");
    expect(got).toContain("/assets/index-def.css");
    expect(got).toContain("/index.html");
    expect(got).toContain("/icons/icon-192.png");
  });

  it("lists nothing twice", () => {
    const got = precacheList(["index.html", "assets/a.js"]);
    expect(new Set(got).size).toBe(got.length);
  });

  it("leaves out source maps, which nobody needs offline", () => {
    expect(precacheList(["assets/a.js.map"])).not.toContain("/assets/a.js.map");
  });
});

describe("renderServiceWorker", () => {
  const template = 'const CACHE = "__CACHE_NAME__";\nconst FILES = __PRECACHE_FILES__;';

  it("leaves no placeholder behind", () => {
    expect(renderServiceWorker(template, ["/a.js"])).not.toMatch(/__\w+__/);
  });

  it("gets a new cache when the app changes, so browsers update", () => {
    expect(renderServiceWorker(template, ["/a-1.js"])).not.toBe(renderServiceWorker(template, ["/a-2.js"]));
  });

  it("keeps the same cache when nothing changed", () => {
    expect(renderServiceWorker(template, ["/a.js"])).toBe(renderServiceWorker(template, ["/a.js"]));
  });
});

describe("manifest", () => {
  it("has what a browser needs to offer installing the app", () => {
    const m = JSON.parse(manifest());
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512"]);
  });
});
