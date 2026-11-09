import { expect, test, type Browser, type Page } from "@playwright/test";
import { newPlayer, pickOption, seatTable, type Player } from "./support/table";

// Online Wavelength, a phone each, against the real server. The first to join
// hosts and is the first Psychic.

const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });
const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { name });
/** A key on the number pad. Exact, or "1" would also match "10". */
const key = (page: Page, n: number) => page.getByRole("button", { name: String(n), exact: true });

async function table(browser: Browser, names: string[]): Promise<Player[]> {
  const players: Player[] = [];
  for (const name of names) players.push(await newPlayer(browser, name));
  await seatTable(players, "/wavelength");
  return players;
}

/** Turns a Clue Giver's number face up, reads it, and turns it back down. */
async function readNumber(p: Player): Promise<number> {
  await button(p.page, /Show my number/).click();
  const n = Number(await p.page.locator(".wl-peek-number mark").innerText());
  await button(p.page, /Hide/).click();
  return n;
}

/** Skips the reveal animation, which any tap does. */
async function skipReveal(p: Player) {
  await p.page.locator(".wl-vs").click({ position: { x: 10, y: 10 } });
}

test("a typed round: answers stay private until all are in, then the guess is scored everywhere", async ({
  browser,
}) => {
  const [ana, ben, cleo] = await table(browser, ["Ana", "Ben", "Cleo"]);
  await button(ana.page, "Start Wavelength").click();

  // Roles are on every phone. Only the Clue Givers get a number, the same one.
  await expect(ana.page.getByText("You’re the Psychic")).toBeVisible();
  await expect(ana.page.locator(".wl-peek")).toHaveCount(0);
  await expect(heading(ben.page, "Ana is picking a category")).toBeVisible();
  const secret = await readNumber(ben);
  expect(await readNumber(cleo)).toBe(secret);

  for (const [c, category] of ["Animals", "Food", "Films"].entries()) {
    await ana.page.getByRole("textbox", { name: "Category" }).fill(category);
    await button(ana.page, "Ask the Clue Givers").click();

    await ben.page.getByRole("textbox", { name: "Your answer" }).fill(`ben-${c}`);
    await button(ben.page, "Lock in my answer").click();
    await expect(ben.page.getByText("Answer locked in")).toBeVisible();

    // One answer in: the room sees the count, nobody sees the answer.
    await expect(ana.page.getByText("1 of 2 answered")).toBeVisible();
    await expect(ana.page.getByText(`ben-${c}`)).toHaveCount(0);
    await expect(cleo.page.getByText(`ben-${c}`)).toHaveCount(0);

    await cleo.page.getByRole("textbox", { name: "Your answer" }).fill(`cleo-${c}`);
    await button(cleo.page, "Lock in my answer").click();

    // All in: on every phone.
    for (const p of [ana, ben, cleo]) {
      await expect(p.page.locator(".wl-cat", { hasText: category })).toContainText(`ben-${c}`);
      await expect(p.page.locator(".wl-cat", { hasText: category })).toContainText(`cleo-${c}`);
    }
  }

  await expect(heading(ben.page, "Ana is guessing…")).toBeVisible();
  await key(ana.page, secret).click();
  await button(ana.page, `Guess ${secret}`).click();

  for (const p of [ana, ben, cleo]) {
    await skipReveal(p);
    await expect(heading(p.page, "Ana read your minds!")).toBeVisible();
  }
  const anaRow = ben.page.locator(".wl-standing", { hasText: "Ana" });
  await expect(anaRow.locator(".wl-score")).toHaveText("2");

  // Anyone can move the table on. Ben is up next.
  await button(cleo.page, "Next round: Ben is the Psychic").click();
  await expect(heading(ben.page, "Ben, pick a category")).toBeVisible();
  await expect(cleo.page.getByText("Round 2 of 3")).toBeVisible();
});

test("out loud with a chosen number: the chooser enters it and the Psychic guesses", async ({ browser }) => {
  const [ana, ben, cleo] = await table(browser, ["Ana", "Ben", "Cleo"]);
  await pickOption(ana, "How do the Clue Givers answer?", "Out loud");
  await pickOption(ana, "Who picks the secret number?", "The Clue Givers");

  // The guests see the host's picks before the start.
  await expect(ben.page.locator(".setup-readout")).toContainText("Out loud");
  await expect(ben.page.locator(".setup-readout")).toContainText("The Clue Givers");

  await button(ana.page, "Start Wavelength").click();

  // Ben is first round from Ana, so Ben enters the number.
  await expect(heading(ana.page, /No listening/)).toBeVisible();
  await expect(heading(cleo.page, /Ben enters it/)).toBeVisible();
  await key(ben.page, 7).click();
  await button(ben.page, "Lock in 7").click();

  await expect(heading(cleo.page, "Talk it out")).toBeVisible();
  expect(await readNumber(cleo)).toBe(7);
  await expect(ana.page.locator(".wl-peek")).toHaveCount(0);

  await button(ana.page, "I’m ready to guess").click();
  await key(ana.page, 3).click();
  await button(ana.page, "Guess 3").click();

  await skipReveal(ben);
  await expect(heading(ben.page, "The Clue Givers win!")).toBeVisible();
  await expect(ben.page.locator(".wl-standing", { hasText: "Ben" }).locator(".wl-score")).toHaveText("1");
});

test("a reload mid-round keeps the answer and the board", async ({ browser }) => {
  const [ana, ben, cleo] = await table(browser, ["Ana", "Ben", "Cleo"]);
  await button(ana.page, "Start Wavelength").click();

  await ana.page.getByRole("textbox", { name: "Category" }).fill("Animals");
  await button(ana.page, "Ask the Clue Givers").click();
  await ben.page.getByRole("textbox", { name: "Your answer" }).fill("Cats");
  await button(ben.page, "Lock in my answer").click();
  await expect(ben.page.getByText("Answer locked in")).toBeVisible();

  await ben.page.reload();
  // Still locked in, not asked again.
  await expect(ben.page.getByText("Answer locked in")).toBeVisible();
  await expect(ben.page.getByRole("textbox", { name: "Your answer" })).toHaveCount(0);

  await cleo.page.getByRole("textbox", { name: "Your answer" }).fill("Dogs");
  await button(cleo.page, "Lock in my answer").click();
  await expect(ben.page.locator(".wl-cat", { hasText: "Animals" })).toContainText("Dogs");
});
