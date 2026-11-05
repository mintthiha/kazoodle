import { expect, test, type Page } from "@playwright/test";
import words from "../src/games/imposter/local/words.gen.json" with { type: "json" };

const NAMES = ["Ana", "Ben", "Cleo", "Dov"];

const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });
const speaker = (page: Page) => page.locator(".speaker h1");
const playAgain = (page: Page) => button(page, "Play again");

async function openSetup(page: Page) {
  await page.goto("/");
  await button(page, "Play on one phone").click();
  await expect(page.getByRole("heading", { name: "One phone, passed around" })).toBeVisible();
}

/** Takes setup from three seats to these names. */
async function enterNames(page: Page, names: string[]) {
  for (let i = 3; i < names.length; i++) await button(page, "One more player").click();
  for (const [i, name] of names.entries()) {
    await page.getByRole("textbox", { name: `Name of player ${i + 1}`, exact: true }).fill(name);
  }
}

/** Turns the slip over, waiting until it has, and says whose slip it was. */
async function openSlip(page: Page): Promise<boolean> {
  await button(page, /Tap to see your word/).click();
  await expect(button(page, /Tap to hide/)).toBeVisible();
  return page.getByText("You’re the IMPOSTER").isVisible();
}

/** Passes the phone round, opening every slip the way each player would, and
 * reports what the slips actually said. */
async function dealAll(page: Page, names: string[]) {
  let imposter = "";
  let word = "";
  for (const [i, name] of names.entries()) {
    await expect(page.getByRole("heading", { name: `Pass the phone to ${name}` })).toBeVisible();
    const isImposter = await openSlip(page);
    if (isImposter) {
      expect(imposter, "only one player should be the imposter").toBe("");
      imposter = name;
    } else {
      const seen = await page.locator(".slip-word mark").innerText();
      if (word) expect(seen, "every crew member should get the same word").toBe(word);
      word = seen;
    }

    const last = i === names.length - 1;
    await button(page, last ? "Start the game" : "Next player").click();
  }
  expect(imposter, "someone should be the imposter").not.toBe("");
  expect(word, "the crew should have a word").not.toBe("");
  return { imposter, word, innocent: names.find((n) => n !== imposter)! };
}

async function startManualGame(page: Page, names = NAMES) {
  await openSetup(page);
  await enterNames(page, names);
  await button(page, "Deal the words").click();
  return dealAll(page, names);
}

async function accuse(page: Page, who: string) {
  await button(page, "Reveal the imposter").click();
  await page.locator(".accuse-row", { hasText: who }).click();
  await button(page, `Accuse ${who}`).click();
}

/** Skips the animation, by tapping a corner where no button can be. */
const skipSequence = (page: Page) => page.locator(".vs").click({ position: { x: 20, y: 20 } });

/** Takes a verdict through to the screen with Play again on it, ruling that a caught
 * imposter's spoken guess was wrong if there was one. */
async function finishVerdict(page: Page, miss = "No, they missed") {
  await skipSequence(page);
  const missed = button(page, miss);
  if (await missed.isVisible()) await missed.click();
}

async function fieldColour(page: Page): Promise<string> {
  return page.locator(".vs-field").evaluate((el) => getComputedStyle(el).backgroundColor);
}

const YELLOW = "rgb(255, 214, 10)";
const RED = "rgb(229, 72, 77)";

test.describe("getting in", () => {
  test("the hub reaches one-phone mode without opening a game socket", async ({ page }) => {
    const sockets: string[] = [];
    page.on("websocket", (ws) => {
      // The dev server's own hot-reload socket is not the game's.
      if (ws.url().endsWith("/ws")) sockets.push(ws.url());
    });

    const { imposter } = await startManualGame(page);
    await accuse(page, imposter);
    await finishVerdict(page);
    await expect(playAgain(page)).toBeVisible();
    expect(sockets).toEqual([]);

    // The control: prove that check can fail, by taking the online door.
    await page.goto("/");
    await page.locator(".tile", { hasText: "Imposter" }).click();
    await expect.poll(() => sockets.length).toBeGreaterThan(0);
  });

  test("the URL can be opened directly and Back returns to the hub", async ({ page }) => {
    await page.goto("/imposter/local");
    await expect(page.getByRole("heading", { name: "One phone, passed around" })).toBeVisible();
    await button(page, "All games").click();
    await expect(page).toHaveURL("/");
    await expect(button(page, "Play on one phone")).toBeVisible();
  });

  test("the tile still leads to the online game", async ({ page }) => {
    await page.goto("/");
    await page.locator(".tile", { hasText: "Imposter" }).click();
    await expect(page.getByRole("heading", { name: "Join a game" })).toBeVisible();
    await button(page, "All games").click();
    await expect(page).toHaveURL("/");
  });

  test("leaving to the hub and coming back resumes the game", async ({ page }) => {
    await startManualGame(page);
    const current = await speaker(page).innerText();

    await page.goBack();
    await button(page, "Play on one phone").click();

    await expect(speaker(page)).toHaveText(current);
  });
});

