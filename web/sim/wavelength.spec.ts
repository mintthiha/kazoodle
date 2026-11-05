import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { WEB_URL } from "../e2e/support/stack";
import { buildReplay, type Beat } from "./replay";
import { closeAll, openOnePhone } from "./windows";

// One-phone Wavelength, played by three people round one phone, live on your screen:
// `npm run sim:wavelength`. Every step asserts what should now be true, so a run
// that finishes is also a test that passed. Writes sim/output/wavelength-replay.html.
//
// SIM_PACE, SIM_HOLD and SIM_HEADLESS work as in simulation.spec.ts.

const HEADLESS = Boolean(process.env.SIM_HEADLESS);
const PACE = Number(process.env.SIM_PACE ?? (HEADLESS ? 50 : 1500));
const HOLD = Number(process.env.SIM_HOLD ?? 20);
const READING_MS_PER_CHAR = HEADLESS ? 0 : 40;
const TYPING_MS = HEADLESS ? 0 : 70;
const OUTPUT = fileURLToPath(new URL("./output/", import.meta.url));

const NAMES = ["Ana", "Ben", "Cleo"];

/** Each Clue Giver's own taste in a category, from least favourite (1) to favourite
 * (10). Two different ladders, so the two answers to one number differ the way two
 * real people's would. */
const TASTES: Record<string, [string[], string[]]> = {
  Animals: [
    ["Mosquito", "Cockroach", "Rat", "Pigeon", "Goat", "Horse", "Penguin", "Dolphin", "Red panda", "Otter"],
    ["Tick", "Wasp", "Snake", "Seagull", "Cow", "Sheep", "Owl", "Fox", "Elephant", "Dog"],
  ],
  Food: [
    ["Liver", "Olives", "Brussels sprouts", "Tofu", "Rice", "Pasta", "Burritos", "Ramen", "Sushi", "Pizza"],
    ["Blue cheese", "Anchovies", "Beets", "Cabbage", "Salad", "Soup", "Curry", "Tacos", "Steak", "Poutine"],
  ],
  "Movies you've seen": [
    ["Cats (2019)", "Morbius", "Twilight", "Transformers", "Frozen", "Jaws", "Shrek", "Inception", "Up", "The Lion King"],
    ["The Room", "Batman & Robin", "Fifty Shades", "Avatar", "Titanic", "Toy Story", "Spirited Away", "Interstellar", "Parasite", "The Matrix"],
  ],
  Drinks: [
    ["Prune juice", "Fernet", "Tomato juice", "Tonic water", "Water", "Iced tea", "Lemonade", "Cold brew", "Bubble tea", "Hot chocolate"],
    ["Jägermeister", "Kombucha", "Milk", "Diet cola", "Orange juice", "Ginger ale", "Beer", "Matcha latte", "Margarita", "Espresso"],
  ],
  "Holiday spots": [
    ["Airport hotel", "Parking lot", "Gas station", "Theme park", "Cottage", "Paris", "Barcelona", "Lisbon", "Bali", "Kyoto"],
    ["Mall", "Motel", "Las Vegas", "Cruise ship", "Toronto", "New York", "London", "Rome", "Iceland", "Hawaii"],
  ],
  Sports: [
    ["Golf", "Cricket", "Curling", "Baseball", "Tennis", "Cycling", "Volleyball", "Basketball", "Hockey", "Soccer"],
    ["Darts", "Bowling", "Fishing", "Running", "Swimming", "Badminton", "Skiing", "Climbing", "Surfing", "Snowboarding"],
  ],
  Snacks: [
    ["Rice cakes", "Celery", "Raisins", "Pretzels", "Popcorn", "Trail mix", "Nachos", "Gummy bears", "Cookies", "Chips"],
    ["Licorice", "Prunes", "Granola bar", "Crackers", "Apple", "Cheese sticks", "Doritos", "M&Ms", "Brownies", "Ice cream"],
  ],
  Cars: [
    ["Minivan", "Smart car", "Hummer", "Pickup truck", "Civic", "Corolla", "Jeep", "Mustang", "Tesla", "Porsche 911"],
    ["Monster truck", "Hearse", "School bus", "Station wagon", "Mini", "Beetle", "Volvo", "BMW", "Ferrari", "Lamborghini"],
  ],
  Songs: [
    ["Baby Shark", "Macarena", "Gangnam Style", "Despacito", "Hey Jude", "Wonderwall", "Africa", "Bohemian Rhapsody", "Mr. Brightside", "Dancing Queen"],
    ["Crazy Frog", "Friday", "Cotton Eye Joe", "Call Me Maybe", "Let It Go", "Yellow", "Hallelujah", "Uptown Funk", "September", "Billie Jean"],
  ],
};

