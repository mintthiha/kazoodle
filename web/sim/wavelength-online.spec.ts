import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { WEB_URL } from "../e2e/support/stack";
import { pickOption, seatTable, type Player } from "../e2e/support/table";
import { buildReplay, type Beat, type Shot } from "./replay";
import { TASTES } from "./tastes";
import { closeAll, openTable, settled, type Narrator } from "./windows";

// Online Wavelength, three phones in one room, live on your screen against the real
// server: `npm run sim:wavelength:online`. Every step asserts what should now be
// true, so a run that finishes is also a test that passed. Writes
// sim/output/wavelength-online-replay.html.
//
// SIM_PACE, SIM_HOLD and SIM_HEADLESS work as in simulation.spec.ts.

const HEADLESS = Boolean(process.env.SIM_HEADLESS);
const PACE = Number(process.env.SIM_PACE ?? (HEADLESS ? 50 : 1500));
const HOLD = Number(process.env.SIM_HOLD ?? 20);
const READING_MS_PER_CHAR = HEADLESS ? 0 : 40;
const TYPING_MS = HEADLESS ? 0 : 70;
const OUTPUT = fileURLToPath(new URL("./output/", import.meta.url));

const NAMES = ["Ana", "Ben", "Cleo"];

/** Each round's categories, and how far off the Psychic's guess lands. Round r's
 * Psychic is NAMES[r]: everyone takes a turn, in the order they joined. */
const ROUNDS = [
  { categories: ["Animals", "Food", "Movies you've seen"], miss: 0 },
  { categories: ["Drinks", "Holiday spots", "Sports"], miss: 1 },
  { categories: ["Snacks", "Cars", "Songs"], miss: 3 },
];

const beats: Beat[] = [];
const images = new Map<string, string>();