test.describe("setup", () => {
  test("the player count is bounded and adds or removes name boxes", async ({ page }) => {
    await openSetup(page);
    const boxes = page.locator(".seat-row input");
    const fewer = button(page, "One fewer player");
    const more = button(page, "One more player");

    await expect(boxes).toHaveCount(3);
    await expect(fewer).toBeDisabled();

    for (let i = 0; i < 9; i++) await more.click();
    await expect(boxes).toHaveCount(12);
    await expect(more).toBeDisabled();

    await fewer.click();
    await expect(boxes).toHaveCount(11);
  });

  test("blank names play as numbered players", async ({ page }) => {
    await openSetup(page);
    await button(page, "Deal the words").click();
    await dealAll(page, ["Player 1", "Player 2", "Player 3"]);
    await expect(speaker(page)).toHaveText(/^Player [123]$/);
  });

  test("a repeated name blocks the deal until it is fixed", async ({ page }) => {
    await openSetup(page);
    await enterNames(page, ["Sam", "sam", "Cleo"]);
    const deal = button(page, "Deal the words");
    await expect(deal).toBeDisabled();
    await expect(page.getByText("Two players have the same name")).toBeVisible();

    await page.getByRole("textbox", { name: "Name of player 2", exact: true }).fill("Max");
    await expect(deal).toBeEnabled();
  });

  test("a name that clashes with a blank seat's number also blocks the deal", async ({ page }) => {
    await openSetup(page);
    await page.getByRole("textbox", { name: "Name of player 1", exact: true }).fill("Player 2");
    await expect(button(page, "Deal the words")).toBeDisabled();
  });

  test("the timing settings only show for the automatic mode", async ({ page }) => {
    await openSetup(page);
    await expect(page.getByText("Time per clue")).toBeHidden();
    await page.getByText("The app", { exact: true }).click();
    await expect(page.getByText("Time per clue")).toBeVisible();
    await expect(page.getByText("Clues per player")).toBeVisible();
    await page.getByText("You do", { exact: true }).click();
    await expect(page.getByText("Time per clue")).toBeHidden();
  });

  test("the chosen category deals a word from that category", async ({ page }) => {
    await openSetup(page);
    await page.getByText("Animals", { exact: true }).click();
    await button(page, "Deal the words").click();
    const { word } = await dealAll(page, ["Player 1", "Player 2", "Player 3"]);

    const animals = words.filter((w) => w.categoryKey === "animals").map((w) => w.word.en);
    expect(animals).toContain(word);
  });

  test("the imposter's hint shows only when it is switched on", async ({ page }) => {
    await openSetup(page);
    await page.locator(".switch-row").click();
    await button(page, "Deal the words").click();

    // Open slips until the imposter's turns up. Crew slips must never show it.
    for (let seat = 0; seat < 3; seat++) {
      const isImposter = await openSlip(page);
      await expect(page.getByText(/^Hint:/)).toHaveCount(isImposter ? 1 : 0);
      await button(page, seat === 2 ? "Start the game" : "Next player").click();
    }
  });
});

