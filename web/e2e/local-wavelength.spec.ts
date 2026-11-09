import { expect, test, type Page } from "@playwright/test";

const NAMES = ["Ana", "Ben", "Cleo"];

const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });
const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { name });
/** A key on the number pad. Exact, or "1" would also match "10". */
const key = (page: Page, n: number) => page.getByRole("button", { name: String(n), exact: true });

async function openSetup(page: Page) {
  await page.goto("/");
  await button(page, /Wavelength/).click();
  await expect(heading(page, "Wavelength")).toBeVisible();
}

async function enterNames(page: Page, names: string[]) {
  for (let i = 3; i < names.length; i++) await button(page, "One more player").click();
  for (const [i, name] of names.entries()) {
    await page.getByRole("textbox", { name: `Name of player ${i + 1}`, exact: true }).fill(name);
  }
}

/** The Clue Givers for the round where `psychic` is the Psychic, in the order the
 * phone reaches them: round the table from the Psychic's left. */
function giversFor(names: string[], psychic: number): string[] {
  return names.map((_, i) => names[(psychic + 1 + i) % names.length]).slice(0, names.length - 1);
}

/** Every Clue Giver turns the slip over in turn. Returns the number they saw,
 * checking they all saw the same one. */
async function readSecret(page: Page, givers: string[], psychic: string): Promise<number> {
  let secret = 0;
  for (const [i, giver] of givers.entries()) {
    await expect(heading(page, `Pass the phone to ${giver}`)).toBeVisible();
    // Nothing secret is on screen until the slip is turned over.
    await expect(page.locator(".wl-slip-number")).toHaveCount(0);
    await button(page, /Tap to see the number/).click();
    const seen = Number(await page.locator(".wl-slip-number mark").innerText());
    if (secret) expect(seen, "every Clue Giver should see the same number").toBe(secret);
    secret = seen;
    const next = i + 1 < givers.length ? givers[i + 1] : psychic;
    await button(page, `Done, pass it to ${next}`).click();
  }
  return secret;
}

/** One category: the Psychic names it, each Clue Giver answers in private. */
async function askCategory(page: Page, category: string, givers: string[], secret: number) {
  await page.getByRole("textbox", { name: "Category" }).fill(category);
  await button(page, "Ask the Clue Givers").click();
  for (const giver of givers) {
    await expect(heading(page, `Pass the phone to ${giver}`)).toBeVisible();
    // The handover screen shows the category but never the number.
    await expect(page.locator(".wl-mine")).toHaveCount(0);
    await button(page, new RegExp(`^I.m ${giver}$`)).click();
    await expect(page.locator(".wl-mine-number")).toHaveText(String(secret));
    await page.getByRole("textbox", { name: "Your answer" }).fill(`${giver}'s ${category}`);
    await button(page, "Lock in my answer").click();
  }
  await expect(page.getByText("The answers are in")).toBeVisible();
  for (const giver of givers) {
    await expect(page.locator(".wl-cat").first()).toContainText(`${giver}'s ${category}`);
  }
}

/** Plays one round through to its result. The Psychic guesses `secret` if `right`,
 * otherwise a neighbouring number. */
async function playRound(page: Page, names: string[], psychicSeat: number, right: boolean) {
  const psychic = names[psychicSeat];
  const givers = giversFor(names, psychicSeat);

  await expect(heading(page, `${psychic} is the Psychic`)).toBeVisible();
  await button(page, "Start the round").click();
  const secret = await readSecret(page, givers, psychic);

  for (const [c, category] of ["Animals", "Food", "Movies"].entries()) {
    await expect(heading(page, `${psychic}, pick a category`)).toBeVisible();
    await askCategory(page, category, givers, secret);
    await button(page, c < 2 ? "Next category" : `Time for ${psychic} to guess`).click();
  }

  const guess = right ? secret : secret === 10 ? 9 : secret + 1;
  await expect(heading(page, `${psychic}, what’s the number?`)).toBeVisible();
  await key(page, guess).click();
  await button(page, `Guess ${guess}`).click();
  await skipSequence(page);
  await expect(heading(page, right ? `${psychic} read your minds!` : "The Clue Givers win!")).toBeVisible();
  return secret;
}

