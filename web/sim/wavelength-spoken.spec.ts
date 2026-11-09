import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { WEB_URL } from "../e2e/support/stack";
import { buildReplay, type Beat } from "./replay";
import { TASTES } from "./tastes";
import { closeAll, openOnePhone, settled } from "./windows";

// One-phone Wavelength with the answers said out loud: `npm run sim:wavelength:spoken`.
// Nobody types anything. The phone deals the number, lies on the table while the
// table talks, and takes the guess. The narrator carries what is said, since the app
// never hears it. Writes sim/output/wavelength-spoken-replay.html.
//
// SIM_PACE, SIM_HOLD and SIM_HEADLESS work as in simulation.spec.ts.

const HEADLESS = Boolean(process.env.SIM_HEADLESS);
// Slower than the typed run by default: most of this game happens in the narration,
// so there's more to read and less to watch.
const PACE = Number(process.env.SIM_PACE ?? (HEADLESS ? 50 : 3000));
const HOLD = Number(process.env.SIM_HOLD ?? 20);
const READING_MS_PER_CHAR = HEADLESS ? 0 : 75;
// The pause before each tap, read by windows.ts when it opens the browser.
process.env.SIM_SLOWMO ??= "500";
const OUTPUT = fileURLToPath(new URL("./output/", import.meta.url));

const NAMES = ["Ana", "Ben", "Cleo"];

/** Each round's categories, and how far off the Psychic's guess is. */
const ROUNDS = [
  { categories: ["Animals", "Food", "Songs"], miss: 0 },
  { categories: ["Drinks", "Holiday spots", "Cars"], miss: 1 },
  { categories: ["Snacks", "Sports", "Movies you've seen"], miss: 3 },
];

/** Moments in the reveal worth stopping on, in milliseconds from its start. They
 * follow --t-flip (1.5s) and --t-hit (2.15s) in wavelength.css. */
const SUSPENSE_MS = 900;
const IMPACT_MS = 2350;

const beats: Beat[] = [];
const images = new Map<string, string>();

/** Stops every animation on the page at the same moment of the reveal. Its pieces all
 * start together when the result screen appears, so one time fits them all. */
async function freezeAt(page: Page, ms: number) {
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);
}

/** Lets a frozen reveal run on. An animation already past its end is finished rather
 * than played, because play() on a finished animation starts it again from zero. */
async function unfreeze(page: Page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const end = Number(a.effect?.getComputedTiming().endTime ?? Infinity);
      if (Number(a.currentTime) >= end) a.finish();
      else a.play();
    }
  });
}