test.describe("custom categories", () => {
  const HINTS: Record<string, string> = { Red: "Tomato", Green: "Grass", Blue: "Sky" };
  const OURS = Object.keys(HINTS);
  const OURS_TEXT = OURS.map((word) => `${word}: ${HINTS[word]}`).join("\n");
  const THREE_SEATS = ["Player 1", "Player 2", "Player 3"];
  const nameBox = (page: Page) => page.getByRole("textbox", { name: "Category name" });
  const wordsBox = (page: Page) => page.getByRole("textbox", { name: "Words and hints" });
  const chip = (page: Page, name: string) => page.getByRole("radio", { name, exact: true });

  async function addCategory(page: Page, name = "Colours", words = OURS_TEXT) {
    await button(page, "New category").click();
    await nameBox(page).fill(name);
    await wordsBox(page).fill(words);
    await button(page, "Save category").click();
    await expect(chip(page, name)).toBeChecked();
  }

  test("every game deals from the list, and it runs through the words before repeating", async ({ page }) => {
    await openSetup(page);
    await addCategory(page);
    await button(page, "Deal the words").click();

    const seen: string[] = [];
    for (let game = 0; game < OURS.length; game++) {
      const { word, imposter } = await dealAll(page, THREE_SEATS);
      expect(OURS).toContain(word);
      expect(seen).not.toContain(word);
      seen.push(word);
      await accuse(page, imposter);
      await finishVerdict(page);
      await expect(page.locator(".vs")).toContainText("Colours");
      await playAgain(page).click();
    }
  });

  /** Opens every slip, and reports the crew's word and what the imposter was told. */
  async function readSlips(page: Page) {
    let word = "";
    let hints: string[] = [];
    for (let seat = 0; seat < 3; seat++) {
      const isImposter = await openSlip(page);
      const shown = await page.getByText(/^Hint:/).allInnerTexts();
      if (isImposter) {
        await expect(page.getByText("Category: Colours")).toBeVisible();
        hints = shown;
      } else {
        expect(shown, "the crew must never see a hint").toEqual([]);
        word = await page.locator(".slip-word mark").innerText();
      }
      await button(page, seat === 2 ? "Start the game" : "Next player").click();
    }
    return { word, hints };
  }

  test("with hints on, the imposter gets the hint of the word that was dealt", async ({ page }) => {
    await openSetup(page);
    await addCategory(page);
    await page.locator(".switch-row").click();
    await button(page, "Deal the words").click();

    // Every word in turn, so a wrong pairing cannot pass by luck.
    for (let game = 0; game < OURS.length; game++) {
      const { word, hints } = await readSlips(page);
      expect(hints).toEqual([`Hint: ${HINTS[word]}. You still don’t know the word.`]);
      await accuse(page, THREE_SEATS[0]);
      await finishVerdict(page);
      await playAgain(page).click();
    }
  });

  test("with hints off, the imposter gets the usual message and no hint", async ({ page }) => {
    await openSetup(page);
    await addCategory(page);
    await expect(page.locator(".switch-row")).toBeVisible();
    await button(page, "Deal the words").click();

    const { hints } = await readSlips(page);
    expect(hints).toEqual([]);
  });

  test("Save explains what is missing until the category is valid", async ({ page }) => {
    await openSetup(page);
    await button(page, "New category").click();
    const save = button(page, "Save category");

    await expect(save).toBeDisabled();
    await expect(page.getByText("Give the category a name.")).toBeVisible();

    await nameBox(page).fill("food");
    await expect(page.getByText("There is already a category with this name.")).toBeVisible();

    await nameBox(page).fill("Colours");
    await wordsBox(page).fill("Red: Tomato\nred: Blood\nRED: Fire\nGreen: Grass");
    await expect(page.getByText("Words so far: 2")).toBeVisible();
    await expect(page.getByText("Add at least 3 different words.")).toBeVisible();
    await expect(save).toBeDisabled();

    await wordsBox(page).fill(`Red: Tomato\nGreen: Grass\n${"x".repeat(21)}: Long`);
    await expect(page.getByText(/is too long/)).toBeVisible();
    await expect(save).toBeDisabled();

    await wordsBox(page).fill(`Red: Tomato\nGreen: Grass\nBlue: ${"x".repeat(31)}`);
    await expect(page.getByText("The hint for “Blue” is too long. The limit is 30 characters.")).toBeVisible();
    await expect(save).toBeDisabled();

    await wordsBox(page).fill("Red: Tomato\nGreen: Grass\n: Sky");
    await expect(page.getByText("“Sky” has no word before the colon.")).toBeVisible();
    await expect(save).toBeDisabled();

    await wordsBox(page).fill("ice cream: cold\nDave's van: rusty");
    await expect(page.getByText("Add at least 3 different words.")).toBeVisible();
    await wordsBox(page).fill("ice cream: cold\nDave's van: rusty\nTacos: Tuesday");
    await expect(page.getByText("Words so far: 3")).toBeVisible();
    await expect(save).toBeEnabled();
  });

  test("every word needs a hint before it can be saved", async ({ page }) => {
    await openSetup(page);
    await button(page, "New category").click();
    await nameBox(page).fill("Colours");
    const save = button(page, "Save category");
    const needsHint = (word: string) => page.getByText(`“${word}” needs a hint.`);

    await wordsBox(page).fill("Red\nGreen\nBlue");
    await expect(needsHint("Red")).toBeVisible();
    await expect(save).toBeDisabled();

    await wordsBox(page).fill("Red: Tomato\nGreen\nBlue");
    await expect(needsHint("Green")).toBeVisible();
    await expect(save).toBeDisabled();

    // A colon with nothing after it is still no hint.
    await wordsBox(page).fill("Red: Tomato\nGreen: Grass\nBlue:   ");
    await expect(needsHint("Blue")).toBeVisible();
    await expect(save).toBeDisabled();

    await wordsBox(page).fill(OURS_TEXT);
    await expect(save).toBeEnabled();
  });

  test("it survives a reload, and can be edited", async ({ page }) => {
    await openSetup(page);
    await addCategory(page);

    await page.reload();
    await expect(chip(page, "Colours")).toBeChecked();

    await button(page, "Edit category").click();
    await expect(nameBox(page)).toHaveValue("Colours");
    await expect(wordsBox(page)).toHaveValue(OURS_TEXT);
    await nameBox(page).fill("Shades");
    await wordsBox(page).fill("Teal: Duck\nMauve: Lilac\nOchre: Clay");
    await button(page, "Save category").click();

    await expect(chip(page, "Colours")).toHaveCount(0);
    await expect(chip(page, "Shades")).toBeChecked();
    await button(page, "Deal the words").click();
    const { word } = await dealAll(page, THREE_SEATS);
    expect(["Teal", "Mauve", "Ochre"]).toContain(word);
  });

  test("a word in French keeps its hint, spaced the French way, in a French app", async ({ page }) => {
    await openSetup(page);
    await page.getByRole("button", { name: "FR", exact: true }).click();
    await button(page, "Nouvelle catégorie").click();
    await page.getByRole("textbox", { name: "Nom de la catégorie" }).fill("Couleurs");
    await page
      .getByRole("textbox", { name: "Mots et indices" })
      .fill("Rouge : Tomate\nVert : Herbe\nBleu : Ciel");
    await button(page, "Enregistrer la catégorie").click();
    await page.locator(".switch-row").click();
    await button(page, "Distribuer les mots").click();

    const hintOf: Record<string, string> = { Rouge: "Tomate", Vert: "Herbe", Bleu: "Ciel" };
    let word = "";
    let hint = "";
    for (let seat = 0; seat < 3; seat++) {
      await page.locator(".slip-down").click();
      await page.locator(".slip-turned").waitFor();
      if (await page.locator(".slip-imposter").count()) {
        hint = await page.locator(".slip-imposter .slip-note").nth(1).innerText();
      } else {
        word = await page.locator(".slip-word mark").innerText();
      }
      await page.locator(".dock .primary").click();
    }
    expect(hint).toContain(hintOf[word]);
  });

  test("Back keeps the old version, and deleting takes two taps", async ({ page }) => {
    await openSetup(page);
    await addCategory(page);

    await button(page, "Edit category").click();
    await nameBox(page).fill("Something else");
    await button(page, "Back").click();
    await expect(chip(page, "Colours")).toBeChecked();

    await button(page, "Edit category").click();
    await button(page, "Delete category").click();
    await expect(wordsBox(page)).toBeVisible();
    await button(page, "Delete it?").click();

    await expect(chip(page, "Colours")).toHaveCount(0);
    await expect(chip(page, "Any category")).toBeChecked();
    await expect(button(page, "Edit category")).toHaveCount(0);
  });

  test("names and settings typed before opening the editor are kept", async ({ page }) => {
    await openSetup(page);
    await enterNames(page, NAMES);
    await page.getByText("The app", { exact: true }).click();
    await addCategory(page);

    await expect(page.getByRole("textbox", { name: "Name of player 4", exact: true })).toHaveValue("Dov");
    await expect(chip(page, "The app")).toBeChecked();
  });
});

