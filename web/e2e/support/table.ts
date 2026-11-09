import {
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { WEB_URL } from "./stack";

// A table of real browsers playing the online game against the real server. Each
// player is a separate browser context, so each has its own storage, as separate
// phones do. Shared by the online tests and the simulation.

export interface Player {
  name: string;
  page: Page;
  context: BrowserContext;
}

export interface Role {
  isImposter: boolean;
  /** What the slip says: the word, or empty for an imposter. */
  word: string;
  /** "Your partner: Ben", on a two-imposter round. */
  partnerLine: string;
}

const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });

export async function newPlayer(
  browser: Browser,
  name: string,
  baseURL = WEB_URL,
  options: BrowserContextOptions = {},
): Promise<Player> {
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL, locale: "en-US", ...options });
  const page = await context.newPage();
  return { name, page, context };
}

/** Brings a table together in one room and returns its code. The first player
 * hosts. `path` is the game's page, Imposter's unless said otherwise. */
export async function seatTable(players: Player[], path = "/imposter"): Promise<string> {
  const [host, ...rest] = players;
  await host.page.goto(path);
  await host.page.getByLabel("Your name (optional)").fill(host.name);
  await button(host.page, "Create a room").click();
  const code = await host.page.locator(".room-code-value").innerText();

  for (const p of rest) {
    await p.page.goto(path);
    await p.page.getByLabel("Your name (optional)").fill(p.name);
    await p.page.getByLabel("Room code").fill(code);
    await button(p.page, "Join").click();
    await expect(p.page.locator(".room-code-value")).toHaveText(code);
  }
  await expect(host.page.locator(".lobby .roster-row:not(.roster-seat)")).toHaveCount(players.length);
  return code;
}

/** Turns one player's slip over, reads it, and confirms it. */
export async function readRole(p: Player, confirm = true): Promise<Role> {
  await button(p.page, /Tap to see your word/).click();
  await expect(button(p.page, /Tap to hide/)).toBeVisible();

  const isImposter = await p.page.locator(".slip-imposter").isVisible();
  const role: Role = {
    isImposter,
    word: isImposter ? "" : await p.page.locator(".slip-word mark").innerText(),
    partnerLine: isImposter && (await p.page.locator(".slip-partner").count()) > 0
      ? await p.page.locator(".slip-partner").innerText()
      : "",
  };
  if (confirm) await button(p.page, "Got it").click();
  return role;
}

export async function readRoles(players: Player[], confirm = true): Promise<Map<string, Role>> {
  const roles = new Map<string, Role>();
  for (const p of players) roles.set(p.name, await readRole(p, confirm));
  return roles;
}

/** Whoever's turn it is, by which screen says so. */
export async function currentSpeaker(players: Player[]): Promise<Player> {
  let found: Player | undefined;
  await expect
    .poll(async () => {
      for (const p of players) {
        if (await p.page.getByRole("heading", { name: "Your turn" }).isVisible()) {
          found = p;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return found!;
}

/** The player on turn gives this clue. Returns who gave it. */
export async function giveClue(players: Player[], clue: (speaker: Player) => string): Promise<Player> {
  const speaker = await currentSpeaker(players);
  await speaker.page.getByLabel("Your clue").fill(clue(speaker));
  await button(speaker.page, "Submit").click();
  await expect(speaker.page.getByRole("heading", { name: "Your turn" })).toBeHidden();
  return speaker;
}

export async function castVote(voter: Player, suspect: string) {
  // By the name line only: a clue in the row could happen to contain a name.
  const name = voter.page.locator(".ledger-name", { hasText: new RegExp(`^${suspect}\\b`) });
  await voter.page.locator("button.ledger-row", { has: name }).click();
  await button(voter.page, "Lock in").click();
}

/** The host picks one option in the lobby's match setup. */
export async function pickOption(host: Player, legend: string, label: string) {
  // The label, not the input: the input is hidden, so a click aimed at it can land on
  // whatever happens to be on top of it.
  await host.page
    .locator(".choice", { hasText: legend })
    .locator(".choice-option", { hasText: new RegExp(`^${label}$`) })
    .click();
}

/** Drops this player's socket for real, the way a phone locking its screen does. */
export async function dropConnection(p: Player) {
  await p.page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
}

/** The phone wakes back up. */
export async function restoreConnection(p: Player) {
  await p.page.evaluate(() => window.dispatchEvent(new Event("online")));
}