/** Skips the reveal, by tapping a corner where no button can be. */
const skipSequence = (page: Page) => page.locator(".wl-vs").click({ position: { x: 10, y: 10 } });

/** The colour of the reveal's field, once it has settled. */
const fieldColour = (page: Page) =>
  page.locator(".wl-vs-field").evaluate((el) => getComputedStyle(el).backgroundColor);
const YELLOW = "rgb(255, 214, 10)";
const RED = "rgb(229, 72, 77)";

/** A spoken round from the intro to the talk: each Clue Giver reads the number,
 * the last one puts the phone down. Returns the number. */
async function spokenToTalk(page: Page, givers: string[], psychic: string): Promise<number> {
  await expect(heading(page, `${psychic} is the Psychic`)).toBeVisible();
  await button(page, "Start the round").click();
  let secret = 0;
  for (const [i, giver] of givers.entries()) {
    await expect(heading(page, `Pass the phone to ${giver}`)).toBeVisible();
    await button(page, /Tap to see the number/).click();
    secret = Number(await page.locator(".wl-slip-number mark").innerText());
    const last = i === givers.length - 1;
    await button(page, last ? "Done, put the phone down" : `Done, pass it to ${givers[i + 1]}`).click();
  }
  await expect(heading(page, "Talk it out")).toBeVisible();
  return secret;
}

async function startSpoken(page: Page) {
  await openSetup(page);
  await enterNames(page, NAMES);
  await page.locator(".choice-option", { hasText: "Out loud" }).click();
  await button(page, "Start the game").click();
}

test("a whole game: everyone is the Psychic once, and the scores add up", async ({ page }) => {
  await openSetup(page);
  await enterNames(page, NAMES);
  await button(page, "Start the game").click();

  // Ana guesses right (+2 for her), Ben and Cleo miss (+1 to each of their givers).
  await playRound(page, NAMES, 0, true);
  await button(page, "Next round: Ben is the Psychic").click();
  await playRound(page, NAMES, 1, false);
  await button(page, "Next round: Cleo is the Psychic").click();
  await playRound(page, NAMES, 2, false);
  await button(page, "See the final scores").click();

  // Ana: 2 + 1 + 1 = 4. Ben: 0 + 0 + 1 = 1. Cleo: 0 + 1 + 0 = 1.
  await expect(heading(page, "Ana wins!")).toBeVisible();
  const rows = page.locator(".wl-standing");
  await expect(rows.nth(0)).toContainText("Ana");
  await expect(rows.nth(0).locator(".wl-score")).toHaveText("4");
  await expect(rows.nth(1).locator(".wl-score")).toHaveText("1");
  await expect(rows.nth(2).locator(".wl-score")).toHaveText("1");

  // Play again keeps the table and starts from zero.
  await button(page, "Play again").click();
  await expect(heading(page, "Ana is the Psychic")).toBeVisible();
  await expect(page.getByText("Round 1 of 3")).toBeVisible();
});

test("the Clue Givers can choose the number themselves", async ({ page }) => {
  await openSetup(page);
  await enterNames(page, NAMES);
  await page.locator(".choice-option", { hasText: "The Clue Givers" }).click();
  await button(page, "Start the game").click();

  await expect(page.getByText("Then Ben enters it.")).toBeVisible();
  await button(page, "Start the round").click();

  await expect(heading(page, "Pass the phone to Ben")).toBeVisible();
  await key(page, 7).click();
  await button(page, "Lock in 7").click();

  // The next Clue Giver reads it back, which is how the table checks they agreed.
  await expect(heading(page, "Pass the phone to Cleo")).toBeVisible();
  await button(page, /Tap to see the number/).click();
  await expect(page.locator(".wl-slip-number mark")).toHaveText("7");
});