test("three players, one phone, Wavelength out loud", async () => {
  mkdirSync(OUTPUT, { recursive: true });
  const stage = await openOnePhone("The phone", WEB_URL);
  const narrator = stage.narrator;
  const { page } = stage.phones[0];
  const button = (name: string | RegExp) => page.getByRole("button", { name });
  const heading = (name: string | RegExp) => page.getByRole("heading", { name });
  const nothingToType = () => expect(page.getByRole("textbox")).toHaveCount(0);

  let act = "Setup";
  const capture = async (title: string, caption: string, fullPage = false, tag?: string, settle = true) => {
    await narrator?.say(title, caption);
    if (settle) await settled(page);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 72, fullPage });
    const id = createHash("sha1").update(jpeg).digest("hex").slice(0, 16);
    images.set(id, jpeg.toString("base64"));
    beats.push({ act, title, caption, shots: [{ name: "The phone", tag, image: id }] });
    await page.waitForTimeout(PACE + caption.length * READING_MS_PER_CHAR);
  };

  try {
    // ─── Setup ────────────────────────────────────────────────────────────────
    await page.goto("/");
    await page.locator(".tile-card", { hasText: "Wavelength" }).getByRole("button", { name: "Play on one phone" }).click();
    for (const [i, name] of NAMES.entries()) {
      await page.getByRole("textbox", { name: `Name of player ${i + 1}`, exact: true }).fill(name);
    }
    await page.locator(".choice-option", { hasText: "Out loud" }).click();
    await expect(page.getByText("Talk it through at the table.")).toBeVisible();
    await capture(
      "Out loud, the app picks the number",
      "The names are the last thing anyone types. With answers out loud, the rules card says categories and answers are spoken, and the app only deals the number and takes the guess.",
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
      await nothingToType();
      if (detailed) {
        await capture(
          `${psychic} is the Psychic`,
          `The app has drawn a number. ${givers.join(" and ")} will each see it in turn while ${psychic} looks away.`,
        );
      }
      await button("Start the round").click();

      // The Clue Givers see the number, one at a time. The last one puts the phone down.
      let secret = 0;
      for (const [g, giver] of givers.entries()) {
        await expect(heading(`Pass the phone to ${giver}`)).toBeVisible();
        await button(/Tap to see the number/).click();
        const seen = Number(await page.locator(".wl-slip-number mark").innerText());
        if (secret) expect(seen).toBe(secret);
        secret = seen;
        const last = g === givers.length - 1;
        if (detailed) {
          await capture(
            `${giver} sees the number`,
            last
              ? `${giver} sees ${secret} too. As the last Clue Giver, the button says to put the phone down, not to pass it on.`
              : `It's ${secret}. ${giver} hides it again and passes the phone to ${givers[g + 1]}.`,
            false,
            "Clue Giver",
          );
        }
        await button(last ? "Done, put the phone down" : /Done, pass it to/).click();
      }

      // The talking. The phone shows the same screen the whole time.
      await expect(heading("Talk it out")).toBeVisible();
      await nothingToType();
      if (detailed) {
        await capture(
          "The phone goes on the table",
          `It shows the three steps and stays awake. From here until the guess, everything happens out loud.`,
        );
      }
      const lines = plan.categories.map((category) => {
        const said = givers.map((giver, g) => `${giver}: "${TASTES[category][g][secret - 1]}"`).join(" ");
        return { category, line: `${psychic}: "${category}." ${said}` };
      });
      if (detailed) {
        for (const [c, { category, line }] of lines.entries()) {
          await capture(`Out loud: ${category}`, `${line}${c === 0 ? ` (each one a ${secret} out of 10 for them)` : ""}`);
        }
      } else {
        await capture("Out loud", lines.map(({ line }) => line).join("  ·  "));
      }

      if (r === 1) {
        // Someone always forgets.
        await button(/Clue Givers: check the number/).click();
        await expect(page.locator(".wl-peek-number")).toHaveText(String(secret));
        await capture(
          `${givers[1]} forgets the number`,
          `Halfway through, ${givers[1]} checks it on the table, face down until opened, then taps to hide it again before ${psychic} looks back.`,
          false,
          "Clue Giver",
        );
        await button(/Hide/).click();
        await expect(page.locator(".wl-peek-number")).toHaveCount(0);
      }

      // The guess, from memory: nothing was written down.
      const guess = secret + plan.miss <= 10 ? secret + plan.miss : secret - plan.miss;
      await button(`${psychic} is ready to guess`).click();
      await expect(heading(`${psychic}, what’s the number?`)).toBeVisible();
      await nothingToType();
      await page.getByRole("button", { name: String(guess), exact: true }).click();
      if (detailed) {
        await capture(
          `${psychic} guesses`,
          `No answers on screen in this mode: ${psychic} goes from memory. ${psychic} taps ${guess}.`,
          true,
          "Psychic",
        );
      }
      await button(`Guess ${guess}`).click();

      // The reveal, stopped twice on the way so each moment can be seen.
      const won = guess === secret;
      await expect(page.getByText(`${psychic} says…`)).toBeVisible();
      await freezeAt(page, SUSPENSE_MS);
      await capture(
        `${psychic} says ${guess}…`,
        "The guess goes down on a slip and trembles. It's about to turn over and show the real number.",
        false,
        undefined,
        false,
      );
      await freezeAt(page, IMPACT_MS);
      await capture(
        won ? "Right!" : "Wrong!",
        won
          ? `It turns to ${secret}. The screen bursts into yellow and paper flies.`
          : `It turns to ${secret}. A red shutter drops and the screen shudders.`,
        false,
        undefined,
        false,
      );
      await unfreeze(page);

      await expect(heading(won ? `${psychic} read your minds!` : "The Clue Givers win!")).toBeVisible();
      if (won) scores.set(psychic, scores.get(psychic)! + givers.length);
      else for (const giver of givers) scores.set(giver, scores.get(giver)! + 1);
      // Hidden text reads as empty, so wait for the last thing the reveal shows.
      await expect(page.locator(".wl-vs-next")).toBeVisible();
      for (const row of await page.locator(".wl-standing").all()) {
        const name = await row.locator(".roster-name").innerText();
        await expect(row.locator(".wl-score")).toHaveText(String(scores.get(name)));
      }
      await capture(
        won ? `${psychic} read their minds` : "The Clue Givers win",
        won
          ? `It was ${secret}. ${psychic} gets 1 point per Clue Giver: +2.`
          : `It was ${secret}, and ${psychic} said ${guess}. ${givers.join(" and ")} get 1 point each.`,
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
      "A whole game, nothing typed",
      `After the names, every tap was a number or a button. Final scores: ${NAMES.map((n) => `${n} ${scores.get(n)}`).join(", ")}.`,
      true,
    );

    if (!HEADLESS) {
      await narrator?.say("That's the whole game", `Every step was checked as it happened. This window closes in ${HOLD} seconds.`);
      // Closing the window early is a fine way to say "seen it", not a failure.
      await page.waitForTimeout(HOLD * 1000).catch(() => undefined);
    }
  } finally {
    await closeAll();
  }

  const html = buildReplay(beats, images, new Date(), {
    title: "Wavelength Out Loud",
    source: "Three players, one phone, answers out loud, real browser",
  });
  writeFileSync(`${OUTPUT}wavelength-spoken-replay.html`, html);
  console.log(`\nReplay: ${OUTPUT}wavelength-spoken-replay.html (${beats.length} steps)\n`);
});