test("three phones, one room, a whole game of Wavelength", async () => {
  mkdirSync(OUTPUT, { recursive: true });
  const stage = await openTable(NAMES, WEB_URL);
  const players = stage.phones;
  const narrator: Narrator | null = stage.narrator;
  const [ana, ben, cleo] = players;
  const byName = (name: string) => players.find((p) => p.name === name)!;
  const button = (p: Player, name: string | RegExp) => p.page.getByRole("button", { name });
  const heading = (p: Player, name: string | RegExp) => p.page.getByRole("heading", { name });
  const key = (p: Player, n: number) => p.page.getByRole("button", { name: String(n), exact: true });
  const pause = (ms = PACE) => ana.page.waitForTimeout(ms);

  let act = "The lobby";
  let psychic = "";
  const tagFor = (p: Player) => (psychic === "" ? undefined : p.name === psychic ? "Psychic" : "Clue Giver");

  async function shot(p: Player, settle: boolean): Promise<Shot> {
    if (settle) await settled(p.page);
    const jpeg = await p.page.screenshot({ type: "jpeg", quality: 72 });
    const id = createHash("sha1").update(jpeg).digest("hex").slice(0, 16);
    images.set(id, jpeg.toString("base64"));
    return { name: p.name, tag: tagFor(p), image: id };
  }

  /** Narrates a step and photographs every phone. `settle: false` catches the
   * reveal mid-air instead of waiting for it to land. */
  const capture = async (title: string, caption: string, settle = true) => {
    await narrator?.say(title, caption);
    await Promise.all(
      players.map((p) => {
        const tag = tagFor(p);
        return p.page.evaluate((t) => {
          document.title = t;
        }, tag ? `${p.name} · ${tag}` : p.name);
      }),
    );
    beats.push({ act, title, caption, shots: await Promise.all(players.map((p) => shot(p, settle))) });
    await pause(PACE + caption.length * READING_MS_PER_CHAR);
  };

  const type = (p: Player, label: string, text: string) =>
    p.page.getByRole("textbox", { name: label }).pressSequentially(text, { delay: TYPING_MS });

  /** Opens a Clue Giver's number, reads it, and leaves it open for a photo. */
  async function peek(p: Player): Promise<number> {
    await button(p, /Show my number/).click();
    return Number(await p.page.locator(".wl-peek-number mark").innerText());
  }
  const hide = (p: Player) => button(p, /Hide/).click();

  try {
    // ─── Lobby ───────────────────────────────────────────────────────────────
    const code = await seatTable(players, "/wavelength");
    await expect(ben.page.locator(".setup-readout")).toContainText("Typed in");
    await capture(
      "Three phones, one room",
      `Ana made room ${code}, and Ben and Cleo joined it from their own phones. Ana hosts, so only Ana's lobby has controls; Ben and Cleo see a read-out of the host's picks.`,
    );

    const totals = new Map(NAMES.map((n) => [n, 0]));
    await button(ana, "Start Wavelength").click();

    // ─── Three rounds, typed ─────────────────────────────────────────────────
    for (const [r, round] of ROUNDS.entries()) {
      psychic = NAMES[r];
      const ps = byName(psychic);
      // Round the table from the Psychic, in join order.
      const givers = [1, 2].map((i) => byName(NAMES[(r + i) % 3]));
      act = `Round ${r + 1}: ${psychic} is the Psychic`;
      const full = r === 0; // the first round is told step by step, the rest briefly

      await expect(ps.page.getByText("You’re the Psychic")).toBeVisible();
      await expect(ps.page.locator(".wl-peek")).toHaveCount(0);
      const secret = await peek(givers[0]);
      expect(await peek(givers[1])).toBe(secret);
      if (full) {
        await capture(
          "Everyone gets a role",
          `${psychic}'s phone says ${psychic} is the Psychic, and has no number on it. ${givers[0].name} and ${givers[1].name} each tap to see theirs: it's ${secret}, the same on both. The server only ever sent it to them.`,
        );
      }
      await Promise.all(givers.map(hide));

      for (const [c, category] of round.categories.entries()) {
        await type(ps, "Category", category);
        if (full && c === 0) {
          await capture(
            `${psychic} names a category`,
            `While ${psychic} types, ${givers[0].name} and ${givers[1].name} are told a category is being picked. Their numbers stay face down.`,
          );
        }
        await button(ps, "Ask the Clue Givers").click();

        const [first, second] = [0, 1].map((i) => TASTES[category][i][secret - 1]);
        await type(givers[0], "Your answer", first);
        if (full && c === 0) {
          await capture(
            "Both answer at once, in private",
            `"${category}" lands on both Clue Givers' phones together, each with their number. ${givers[0].name} types "${first}" for a ${secret}.`,
          );
        }
        await button(givers[0], "Lock in my answer").click();
        await expect(ps.page.getByText("1 of 2 answered")).toBeVisible();
        await expect(ps.page.getByText(first)).toHaveCount(0);
        await expect(givers[1].page.getByText(first)).toHaveCount(0);
        if (full && c === 0) {
          await capture(
            "One in, nothing shown",
            `Everyone sees "1 of 2 answered", but not what ${givers[0].name} said: not ${psychic}, and not ${givers[1].name}, so it can't steer their answer.`,
          );
        }

        await type(givers[1], "Your answer", second);
        await button(givers[1], "Lock in my answer").click();
        for (const p of players) {
          await expect(p.page.locator(".wl-cat", { hasText: category })).toContainText(first);
          await expect(p.page.locator(".wl-cat", { hasText: category })).toContainText(second);
        }
        if (full || c === 2) {
          await capture(
            `${category}: the answers`,
            `${givers[1].name} answered "${second}", the last one in, so both answers appear on all three phones at the same moment.` +
              (c < 2 ? ` ${psychic}'s screen goes straight to the next category, with the answers under it.` : ""),
          );
        }
      }

      // The guess.
      await expect(heading(givers[0], `${psychic} is guessing…`)).toBeVisible();
      const guess = secret + round.miss <= 10 ? secret + round.miss : secret - round.miss;
      await key(ps, guess).click();
      if (full) {
        await capture(
          `${psychic} guesses`,
          `All six answers are on ${psychic}'s screen to decide from. The others wait on "${psychic} is guessing…". ${psychic} picks ${guess}.`,
        );
      }
      await button(ps, `Guess ${guess}`).click();
      await expect(ben.page.locator(".wl-vs")).toBeVisible();
      if (full) {
        await capture(
          "The reveal, on every phone",
          `All three phones play the reveal together: ${psychic}'s ${guess} trembles on a slip, then turns over.`,
          false,
        );
      }

      const won = round.miss === 0;
      if (won) {
        totals.set(psychic, totals.get(psychic)! + 2);
      } else {
        for (const g of givers) totals.set(g.name, totals.get(g.name)! + 1);
      }
      for (const p of players) {
        await expect(heading(p, won ? `${psychic} read your minds!` : "The Clue Givers win!")).toBeVisible();
        for (const [name, total] of totals) {
          await expect(p.page.locator(".wl-standing", { hasText: name }).locator(".wl-score")).toHaveText(
            String(total),
          );
        }
      }
      const standings = NAMES.map((n) => `${n} ${totals.get(n)}`).join(", ");
      await capture(
        won ? "Read their minds" : "Not quite",
        won
          ? `It was ${secret}. ${psychic} gets a point per Clue Giver: +2. Standings: ${standings}.`
          : `It was ${secret}, and ${psychic} said ${guess}. ${givers[0].name} and ${givers[1].name} get a point each. Standings: ${standings}.`,
      );

      if (r < ROUNDS.length - 1) {
        // Anyone can move the table on; here it's whoever was not the Psychic.
        await button(givers[1], `Next round: ${NAMES[r + 1]} is the Psychic`).click();
        await expect(byName(NAMES[r + 1]).page.getByText("You’re the Psychic")).toBeVisible();
      }
    }

    // ─── The end of the match ────────────────────────────────────────────────
    act = "Final scores";
    const best = Math.max(...totals.values());
    const top = NAMES.filter((n) => totals.get(n) === best);
    await expect(ana.page.locator(".wl-vs-result .wl-lead")).toContainText(top[0]);
    await capture(
      "Everyone has been the Psychic",
      `Three rounds, one each. The last result names the winner (${top.join(" and ")}), and its button goes back to the lobby.`,
    );
    await button(ana, "Back to the lobby").click();
    psychic = "";
    for (const p of players) await expect(p.page.locator(".room-code-value")).toHaveText(code);

    // ─── Out loud, with a chosen number ──────────────────────────────────────
    act = "Out loud, a number they choose";
    await pickOption(ana, "How do the Clue Givers answer?", "Out loud");
    await pickOption(ana, "Who picks the secret number?", "The Clue Givers");
    await expect(ben.page.locator(".setup-readout")).toContainText("Out loud");
    await expect(ben.page.locator(".setup-readout")).toContainText("The Clue Givers");
    await capture(
      "Same room, other options",
      "Back in the lobby with the same three. Ana switches to answers out loud, and to the Clue Givers picking the number. Ben's and Cleo's read-outs follow along live.",
    );

    await button(ana, "Start Wavelength").click();
    psychic = "Ana";
    await expect(heading(ana, /No listening/)).toBeVisible();
    await expect(heading(cleo, /Ben enters it/)).toBeVisible();
    await key(ben, 4).click();
    await capture(
      "Ben enters the agreed number",
      "Ben and Cleo agree on a number where Ana can't hear. Ben is first round the table from Ana, so Ben's phone gets the number pad; Cleo's says Ben will enter it, and Ana's says not to listen.",
    );
    await button(ben, "Lock in 4").click();

    await expect(heading(cleo, "Talk it out")).toBeVisible();
    expect(await peek(cleo)).toBe(4);
    await capture(
      "Talk it out",
      "Everything happens out loud now. Each phone shows the steps, and the screen stays awake. Cleo checks the number on their own phone: 4, the one Ben entered. Only Ana has the button to move on.",
    );
    await hide(cleo);

    await button(ana, "I’m ready to guess").click();
    await key(ana, 4).click();
    await button(ana, "Guess 4").click();
    await expect(heading(ben, "Ana read your minds!")).toBeVisible();
    await capture(
      "A spoken round, scored",
      "Nothing was typed but the number and the guess. Ana got it, and takes +2 in this new game's standings.",
    );

    if (!HEADLESS) {
      await narrator?.say(
        "That's the whole game",
        `Every step was checked as it happened. These windows close in ${HOLD} seconds.`,
      );
      await pause(HOLD * 1000);
    }
  } finally {
    await closeAll();
  }

  const html = buildReplay(beats, images, new Date(), {
    title: "Wavelength Online Replay",
    source: "Three phones against the real server",
  });
  writeFileSync(`${OUTPUT}wavelength-online-replay.html`, html);
  console.log(`\nReplay: ${OUTPUT}wavelength-online-replay.html (${beats.length} steps)\n`);
});