test.describe("the deal", () => {
  test("Next player waits for the word, and the next slip starts face down", async ({ page }) => {
    await openSetup(page);
    await enterNames(page, NAMES);
    await button(page, "Deal the words").click();

    const next = button(page, "Next player");
    await expect(page.getByText("Player 1 of 4")).toBeVisible();
    await expect(next).toBeDisabled();

    await button(page, /Tap to see your word/).click();
    await expect(button(page, /Tap to hide/)).toBeVisible();
    await expect(next).toBeEnabled();
    await next.click();

    await expect(page.getByRole("heading", { name: "Pass the phone to Ben" })).toBeVisible();
    await expect(page.getByText("Player 2 of 4")).toBeVisible();
    await expect(button(page, /Tap to see your word/)).toBeVisible();
    await expect(button(page, /Tap to hide/)).toHaveCount(0);
    await expect(next).toBeDisabled();
  });

  test("everyone sees the same word except exactly one imposter", async ({ page }) => {
    // dealAll holds the assertions: this is here to run them on the biggest table
    // that has one imposter. Seven or more get two; see "two imposters" below.
    const names = [...NAMES, "Eli", "Fay"];
    const { imposter } = await startManualGame(page, names);
    expect(names).toContain(imposter);
  });
});

test.describe("you tap Next player", () => {
  test("Reveal is enabled on every turn, and the turns keep going round", async ({ page }) => {
    await startManualGame(page);

    // Remember the order, then walk past the end of the table.
    const order: string[] = [];
    for (let turn = 1; turn <= NAMES.length; turn++) {
      await expect(page.getByText(`Pass 1 · Clue ${turn} of 4`)).toBeVisible();
      await expect(button(page, "Reveal the imposter")).toBeEnabled();
      order.push(await speaker(page).innerText());
      await button(page, "Next player").click();
    }
    expect([...order].sort()).toEqual([...NAMES].sort());

    await expect(page.getByText("Pass 2 · Clue 1 of 4")).toBeVisible();
    await expect(speaker(page)).toHaveText(order[0]);
    await expect(button(page, "Reveal the imposter")).toBeEnabled();
  });

  test("turns follow the table, starting anywhere", async ({ page }) => {
    await startManualGame(page);
    const first = await speaker(page).innerText();
    const start = NAMES.indexOf(first);
    for (let i = 1; i < NAMES.length; i++) {
      await button(page, "Next player").click();
      await expect(speaker(page)).toHaveText(NAMES[(start + i) % NAMES.length]);
    }
  });

  test("Back from the accusation returns to the same turn", async ({ page }) => {
    await startManualGame(page);
    await button(page, "Next player").click();
    const current = await speaker(page).innerText();

    await button(page, "Reveal the imposter").click();
    await expect(page.getByRole("heading", { name: "Who are you accusing?" })).toBeVisible();
    await expect(button(page, "Pick someone")).toBeDisabled();
    await button(page, "Back").click();

    await expect(speaker(page)).toHaveText(current);
  });

  test("End game takes two taps and returns to setup with the names kept", async ({ page }) => {
    await startManualGame(page);
    await button(page, "End game").click();
    await expect(speaker(page)).toBeVisible();
    await button(page, "End game?").click();

    await expect(page.getByRole("textbox", { name: "Name of player 1", exact: true })).toHaveValue("Ana");
  });
});

