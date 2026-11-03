import { expect, test, type Page } from "@playwright/test";
import { BUILD_URL } from "./support/stack";

// Against a production build, the only place the service worker exists.
test.use({ baseURL: BUILD_URL });

const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });

/** Waits until the service worker has saved the app and is in control of the page. */
async function waitForOfflineReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
    });
  });
}

test("one-phone mode opens and plays with no network", async ({ page, context }) => {
  // One visit, online, to anywhere in the app is what installs it.
  await page.goto("/");
  await waitForOfflineReady(page);

  await context.setOffline(true);

  // Not just a page already open: a fresh load of a URL that was never visited.
  await page.goto("/imposter/local");
  await expect(page.getByRole("heading", { name: "One phone, passed around" })).toBeVisible();

  await button(page, "Deal the words").click();
  await expect(page.getByRole("heading", { name: "Pass the phone to Player 1" })).toBeVisible();

  // The word list came with the app, so a slip can still be read.
  await button(page, /Tap to see your word/).click();
  await expect(button(page, /Tap to hide/)).toBeVisible();

  // And a reload with no network keeps the game.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pass the phone to Player 1" })).toBeVisible();
});

test("a build offers the app for installing", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const res = await page.request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});
