import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { WEB_URL } from "../e2e/support/stack";
import { buildReplay, type Beat } from "./replay";
import { TASTES } from "./tastes";
import { closeAll, openOnePhone, settled } from "./windows";

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

/** Each round's Psychic, the categories they ask, and how far off their guess is. */
const ROUNDS = [
  { categories: ["Animals", "Food", "Movies you've seen"], miss: 0 },
  { categories: ["Drinks", "Holiday spots", "Sports"], miss: 1 },
  { categories: ["Snacks", "Cars", "Songs"], miss: 3 },
];

const beats: Beat[] = [];
const images = new Map<string, string>();

test("three players, one phone, a whole game of Wavelength", async () => {
  mkdirSync(OUTPUT, { recursive: true });
  const stage = await openOnePhone("The phone", WEB_URL);
  const narrator = stage.narrator;
  const { page } = stage.phones[0];
  const button = (name: string | RegExp) => page.getByRole("button", { name });
  const heading = (name: string | RegExp) => page.getByRole("heading", { name });

  let act = "Setup";
  const capture = async (title: string, caption: string, fullPage = false, tag?: string, settle = true) => {
    await narrator?.say(title, caption);
    // The reveal is the exception: settle = false catches it mid-air.
    if (settle) await settled(page);
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
      await page.getByRole("button", { name: String(guess), exact: true }).click();
      await capture(`${psychic} guesses`, `All six answers are on screen to decide from. ${psychic} picks ${guess}.`, true, "Psychic");
      await button(`Guess ${guess}`).click();

      const won = guess === secret;
      await expect(heading(won ? `${psychic} read your minds!` : "The Clue Givers win!")).toBeVisible();
      if (won) scores.set(psychic, scores.get(psychic)! + givers.length);
      else for (const giver of givers) scores.set(giver, scores.get(giver)! + 1);
      // The standings are held back until the end of the reveal, and hidden text
      // reads as empty, so wait for the last thing the sequence shows.
      await expect(page.locator(".wl-vs-next")).toBeVisible();
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

    // ─── Out loud, with a number the Clue Givers chose ───────────────────────
    act = "Out loud: nothing to type";
    await button("Change players or settings").click();
    await page.locator(".choice-option", { hasText: "Out loud" }).click();
    await page.locator(".choice-option", { hasText: "The Clue Givers" }).click();
    await expect(page.getByText("Talk it through at the table.")).toBeVisible();
    await capture(
      "A new game, talked out loud",
      "Answers out loud, and the Clue Givers choose the number themselves. The rules card now says categories and answers are spoken.",
      true,
    );
    await button("Start the game").click();
    await expect(page.getByText("Then Ben enters it.")).toBeVisible();
    await button("Start the round").click();
    await page.getByRole("button", { name: "7", exact: true }).click();
    await capture("Ben enters the number", "Ben and Cleo agreed on 7 out of Ana's earshot. Ben taps it in so the app can check Ana's guess.", false, "Clue Giver");
    await button("Lock in 7").click();
    await button(/Tap to see the number/).click();
    await expect(page.locator(".wl-slip-number mark")).toHaveText("7");
    await button("Done, put the phone down").click();

    await expect(page.getByRole("heading", { name: "Talk it out" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await capture(
      "Talk it out",
      "The phone goes on the table and stays awake. Ana names categories out loud, Ben and Cleo answer out loud, three times over. The app records none of it.",
    );
    await button(/Clue Givers: check the number/).click();
    await expect(page.locator(".wl-peek-number")).toHaveText("7");
    await capture("Cleo forgets the number", "A Clue Giver can check it on the table, face down until opened, then tap to hide it again.", false, "Clue Giver");
    await button(/Hide/).click();

    await button("Ana is ready to guess").click();
    await page.getByRole("button", { name: "4", exact: true }).click();
    await button("Guess 4").click();
    await expect(page.getByText("Ana says…")).toBeVisible();
    await page.waitForTimeout(900);
    await capture("The reveal", "Ana's guess goes down on a slip and trembles before it turns over to show the real number.", false, undefined, false);
    await expect(heading("The Clue Givers win!")).toBeVisible({ timeout: 10_000 });
    await capture("Wrong", "It was 7. A red shutter drops, the room shudders, and Ben and Cleo get a point each. A right guess bursts into yellow with paper flying instead.", true);

    if (!HEADLESS) {
      await narrator?.say("That's the whole game", `Every step was checked as it happened. This window closes in ${HOLD} seconds.`);
      // Closing the window early is a fine way to say "seen it", not a failure:
      // every step has already been checked by now.
      await page.waitForTimeout(HOLD * 1000).catch(() => undefined);
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