test.describe("the app moves on by itself", () => {
  async function startAuto(page: Page) {
    await openSetup(page);
    await enterNames(page, NAMES.slice(0, 3));
    await page.getByText("The app", { exact: true }).click();
    await page.locator(".choice", { hasText: "Clues per player" }).getByText("1", { exact: true }).click();
    await page.getByText("10s", { exact: true }).click();
    await button(page, "Deal the words").click();
    return dealAll(page, NAMES.slice(0, 3));
  }

  test("turns advance untouched, and Reveal only appears at the end", async ({ page }) => {
    // Real time on purpose, no faked clock: three 10 second turns, so this is
    // the test to watch.
    const { imposter } = await startAuto(page);

    await expect(page.getByRole("timer")).toBeVisible();
    await expect(button(page, "Next player")).toHaveCount(0);

    const seen = [await speaker(page).innerText()];
    for (let turn = 2; turn <= 3; turn++) {
      await expect(page.getByText(`Clue ${turn} of 3`)).toBeVisible({ timeout: 15_000 });
      await expect(button(page, "Reveal the imposter")).toHaveCount(0);
      seen.push(await speaker(page).innerText());
    }
    expect([...seen].sort()).toEqual(["Ana", "Ben", "Cleo"]);

    await expect(button(page, "Reveal the imposter")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Who's the imposter?" })).toBeVisible();

    await accuse(page, imposter);
    await expect(page.locator(".vs")).toHaveAttribute("data-side", "crew");
    await finishVerdict(page);
    await expect(playAgain(page)).toBeVisible();
  });

  test("Pause holds the turn however long it takes, and Resume carries on", async ({ page }) => {
    // Faked time, so a long pause does not mean a long test.
    await page.clock.install();
    await startAuto(page);
    const current = await speaker(page).innerText();

    await button(page, "Pause").click();
    await expect(page.getByText("Paused")).toBeVisible();
    await page.clock.runFor(120_000);
    await expect(speaker(page)).toHaveText(current);

    await button(page, "Resume").click();
    await expect(page.getByRole("timer")).toContainText("s left");
    await page.clock.runFor(11_000);
    await expect(speaker(page)).not.toHaveText(current);
  });
});

test.describe("the verdict", () => {
  test("naming the imposter plays the good ending", async ({ page }) => {
    const { imposter, word } = await startManualGame(page);
    await accuse(page, imposter);

    const scene = page.locator(".vs");
    await expect(scene).toHaveAttribute("data-side", "crew");

    // The suspense comes first, with the result still hidden and untappable.
    await expect(page.locator(".vs-question")).toHaveText(`Was it ${imposter}?`);
    await expect(playAgain(page)).toBeHidden();
    const running = await page.evaluate(() => document.getAnimations().length);
    expect(running).toBeGreaterThan(0);

    // Then the catch, which still leaves the imposter one way out. The word stays
    // off the screen until the table has heard their guess.
    await expect(page.getByRole("heading", { name: "Caught!" })).toBeVisible();
    await expect(page.getByText(`${imposter} gets one guess at the word.`)).toBeVisible();
    await expect(page.locator(".verdict-slip")).toHaveCount(0);
    await expect(playAgain(page)).toBeHidden();
    expect(await fieldColour(page)).toBe(YELLOW);

    // And the ending.
    await button(page, "No, they missed").click();
    await expect(page.getByRole("heading", { name: "The crew wins!" })).toBeVisible();
    await expect(playAgain(page)).toBeVisible();
    await expect(page.getByText(`${imposter} was the imposter and missed the word.`)).toBeVisible();
    await expect(page.locator(".verdict-slip")).toHaveText(word);
    expect(await fieldColour(page)).toBe(YELLOW);
  });

  test("a caught imposter who says the word steals the win", async ({ page }) => {
    const { imposter, word } = await startManualGame(page);
    await accuse(page, imposter);
    await skipSequence(page);

    await button(page, "Yes, they got it").click();

    await expect(page.getByRole("heading", { name: "The imposter wins!" })).toBeVisible();
    await expect(page.getByText(`${imposter} guessed the word and stole the win.`)).toBeVisible();
    await expect(page.locator(".verdict-slip")).toHaveText(word);
    await expect(page.locator(".vs")).toHaveAttribute("data-side", "imposter");
    expect(await fieldColour(page)).toBe(RED);
    await expect(page.locator(".vs-live")).toHaveCount(0);
  });

  test("a reload while the table is ruling keeps the question open", async ({ page }) => {
    const { imposter } = await startManualGame(page);
    await accuse(page, imposter);
    await page.reload();
    await expect(button(page, "Yes, they got it")).toBeVisible();
    await expect(page.locator(".verdict-slip")).toHaveCount(0);
  });

  test("naming anyone else plays the bad ending", async ({ page }) => {
    const { imposter, innocent, word } = await startManualGame(page);
    await accuse(page, innocent);

    const scene = page.locator(".vs");
    await expect(scene).toHaveAttribute("data-side", "imposter");
    await expect(page.locator(".vs-question")).toHaveText(`Was it ${innocent}?`);
    await expect(playAgain(page)).toBeHidden();

    await expect(page.getByRole("heading", { name: "The imposter wins!" })).toBeVisible();
    await expect(playAgain(page)).toBeVisible();
    await expect(page.getByText(`${innocent} was innocent.`)).toBeVisible();
    await expect(page.locator(".verdict-who")).toHaveText(new RegExp(imposter));
    await expect(page.locator(".verdict-slip")).toHaveText(word);
    expect(await fieldColour(page)).toBe(RED);
  });

  test("a tap skips straight to the result", async ({ page }) => {
    const { imposter } = await startManualGame(page);
    await accuse(page, imposter);
    await expect(button(page, "No, they missed")).toBeHidden();

    await skipSequence(page);

    await expect(button(page, "No, they missed")).toBeVisible();
    await expect(page.locator(".vs-live")).toHaveCount(0);
  });

  test("reduced motion goes straight to the result, with nothing moving", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { imposter } = await startManualGame(page);
    await accuse(page, imposter);

    await expect(button(page, "No, they missed")).toBeVisible();
    await expect(page.locator(".vs-question")).toBeHidden();
    const running = await page
      .locator(".vs")
      .evaluate((el) => el.getAnimations({ subtree: true }).length);
    expect(running).toBe(0);
  });

  test("Play again deals a new word to the same players", async ({ page }) => {
    const { imposter, word } = await startManualGame(page);
    await accuse(page, imposter);
    await finishVerdict(page);
    await playAgain(page).click();

    const second = await dealAll(page, NAMES);
    expect(second.word).not.toBe(word);
  });

  test("Change players returns to setup with the names kept", async ({ page }) => {
    const { imposter } = await startManualGame(page);
    await accuse(page, imposter);
    await finishVerdict(page);
    await button(page, "Change players or settings").click();

    await expect(page.getByRole("textbox", { name: "Name of player 2", exact: true })).toHaveValue("Ben");
    await expect(page.locator(".seat-row input")).toHaveCount(4);
  });
});

