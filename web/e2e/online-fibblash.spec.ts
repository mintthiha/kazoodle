import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { dropConnection, newPlayer, restoreConnection, type Player } from "./support/table";

// Fibblash against the real server: a main screen hosting, phones playing. The
// main screen is a desktop-sized browser; the phones are phones.

const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });

interface Table {
  tv: Player;
  phones: Player[];
  code: string;
}

/** Opens the main screen, reads its code, and joins every phone to it. */
async function table(browser: Browser, names: string[]): Promise<Table> {
  const tv = await newPlayer(browser, "TV", undefined, { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  await tv.page.goto("/fibblash/screen");
  const code = (await tv.page.locator(".big-code").innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);

  const phones: Player[] = [];
  for (const name of names) {
    const p = await newPlayer(browser, name);
    await p.page.goto("/fibblash");
    await p.page.getByLabel("Your name (optional)").fill(name);
    await p.page.getByLabel("Room code").fill(code);
    await button(p.page, "Join").click();
    await expect(p.page.locator(".room-code-value")).toHaveText(code);
    phones.push(p);
  }
  // The screen counts players, not itself.
  await expect(tv.page.locator(".big-roster .roster-row")).toHaveCount(names.length);
  return { tv, phones, code };
}

/** Presses a two-tap button (see TwoTapButton): once to arm it, once to confirm.
 * The arm lapses after a few seconds, and on a loaded machine the second click
 * can land after that, so the pair is retried as one step rather than looking
 * the armed button up again by its new label. */
async function twoTap(target: Locator) {
  // Counted rather than read, so "gone" (the press worked and the button went
  // with it) and "not armed" both read as 0.
  const armed = target.and(target.page().locator('[data-armed="true"]'));
  await expect(async () => {
    if ((await armed.count()) === 0) await target.click();
    await expect(armed).toHaveCount(1, { timeout: 1000 });
    await target.click({ timeout: 2000 });
    // A second click after the arm lapsed only arms it again: go round once more.
    await expect(armed).toHaveCount(0, { timeout: 1000 });
  }).toPass();
}

const stageOf = (p: Player): Locator => p.page.locator("main.fb");

/** The main screen's host panel, opened once; it stays open across phases. */
async function hostNext(tv: Player) {
  const panel = tv.page.locator(".fb-host");
  if (!(await panel.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await panel.locator("summary").click();
  }
  await button(tv.page, "Next").click();
}

/** Every phone that can answer writes something, and locks it in. */
async function answerAll(phones: Player[], round: number) {
  for (const [i, p] of phones.entries()) {
    const box = p.page.getByRole("textbox", { name: /Your lie|Your answer/ });
    if (await box.isVisible()) {
      // No names in the answers: the test checks the ballot names nobody.
      await box.fill(`fib ${round}-${i}`);
      await button(p.page, "Lock it in").click();
      await expect(p.page.getByText("Locked in")).toBeVisible();
    }
  }
}

/** Every phone with a vote picks the first answer it may, and votes. */
async function voteAll(phones: Player[]) {
  for (const p of phones) {
    const cast = button(p.page, "Vote for this one");
    if (await cast.isVisible()) {
      await p.page.locator("button.fb-choice:not([disabled])").first().click();
      await cast.click();
      await expect(p.page.getByText("Vote locked in")).toBeVisible();
    }
  }
}

test("a whole match on a main screen and three phones", async ({ browser }) => {
  test.setTimeout(300_000);
  const { tv, phones } = await table(browser, ["Ana", "Ben", "Cleo"]);
  const [ana, ben] = phones;

  // The shortest match the lobby offers, started from the screen.
  await tv.page
    .locator(".choice", { hasText: "Match length" })
    .locator(".choice-option", { hasText: /^8 questions$/ })
    .click();
  await expect(ana.page.locator(".setup-readout")).toContainText("8 questions");
  await button(tv.page, "Start Fibblash").click();

  const tvMain = tv.page.locator("main.fb-tv");
  await expect(tvMain).toBeVisible();
  for (const p of phones) await expect(stageOf(p)).toBeVisible();

  const kinds = new Set<string>();
  let reconnected = false;

  for (let step = 0; step < 200; step++) {
    const stage = await tvMain.getAttribute("data-stage");
    const clock = (await tvMain.getAttribute("data-clock")) ?? "";
    kinds.add((await tvMain.getAttribute("data-kind")) ?? "");
    if (stage === "final") break;

    if (stage === "answer") {
      // Ana's phone sleeps mid-answer and wakes on the same screen.
      if (!reconnected) {
        reconnected = true;
        await dropConnection(ana);
        await restoreConnection(ana);
        await expect(stageOf(ana)).toHaveAttribute("data-stage", "answer");
      }
      await answerAll(phones, step);
      // Everyone answered, so the phase ends itself after a short pause.
      await expect(tvMain).not.toHaveAttribute("data-clock", clock, { timeout: 10_000 });
    } else if (stage === "vote") {
      // Answers are anonymous until the votes are in: the screen's ballot
      // names nobody.
      const ballot = tv.page.locator(".fb-tv-stage");
      for (const p of phones) await expect(ballot).not.toContainText(p.name);
      await voteAll(phones);
      await expect(tvMain).not.toHaveAttribute("data-clock", clock, { timeout: 25_000 });
    } else {
      // Intro, reveals and the leaderboard run on their own clocks; the host
      // moves them on.
      await hostNext(tv);
      await expect(tvMain).not.toHaveAttribute("data-clock", clock);
    }
  }

  // A match of eight plans every kind of question at least once.
  expect([...kinds].sort()).toEqual(["1", "2", "3"]);

  // The same final standings everywhere.
  await expect(tv.page.locator(".fb-final-headline")).toBeVisible();
  for (const p of phones) {
    await expect(stageOf(p)).toHaveAttribute("data-stage", "final");
    await expect(p.page.locator(".fb-standing")).toHaveCount(3);
  }
  const tvTop = await tv.page.locator(".fb-standing").first().innerText();
  expect(await ben.page.locator(".fb-standing").first().innerText()).toBe(tvTop);

  // Only the host closes the scores, and everyone goes back to the lobby.
  await expect(button(ana.page, "Back to the lobby")).toHaveCount(0);
  await button(tv.page, "Back to the lobby").click();
  await expect(tv.page.locator(".big-code")).toBeVisible();
  for (const p of phones) await expect(p.page.locator(".room-code-value")).toBeVisible();
});

test("the screen's host can remove a player", async ({ browser }) => {
  const { tv, phones } = await table(browser, ["Ana", "Ben", "Cleo"]);
  const cleo = phones[2];

  const row = tv.page.locator(".big-roster .roster-row", { hasText: "Cleo" });
  await twoTap(row.locator("button.danger"));

  await expect(tv.page.locator(".big-roster .roster-row")).toHaveCount(2);
  await expect(cleo.page.getByText("The host removed you from the room.")).toBeVisible();
  await expect(button(cleo.page, "Join")).toBeVisible();
  // The others no longer see Cleo.
  await expect(phones[0].page.locator(".lobby .roster-row", { hasText: "Cleo" })).toHaveCount(0);
});

test("a phone can host too, with no main screen", async ({ browser }) => {
  const names = ["Ana", "Ben", "Cleo"];
  const phones: Player[] = [];
  for (const name of names) phones.push(await newPlayer(browser, name));
  const [ana, ...rest] = phones;

  await ana.page.goto("/fibblash");
  await ana.page.getByLabel("Your name (optional)").fill("Ana");
  await button(ana.page, "Create a room").click();
  const code = await ana.page.locator(".room-code-value").innerText();
  for (const p of rest) {
    await p.page.goto("/fibblash");
    await p.page.getByLabel("Your name (optional)").fill(p.name);
    await p.page.getByLabel("Room code").fill(code);
    await button(p.page, "Join").click();
  }
  await button(ana.page, "Start Fibblash").click();

  // The question is on every phone, and the host's phone has the controls.
  for (const p of phones) await expect(p.page.locator(".fb-prompt")).toBeVisible();
  await ana.page.locator(".fb-host summary").click();
  await twoTap(ana.page.locator(".fb-host-actions button.danger"));
  for (const p of phones) await expect(p.page.getByText("The match ended early.")).toBeVisible();
});