test("a reload mid-round keeps the game", async ({ page }) => {
  await openSetup(page);
  await enterNames(page, NAMES);
  await button(page, "Start the game").click();
  await button(page, "Start the round").click();
  const secret = await readSecret(page, giversFor(NAMES, 0), "Ana");
  await askCategory(page, "Animals", giversFor(NAMES, 0), secret);

  await page.reload();
  await expect(page.getByText("The answers are in")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Animals" })).toBeVisible();
});

test("a category can't be asked twice in one round", async ({ page }) => {
  await openSetup(page);
  await enterNames(page, NAMES);
  await button(page, "Start the game").click();
  await button(page, "Start the round").click();
  const secret = await readSecret(page, giversFor(NAMES, 0), "Ana");
  await askCategory(page, "Animals", giversFor(NAMES, 0), secret);
  await button(page, "Next category").click();

  // The idea already used is gone from the list, and typing it again is refused.
  await expect(button(page, "Animals")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Category" }).fill("animals");
  await expect(page.getByText("You already asked about that one this round.")).toBeVisible();
  await expect(button(page, "Ask the Clue Givers")).toBeDisabled();
});

test("no screen scrolls sideways on a phone", async ({ page }) => {
  await openSetup(page);
  await enterNames(page, ["Anastasia-Maximiliane", "Bartholomew", "Cleopatra"]);
  await button(page, "Start the game").click();

  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  await button(page, "Start the round").click();
  await button(page, /Tap to see the number/).click();
  expect(await fits()).toBe(true);
});

test.describe("answers out loud", () => {
  test("the app only deals the number and takes the guess", async ({ page }) => {
    await startSpoken(page);
    const secret = await spokenToTalk(page, ["Ben", "Cleo"], "Ana");

    // Nothing to type anywhere in the round.
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByText("Ben and Cleo each say something")).toBeVisible();

    // The number is face down on the table until a Clue Giver opens it.
    await expect(page.locator(".wl-peek-number")).toHaveCount(0);
    await button(page, /Clue Givers: check the number/).click();
    await expect(page.locator(".wl-peek-number")).toHaveText(String(secret));
    await button(page, /Hide/).click();
    await expect(page.locator(".wl-peek-number")).toHaveCount(0);

    await button(page, "Ana is ready to guess").click();
    await expect(heading(page, "Ana, what’s the number?")).toBeVisible();
    await expect(page.locator(".wl-board")).toHaveCount(0);
    await key(page, secret).click();
    await button(page, `Guess ${secret}`).click();

    await skipSequence(page);
    await expect(heading(page, "Ana read your minds!")).toBeVisible();
    expect(await fieldColour(page)).toBe(YELLOW);
    await expect(page.locator(".wl-standing").first()).toContainText("Ana");
  });

  test("a wrong guess goes red, and the next round talks too", async ({ page }) => {
    await startSpoken(page);
    const secret = await spokenToTalk(page, ["Ben", "Cleo"], "Ana");
    await button(page, "Ana is ready to guess").click();
    const guess = secret === 10 ? 1 : 10;
    await key(page, guess).click();
    await button(page, `Guess ${guess}`).click();

    await skipSequence(page);
    await expect(heading(page, "The Clue Givers win!")).toBeVisible();
    expect(await fieldColour(page)).toBe(RED);

    await button(page, "Next round: Ben is the Psychic").click();
    await spokenToTalk(page, ["Cleo", "Ana"], "Ben");
  });

  test("the reveal plays through on its own, guess first", async ({ page }) => {
    await startSpoken(page);
    const secret = await spokenToTalk(page, ["Ben", "Cleo"], "Ana");
    await button(page, "Ana is ready to guess").click();
    await key(page, secret).click();
    await button(page, `Guess ${secret}`).click();

    // Mid-sequence: the guess is on the slip and the result is held back.
    await expect(page.getByText("Ana says…")).toBeVisible();
    await expect(page.locator(".wl-vs-front .wl-vs-digit")).toHaveText(String(secret));
    await expect(heading(page, "Ana read your minds!")).toBeHidden();

    // Nobody taps, and it lands.
    await expect(heading(page, "Ana read your minds!")).toBeVisible({ timeout: 8_000 });
    await expect(button(page, "Next round: Ben is the Psychic")).toBeVisible();
  });

  test("the setting is remembered for the next game", async ({ page }) => {
    await startSpoken(page);
    await button(page, "End game").click();
    await button(page, "End game?").click();
    await expect(page.getByRole("radio", { name: "Out loud" })).toBeChecked();
  });
});