test.describe("real life", () => {
  test("a reload in the middle keeps the game", async ({ page }) => {
    await startManualGame(page);
    await button(page, "Next player").click();
    const current = await speaker(page).innerText();

    await page.reload();

    await expect(speaker(page)).toHaveText(current);
    await expect(page.getByText("Pass 1 · Clue 2 of 4")).toBeVisible();
  });

  test("a reload during the deal goes back to a face-down slip", async ({ page }) => {
    await openSetup(page);
    await enterNames(page, NAMES);
    await button(page, "Deal the words").click();
    await button(page, /Tap to see your word/).click();

    await page.reload();

    await expect(button(page, /Tap to see your word/)).toBeVisible();
    await expect(button(page, /Tap to hide/)).toHaveCount(0);
  });

  test("setup survives closing the tab", async ({ page, context }) => {
    await openSetup(page);
    await enterNames(page, NAMES);
    await page.close();

    const again = await context.newPage();
    await openSetup(again);
    await expect(again.getByRole("textbox", { name: "Name of player 4", exact: true })).toHaveValue("Dov");
    await again.close();
  });

  test("the whole game plays in French", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "FR", exact: true }).click();
    await button(page, "Jouer sur un seul téléphone").click();
    await button(page, "Distribuer les mots").click();

    let word = "";
    for (let seat = 1; seat <= 3; seat++) {
      await expect(page.getByRole("heading", { name: `Passez le téléphone à Joueur ${seat}` })).toBeVisible();
      await button(page, /Touchez pour voir votre mot/).click();
      await expect(button(page, /Touchez pour cacher/)).toBeVisible();
      const mark = page.locator(".slip-word mark");
      if ((await mark.count()) > 0) word = await mark.innerText();
      await button(page, seat === 3 ? "Commencer la partie" : "Joueur suivant").click();
    }
    expect(words.map((w) => w.word.fr)).toContain(word);

    await button(page, "Révéler l’imposteur").click();
    await page.locator(".accuse-row").first().click();
    await button(page, /^Accuser/).click();
    await finishVerdict(page, "Non, raté");
    await expect(button(page, "Rejouer")).toBeVisible();
    await expect(page.locator(".verdict-slip")).toHaveText(word);
  });

  test("the game bar fits the smallest phone in French", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await page.getByRole("button", { name: "FR", exact: true }).click();
    await button(page, "Jouer sur un seul téléphone").click();
    await button(page, "Distribuer les mots").click();
    await button(page, "Terminer").click();

    const quit = button(page, "Terminer ?");
    await expect(quit).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(quit).toBeInViewport({ ratio: 1 });
  });

  test("nothing on the way through overflows a phone's width", async ({ page }) => {
    const long = "Maximiliana-Bartholomew";
    await openSetup(page);
    await enterNames(page, [long, "Ben", "Cleo"]);
    await page.getByText("Activities", { exact: true }).click();

    const fits = async () => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    };

    await fits();
    await button(page, "Deal the words").click();
    await fits();
    await dealAll(page, [long, "Ben", "Cleo"]);
    await fits();
    await accuse(page, long);
    await fits();
    await finishVerdict(page);
    await expect(playAgain(page)).toBeVisible();
    await fits();
  });

  test("the Deal button stays reachable at the bottom of a long setup", async ({ page }) => {
    await openSetup(page);
    await enterNames(page, ["Ana", "Ben", "Cleo", "Dov", "Eli", "Fay", "Gus"]);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    // After everything else on the page, and on screen rather than scrolled away.
    const deal = button(page, "Deal the words");
    await expect(deal).toBeInViewport();
    const rules = page.locator(".rules-card");
    const [dealBox, rulesBox] = [await deal.boundingBox(), await rules.boundingBox()];
    expect(dealBox!.y).toBeGreaterThan(rulesBox!.y);
  });

  test("setup explains the game before anyone has to deal", async ({ page }) => {
    await openSetup(page);
    await expect(page.getByRole("heading", { name: "How to play" })).toBeVisible();
    await expect(page.getByText("gets one guess at the word, out loud", { exact: false })).toBeVisible();
    // No score in this mode, so the online card's points must not show up here.
    await expect(page.getByText("+3", { exact: false })).toHaveCount(0);
  });
});

