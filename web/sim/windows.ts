import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import type { Player } from "../e2e/support/table";

// Real browser windows, tiled across the screen so that a whole table can be watched
// at once. Each one is its own browser process with its own profile, as separate
// phones would be.
//
// They open in app mode, which has no tabs or address bar, because a normal browser
// window refuses to get narrower than about 500 pixels and seven of those overlap.
// Each browser is also started at a smaller scale, worked out from the screen, so that
// a phone-width page fits in one seventh of it.

const HEADLESS = Boolean(process.env.SIM_HEADLESS);
const CHANNEL = process.env.PW_CHANNEL ?? "msedge";

/** How wide a page has to be to look like a phone, in the page's own pixels. */
const PHONE_WIDTH = 376;
/** The narrator's share of the screen height. */
const NARRATOR_SHARE = 0.18;

interface Screen {
  /** Usable area, in real screen pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Slot {
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

const profiles: string[] = [];
const contexts: BrowserContext[] = [];

async function launch(url: string, baseURL: string | undefined, slot?: Slot): Promise<{ context: BrowserContext; page: Page }> {
  const profile = mkdtempSync(join(tmpdir(), "pg-sim-"));
  profiles.push(profile);

  const args = slot
    ? [
        `--app=${url}`,
        `--force-device-scale-factor=${slot.scale}`,
        `--window-position=${slot.left},${slot.top}`,
        `--window-size=${slot.width},${slot.height}`,
      ]
    : [];

  const context = await chromium.launchPersistentContext(profile, {
    channel: CHANNEL,
    headless: HEADLESS,
    baseURL,
    locale: "en-US",
    args,
    slowMo: HEADLESS ? 0 : Number(process.env.SIM_SLOWMO ?? 120),
    // Null means the page is exactly as big as its real window.
    viewport: slot ? null : { width: 360, height: 640 },
  });
  context.setDefaultTimeout(30_000);
  contexts.push(context);

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/** The screen, measured from a real window, since nothing else knows. */
async function measureScreen(): Promise<Screen> {
  const { context, page } = await launch("data:text/html,<title>Measuring</title>", undefined, {
    scale: 1,
    left: 0,
    top: 0,
    width: 300,
    height: 200,
  });
  const screenInfo = await page.evaluate(() => ({
    left: (screen as unknown as { availLeft: number }).availLeft * devicePixelRatio,
    top: (screen as unknown as { availTop: number }).availTop * devicePixelRatio,
    width: screen.availWidth * devicePixelRatio,
    height: screen.availHeight * devicePixelRatio,
  }));
  await context.close();
  contexts.pop();
  return screenInfo;
}

/** Moves a window exactly into its slot. Chromium treats the startup flags as a hint. */
async function placeWindow(context: BrowserContext, page: Page, slot: Slot) {
  const cdp = await context.newCDPSession(page);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", {
    windowId,
    bounds: { left: slot.left, top: slot.top, width: slot.width, height: slot.height, windowState: "normal" },
  });
  await cdp.detach();
}

function blankPage(title: string): string {
  return `data:text/html,<title>${encodeURIComponent(title)}</title><body style="background:black">`;
}

export interface Stage {
  phones: Player[];
  narrator: Narrator | null;
}

/** Shows what is happening, in a strip along the bottom of the screen. */
export class Narrator {
  constructor(readonly page: Page) {}

  async say(title: string, caption: string) {
    await this.page.evaluate(
      ([t, c]) => {
        document.getElementById("t")!.textContent = t;
        document.getElementById("c")!.textContent = c;
      },
      [title, caption],
    );
  }
}

const NARRATOR_HTML = `<!doctype html><title>What is happening</title>
<style>
  body { margin: 0; padding: 8px 24px; background: #000; color: #f5f5f5; font: 400 19px/1.3 system-ui, sans-serif; overflow: hidden; }
  #t { margin: 0 0 4px; color: #ffd60a; font: 800 26px/1.1 system-ui, sans-serif; }
  #c { margin: 0; }
</style>
<h1 id="t">Getting everyone ready</h1><p id="c">Opening a browser for each player.</p>`;