/** Each round's Psychic, the categories they ask, and how far off their guess is. */
const ROUNDS = [
  { categories: ["Animals", "Food", "Movies you've seen"], miss: 0 },
  { categories: ["Drinks", "Holiday spots", "Sports"], miss: 1 },
  { categories: ["Snacks", "Cars", "Songs"], miss: 3 },
];

const beats: Beat[] = [];
const images = new Map<string, string>();

async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
}

test("three players, one phone, a whole game of Wavelength", async () => {
  mkdirSync(OUTPUT, { recursive: true });
  const stage = await openOnePhone("The phone", WEB_URL);
  const narrator = stage.narrator;
  const { page } = stage.phones[0];
  const button = (name: string | RegExp) => page.getByRole("button", { name });
  const heading = (name: string | RegExp) => page.getByRole("heading", { name });

  let act = "Setup";
  const capture = async (title: string, caption: string, fullPage = false, tag?: string) => {
    await narrator?.say(title, caption);
    await settled(page);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 72, fullPage });
    const id = createHash("sha1").update(jpeg).digest("hex").slice(0, 16);
    images.set(id, jpeg.toString("base64"));
    beats.push({ act, title, caption, shots: [{ name: "The phone", tag, image: id }] });
    await page.waitForTimeout(PACE + caption.length * READING_MS_PER_CHAR);
  };
  const type = (label: string, text: string) =>
    page.getByRole("textbox", { name: label }).pressSequentially(text, { delay: TYPING_MS });

  try {
    // ─── Setup ────────────────────────────────────────────────────────────────
    await page.goto("/");
    await expect(button(/Wavelength/)).toBeVisible();
    await capture("The shelf", "Wavelength sits beside Imposter. It has no online version yet, so the whole tile opens the one-phone game.");

    await button(/Wavelength/).click();
    for (const [i, name] of NAMES.entries()) {
      await page.getByRole("textbox", { name: `Name of player ${i + 1}`, exact: true }).fill(name);
    }
    await capture(
      "Three players, one phone",
      "Names, who picks the secret number, and the rules. The app picks the number by default.",
      true,
    );
    await button("Start the game").click();

    const scores = new Map(NAMES.map((n) => [n, 0]));

    for (const [r, plan] of ROUNDS.entries()) {
      const psychic = NAMES[r];
      const givers = [1, 2].map((i) => NAMES[(r + i) % NAMES.length]);
      act = `Round ${r + 1}: ${psychic} is the Psychic`;
      const detailed = r === 0;

      await expect(heading(`${psychic} is the Psychic`)).toBeVisible();
      if (detailed) {
        await capture(
          `${psychic} is the Psychic`,
          `The phone is on the table for everyone. ${givers.join(" and ")} are the Clue Givers and are about to see the number. ${psychic} looks away.`,
        );
      }
      await button("Start the round").click();

      // The Clue Givers see the number, one at a time.
      let secret = 0;
      for (const [g, giver] of givers.entries()) {
        await expect(heading(`Pass the phone to ${giver}`)).toBeVisible();
        if (detailed && g === 0) {
          await capture(`Pass the phone to ${giver}`, "The slip starts face down. Nothing secret is on screen while the phone changes hands.");
        }
        await button(/Tap to see the number/).click();
        const seen = Number(await page.locator(".wl-slip-number mark").innerText());
        if (secret) expect(seen).toBe(secret);
        secret = seen;
        if (detailed && g === 0) {
          await capture(`${giver} reads the number`, `It's ${secret}. ${giver} taps the slip to hide it again and passes the phone on.`, false, "Clue Giver");
        }
        await button(/Done, pass it to/).click();
      }

      // Three categories.
      for (const [c, category] of plan.categories.entries()) {
        await expect(heading(`${psychic}, pick a category`)).toBeVisible();
        const idea = page.locator(".wl-idea", { hasText: new RegExp(`^${category}$`) });
        if (await idea.isVisible()) await idea.click();
        else await type("Category", category);
        if (detailed && c === 1) {
          await capture(
            `${psychic} picks the next category`,
            `Earlier answers stay on screen under the box, so ${psychic} can choose a category that narrows things down. Tapping an idea fills the box.`,
            true,
            "Psychic",
          );
        }
        await button("Ask the Clue Givers").click();

        for (const [g, giver] of givers.entries()) {
          await expect(heading(`Pass the phone to ${giver}`)).toBeVisible();
          if (detailed && c === 0 && g === 0) {
            await capture(`Handing the phone to ${giver}`, `The category is shown, but the number only appears once ${giver} confirms it's them.`);
          }
          await button(new RegExp(`^I.m ${giver}$`)).click();
          await expect(page.locator(".wl-mine-number")).toHaveText(String(secret));
          const answer = TASTES[category][g][secret - 1];
          await type("Your answer", answer);
          if (detailed && c === 0 && g === 0) {
            await capture(`${giver} answers in private`, `A ${secret} out of 10 in ${category}, for ${giver}: "${answer}".`, false, "Clue Giver");
          }
          await button("Lock in my answer").click();
        }

        await expect(page.getByText("The answers are in")).toBeVisible();
        if (detailed || c === 2) {
          const said = givers.map((giver, g) => `${giver}: "${TASTES[category][g][secret - 1]}"`).join(", ");
          await capture(`${category}: the answers`, `Everyone can look now. ${said}.`, true);
        }
        await button(c < 2 ? "Next category" : `Time for ${psychic} to guess`).click();
      }

      // The guess.
      // Off by `miss`, upwards unless that would go past 10.
      const guess = secret + plan.miss <= 10 ? secret + plan.miss : secret - plan.miss;
      await expect(heading(`${psychic}, what’s the number?`)).toBeVisible();
      await button(String(guess)).click();
      await capture(`${psychic} guesses`, `All six answers are on screen to decide from. ${psychic} picks ${guess}.`, true, "Psychic");
      await button(`Guess ${guess}`).click();

      const won = guess === secret;
      await expect(heading(won ? `${psychic} read your minds!` : "The Clue Givers win!")).toBeVisible();
      if (won) scores.set(psychic, scores.get(psychic)! + givers.length);
      else for (const giver of givers) scores.set(giver, scores.get(giver)! + 1);
      for (const row of await page.locator(".wl-standing").all()) {
        const name = await row.locator(".roster-name").innerText();
        await expect(row.locator(".wl-score")).toHaveText(String(scores.get(name)));
      }
      await capture(
        won ? "Read their minds" : "Not quite",
        won
          ? `It was ${secret}. ${psychic} gets 1 point per Clue Giver: +2.`
          : `It was ${secret}, and ${psychic} said ${guess}. Off by ${Math.abs(guess - secret)}, so ${givers.join(" and ")} get 1 point each.`,
        true,
      );

      await button(r < ROUNDS.length - 1 ? `Next round: ${NAMES[r + 1]} is the Psychic` : "See the final scores").click();
    }

    // ─── The end ──────────────────────────────────────────────────────────────
    act = "Final scores";
    const best = Math.max(...scores.values());
    const winners = NAMES.filter((n) => scores.get(n) === best);
    await expect(heading(winners.length === 1 ? `${winners[0]} wins!` : /tie/)).toBeVisible();
    await capture(
      "Everyone has been the Psychic",
      `Final scores, checked against the rules at every step: ${NAMES.map((n) => `${n} ${scores.get(n)}`).join(", ")}.`,
      true,
    );

    // ─── The other way to pick the number ────────────────────────────────────
    act = "Clue Givers choose the number";
    await button("Change players or settings").click();
    await page.locator(".choice-option", { hasText: "The Clue Givers" }).click();
    await button("Start the game").click();
    await expect(page.getByText("Then Ben enters it.")).toBeVisible();
    await capture("The other setting", "This time Ben and Cleo agree on a number between themselves, out of Ana's earshot.");
    await button("Start the round").click();
    await button("7").click();
    await capture("Ben enters it", "Ben types in the number they agreed on. Cleo will see it on the next slip, which is how they check they agreed.", false, "Clue Giver");
    await button("Lock in 7").click();
    await button(/Tap to see the number/).click();
    await expect(page.locator(".wl-slip-number mark")).toHaveText("7");
    await capture("Cleo checks it", "Same 7. From here the round plays exactly as before.", false, "Clue Giver");

    if (!HEADLESS) {
      await narrator?.say("That's the whole game", `Every step was checked as it happened. This window closes in ${HOLD} seconds.`);
      await page.waitForTimeout(HOLD * 1000);
    }
  } finally {
    await closeAll();
  }

  const html = buildReplay(beats, images, new Date(), {
    title: "Wavelength Replay",
    source: "Three players, one phone, real browser",
  });
  writeFileSync(`${OUTPUT}wavelength-replay.html`, html);
  console.log(`\nReplay: ${OUTPUT}wavelength-replay.html (${beats.length} steps)\n`);
});