test.describe("two imposters", () => {
  const SEVEN = ["Ana", "Ben", "Cleo", "Dov", "Eli", "Fay", "Gus"];

  async function dealSeven(page: Page) {
    await openSetup(page);
    await enterNames(page, SEVEN);
    await button(page, "Deal the words").click();

    const imposters: { name: string; partnerLine: string }[] = [];
    for (const [i, name] of SEVEN.entries()) {
      await expect(page.getByRole("heading", { name: `Pass the phone to ${name}` })).toBeVisible();
      if (await openSlip(page)) {
        imposters.push({ name, partnerLine: await page.locator(".slip-partner").innerText() });
      } else {
        await expect(page.locator(".slip-partner")).toHaveCount(0);
      }
      await button(page, i === SEVEN.length - 1 ? "Start the game" : "Next player").click();
    }
    return imposters;
  }

  test("seven players get two, who are told about each other", async ({ page }) => {
    const imposters = await dealSeven(page);

    expect(imposters).toHaveLength(2);
    expect(imposters[0].partnerLine).toBe(`Your partner: ${imposters[1].name}`);
    expect(imposters[1].partnerLine).toBe(`Your partner: ${imposters[0].name}`);
    await expect(speaker(page)).not.toHaveText(imposters[0].name);
    await expect(speaker(page)).not.toHaveText(imposters[1].name);
  });

  test("catching either one counts, and the result names both", async ({ page }) => {
    const imposters = await dealSeven(page);
    await accuse(page, imposters[1].name);
    await finishVerdict(page);

    await expect(page.getByRole("heading", { name: "The crew wins!" })).toBeVisible();
    await expect(page.locator(".verdict-who")).toHaveCount(2);
    await expect(page.getByText("The imposters")).toBeVisible();
  });

  test("the switch only appears at seven, and turns it off", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: "Two imposters at 7+ players" });
    await openSetup(page);
    await enterNames(page, SEVEN.slice(0, 6));
    await expect(toggle).toHaveCount(0);

    await button(page, "One more player").click();
    await expect(toggle).toBeChecked();
    await page.locator(".switch-row", { hasText: "Two imposters" }).click();
    await expect(toggle).not.toBeChecked();

    await page.getByRole("textbox", { name: "Name of player 7", exact: true }).fill("Gus");
    await button(page, "Deal the words").click();
    let imposters = 0;
    for (const [i] of SEVEN.entries()) {
      if (await openSlip(page)) imposters++;
      await button(page, i === SEVEN.length - 1 ? "Start the game" : "Next player").click();
    }
    expect(imposters).toBe(1);
  });
});