/** Opens one window per name, side by side, with the narrator along the bottom. */
export async function openTable(names: string[], baseURL: string): Promise<Stage> {
  if (HEADLESS) {
    const phones: Player[] = [];
    for (const name of names) {
      const { context, page } = await launch("", baseURL);
      phones.push({ name, context, page });
    }
    return { phones, narrator: null };
  }

  const screenInfo = await measureScreen();

  // Phones: an equal share of the width. The scale makes that share a phone wide.
  const shareWidth = screenInfo.width / names.length;
  const scale = Math.min(1, Math.max(0.45, shareWidth / PHONE_WIDTH));
  const narratorHeight = screenInfo.height * NARRATOR_SHARE;
  const phoneHeight = screenInfo.height - narratorHeight;
  const toPage = (px: number) => Math.floor(px / scale);

  const phones = await Promise.all(
    names.map(async (name, i) => {
      const slot: Slot = {
        scale,
        left: toPage(screenInfo.left + i * shareWidth),
        top: toPage(screenInfo.top),
        width: toPage(shareWidth),
        height: toPage(phoneHeight),
      };
      const { context, page } = await launch(blankPage(name), baseURL, slot);
      await placeWindow(context, page, slot);
      return { name, context, page };
    }),
  );

  const narrator = await openNarrator(screenInfo, phoneHeight, narratorHeight);
  return { phones, narrator };
}

async function openNarrator(screenInfo: Screen, top: number, height: number): Promise<Narrator> {
  const slot: Slot = {
    scale: 1,
    left: Math.floor(screenInfo.left),
    top: Math.floor(screenInfo.top + top),
    width: Math.floor(screenInfo.width),
    height: Math.floor(height),
  };
  const { context, page } = await launch(blankPage("What is happening"), undefined, slot);
  await placeWindow(context, page, slot);
  await page.setContent(NARRATOR_HTML);
  return new Narrator(page);
}

/** One big phone in the middle of the screen, with the narrator below it. */
export async function openOnePhone(name: string, baseURL: string): Promise<Stage> {
  if (HEADLESS) {
    const { context, page } = await launch("", baseURL);
    return { phones: [{ name, context, page }], narrator: null };
  }

  const screenInfo = await measureScreen();
  const narratorHeight = screenInfo.height * NARRATOR_SHARE;
  const phoneHeight = screenInfo.height - narratorHeight;
  const width = Math.min(460, screenInfo.width);
  const slot: Slot = {
    scale: 1,
    left: Math.floor(screenInfo.left + (screenInfo.width - width) / 2),
    top: Math.floor(screenInfo.top),
    width: Math.floor(width),
    height: Math.floor(phoneHeight),
  };
  const { context, page } = await launch(blankPage(name), baseURL, slot);
  await placeWindow(context, page, slot);
  const narrator = await openNarrator(screenInfo, phoneHeight, narratorHeight);
  return { phones: [{ name, context, page }], narrator };
}

/** Where each window really ended up, in real screen pixels. */
export async function measureWindows(stage: Stage) {
  const pages = [...stage.phones.map((p) => ({ name: p.name, page: p.page }))];
  if (stage.narrator) pages.push({ name: "narrator", page: stage.narrator.page });
  return Promise.all(
    pages.map(async ({ name, page }) => ({
      name,
      ...(await page.evaluate(() => {
        const s = devicePixelRatio;
        return {
          left: Math.round(screenX * s),
          top: Math.round(screenY * s),
          width: Math.round(outerWidth * s),
          height: Math.round(outerHeight * s),
          pageWidth: innerWidth,
          pageHeight: innerHeight,
          scale: s,
          screen: `${Math.round(screen.availWidth * s)}x${Math.round(screen.availHeight * s)}`,
        };
      })),
    })),
  );
}

/** The longest a screenshot waits for the page to stop moving. */
const SETTLE_LIMIT_MS = 5000;

/** Waits out anything still moving, so a frame shows where a screen ends up.
 *
 * The wait is capped. A window that is covered, minimised or on a sleeping computer
 * stops drawing, and its animations stop with it, so without a cap one moved window
 * would hang the whole run. A frame taken a little early is the better failure. */
export async function settled(page: Page) {
  await page.evaluate(
    (limit) =>
      Promise.race([
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, limit)),
      ]),
    SETTLE_LIMIT_MS,
  );
}

/** Closes every window and removes the throwaway profiles. */
export async function closeAll() {
  await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => undefined)));
  for (const profile of profiles.splice(0)) {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