test.describe("sound", () => {
  /** Counts beeps by watching the browser's own audio API. */
  async function countBeeps(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as { beeps: number };
      w.beeps = 0;
      const real = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (this: AudioContext) {
        w.beeps++;
        return real.call(this);
      };
    });
    return () => page.evaluate(() => (window as unknown as { beeps: number }).beeps);
  }

  async function startAutoGame(page: Page) {
    await openSetup(page);
    await enterNames(page, THREE_FOR_SOUND);
    await page.locator(".choice-option", { hasText: "The app" }).click();
    await page.locator(".choice-option", { hasText: /^10s$/ }).click();
  }
  const THREE_FOR_SOUND = ["Ana", "Ben", "Cleo"];

  test("a turn ending on the clock beeps, and a tap on Next player does not", async ({ page }) => {
    await page.clock.install();
    const beeps = await countBeeps(page);
    await startAutoGame(page);
    await button(page, "Deal the words").click();
    await dealAll(page, THREE_FOR_SOUND);

    const before = await speaker(page).innerText();
    await page.clock.runFor(10_500);
    await expect(speaker(page)).not.toHaveText(before);
    await expect.poll(beeps).toBe(1);
  });

  test("the switch silences it", async ({ page }) => {
    await page.clock.install();
    const beeps = await countBeeps(page);
    await startAutoGame(page);
    await page.locator(".switch-row", { hasText: "Sound when a turn ends" }).click();
    await button(page, "Deal the words").click();
    await dealAll(page, THREE_FOR_SOUND);

    const before = await speaker(page).innerText();
    await page.clock.runFor(10_500);
    await expect(speaker(page)).not.toHaveText(before);
    expect(await beeps()).toBe(0);
  });
});
