import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator } from "@playwright/test";
import { WEB_URL } from "../e2e/support/stack";
import type { Player } from "../e2e/support/table";
import { buildReplay, type Beat, type Shot } from "./replay";
import { closeAll, openTableWithScreen, settled } from "./windows";

// Fibblash, live on your screen against the real server: a main screen on the
// left hosting the room, phones beside it, and a narrator along the bottom
// saying what is going on. `npm run sim:fibblash`. Writes
// sim/output/fibblash-replay.html.
//
// Unlike the other simulations this one does not set the pace: Fibblash runs
// on the server's clocks, so the match moves on by itself exactly as it would
// at a party. The run watches the main screen, and whenever a new phase starts
// it photographs every window, narrates, and has the phones do their part.
// Every step checks what should now be true, so a run that finishes is also a
// test that passed.
//
// SIM_HEADLESS=1 runs without windows. SIM_HOLD is how long the windows stay up
// at the end, in seconds. SIM_PLAYERS is how many phones play, 3 to 5.

const HEADLESS = Boolean(process.env.SIM_HEADLESS);
const HOLD = Number(process.env.SIM_HOLD ?? 20);
const TYPING_MS = HEADLESS ? 0 : 60;
const OUTPUT = fileURLToPath(new URL("./output/", import.meta.url));

const CAST = ["Ana", "Ben", "Cleo", "Dev", "Eli"];
const NAMES = CAST.slice(0, Math.min(CAST.length, Math.max(3, Number(process.env.SIM_PLAYERS ?? 3))));
const COUNT = ["", "one", "two", "three", "four", "five"][NAMES.length];

/** "Ana, Ben and Cleo". */
const listNames = (names: string[]) => `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** What each player writes, in order, for questions with a true answer. Vague
 * enough to be a plausible lie for most blanks. */
const LIES: Record<string, string[]> = {
  Ana: ["a haunted toaster", "pocket lint", "the Eiffel Tower", "a goldfish", "seven", "Belgium", "a spare tyre", "jelly"],
  Ben: ["spaghetti", "the moon", "a tiny hat", "carrots", "Norway", "a kazoo", "forty", "his landlord"],
  Cleo: ["Grandma's recipe", "a llama", "bubble gum", "the post office", "Tuesday", "a velvet glove", "an iceberg", "soap"],
  Dev: ["a parking ticket", "Napoleon", "three socks", "a weather balloon", "twelve", "Portugal", "mayonnaise", "a lost cat"],
  Eli: ["the dentist", "a trampoline", "Mars", "a broken umbrella", "sixty", "Canada", "a waffle iron", "glitter"],
};

/** What each player writes for a creative prompt. */
const JOKES: Record<string, string[]> = {
  Ana: ["I Googled it first", "It's a feature, not a bug", "Bring snacks, it's a long one", "Ask your mother"],
  Ben: ["We've lost the receipt", "Not again, Gary", "That's tomorrow's problem", "Have you tried crying?"],
  Cleo: ["Ten out of ten, no notes", "Legally, I can't say", "Sir, this is a Wendy's", "Only on Tuesdays"],
  Dev: ["My cat signed off on it", "Blame the intern", "It was like that when I got here", "Do it for the vine"],
  Eli: ["Free with every purchase", "Mum says it's my turn", "I have a PowerPoint about this", "Bold of you to assume"],
};

/** Fallbacks, in case a lie turns out to be the real answer (the server
 * refuses those) — unlikely, but a simulation should not fall over on it. */
const SPARES = ["a rubber duck", "the Vatican", "nine hundred", "a lighthouse"];

/** How likely a player is to spot the truth on a truth vote. Random guessing
 * alone finds it about one time in six, so a whole match could pass without
 * anyone being paid for it. */
const TRUTH_ODDS = 0.4;

/** Answer text compared loosely, in case the server tidies spacing or case. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const KIND_STORY: Record<string, { name: string; first: string; again: string }> = {
  "1": {
    name: "Real",
    first:
      "A REAL question: real trivia with a real answer the server knows. Everyone writes a believable lie. The server hides the truth among the lies, and everyone tries to find it.",
    again: "Another REAL question. Lie well, then find the truth.",
  },
  "2": {
    name: "Creative",
    first:
      "A CREATIVE prompt: no right answer at all. Everyone writes the funniest thing they can, and the answers go head to head.",
    again: "Another CREATIVE prompt. Just be funny.",
  },
  "3": {
    name: "Hybrid",
    first:
      "A HYBRID question: real trivia again, but with two votes after the answers. First, which one is true? Then, which one is funniest?",
    again: "Another HYBRID: two votes, truth then laughs.",
  },
};

const beats: Beat[] = [];
const images = new Map<string, string>();

/** A screen's visible text, on one line. */
const text = async (l: Locator) => (await l.innerText()).replace(/\s+/g, " ").trim();

test(`a main screen and ${COUNT} phones play a whole game of Fibblash`, async () => {
  mkdirSync(OUTPUT, { recursive: true });
  const stage = await openTableWithScreen(NAMES, WEB_URL);
  const { screen: tv, phones, narrator } = stage;
  const everyone = [tv, ...phones];
  const tvMain = tv.page.locator("main.fb-tv");
  const button = (p: Player, name: string | RegExp) => p.page.getByRole("button", { name });

  let act = "Setting up";

  async function shot(p: Player): Promise<Shot> {
    await settled(p.page);
    const jpeg = await p.page.screenshot({ type: "jpeg", quality: 72, fullPage: p === tv });
    const id = createHash("sha1").update(jpeg).digest("hex").slice(0, 16);
    images.set(id, jpeg.toString("base64"));
    return p === tv ? { name: p.name, tag: "hosts the room", image: id, wide: true } : { name: p.name, image: id };
  }

  /** Narrates a step and photographs every window. No pause: the match is
   * on the server's clock, and the narration stays up while it runs. */
  async function capture(title: string, caption: string) {
    await narrator?.say(title, caption);
    beats.push({ act, title, caption, shots: await Promise.all(everyone.map(shot)) });
  }

  try {
    // ─── The lobby ───────────────────────────────────────────────────────────
    act = "The lobby";
    await tv.page.goto("/fibblash/screen");
    const code = (await tv.page.locator(".big-code").innerText()).trim();
    await capture(
      "The main screen opens a room",
      `A TV or laptop opens Fibblash with "Host on a big screen". It creates room ${code} by itself and hosts it, but it never plays: it's the show everyone watches.`,
    );

    for (const p of phones) {
      await p.page.goto("/fibblash");
      await p.page.getByLabel("Your name (optional)").pressSequentially(p.name, { delay: TYPING_MS });
      await p.page.getByLabel("Room code").pressSequentially(code, { delay: TYPING_MS });
      await button(p, "Join").click();
      await expect(p.page.locator(".room-code-value")).toHaveText(code);
    }
    await expect(tv.page.locator(".big-roster .roster-row")).toHaveCount(NAMES.length);
    await capture(
      `${COUNT[0].toUpperCase()}${COUNT.slice(1)} phones join`,
      `${listNames(NAMES)} type the code on their own phones. The main screen counts players, not itself, and only it has the start button: it's the host.`,
    );

    await tv.page.locator(".choice", { hasText: "Match length" }).locator(".choice-option", { hasText: /^8 questions$/ }).click();
    await expect(phones[0].page.locator(".setup-readout")).toContainText("8 questions");
    await button(tv, "Start Fibblash").click();
    await expect(tvMain).toBeVisible();

    // ─── The match, phase by phase, as the server runs it ────────────────────
    const seenKinds = new Set<string>();
    const used = new Map(NAMES.map((n) => [n, 0]));
    let clock = "";
    let truthVotes = 0;
    // This question's lies, as locked in. The sim wrote them all, so on the
    // ballot the one answer it did not write is the truth.
    const lies = new Set<string>();
    // Who knowingly picked the truth this question; each must be paid for it.
    const sharp = new Set<string>();
    // The first CREATIVE matchup is voted unanimously, to see a sweep paid.
    let sweep: "planned" | "voting" | "done" = "planned";

    for (let guard = 0; guard < 200; guard++) {
      // Wait for the next phase, whatever it is. The server decides when.
      await expect(tvMain).not.toHaveAttribute("data-clock", clock, { timeout: 60_000 });
      clock = (await tvMain.getAttribute("data-clock")) ?? "";
      const phase = (await tvMain.getAttribute("data-stage")) ?? "";
      const kind = (await tvMain.getAttribute("data-kind")) ?? "";
      const story = KIND_STORY[kind];
      const number = clock.split(":")[0];

      // Every phone is on the same phase as the main screen.
      for (const p of phones) await expect(p.page.locator("main.fb")).toHaveAttribute("data-clock", clock);

      if (phase === "final") {
        act = "The end";
        break;
      }
      act = `Question ${number} of 8: ${story.name}`;

      if (phase === "intro") {
        const prompt = await text(tv.page.locator(".fb-prompt"));
        const first = !seenKinds.has(kind);
        seenKinds.add(kind);
        lies.clear();
        sharp.clear();
        await capture(`Question ${number}: ${story.name}`, `${first ? story.first : story.again} "${prompt}"`);
      } else if (phase === "answer") {
        const pool = kind === "2" ? JOKES : LIES;
        for (const [i, p] of phones.entries()) {
          const n = used.get(p.name)!;
          used.set(p.name, n + 1);
          const answer = await answerWith(p, pool[p.name][n % pool[p.name].length]);
          if (kind !== "2") lies.add(norm(answer));
          if (i === 0) {
            await expect(tv.page.locator('.fb-seat[data-done="true"]')).toHaveCount(1);
            // Who, never what: the main screen does not show the answer.
            await expect(tv.page.locator(".fb-tv-stage")).not.toContainText(answer);
            await capture(
              `${p.name} locks in "${answer}"`,
              `Each phone has its own box with a character counter. ${p.name}'s answer is locked and can't be changed. The main screen lights up ${p.name}'s name, but never shows what they wrote.`,
            );
          }
        }
      } else if (phase === "vote") {
        const question = await text(tv.page.locator(".fb-vote-q"));
        // Nothing on the ballot names who wrote what.
        for (const name of NAMES) await expect(tv.page.locator(".fb-board")).not.toContainText(name);
        let caption: string;
        let truthVote = false;
        let target: string | null = null;
        if (kind === "2") {
          const board = await text(tv.page.locator(".fb-board"));
          caption =
            NAMES.length === 3
              ? "Three answers make one three-way matchup. Each author votes for one of the other two; their own answer is greyed out on their phone."
              : `${NAMES.length} answers split into a pair and a three-way, voted one matchup at a time. A pair's authors sit their own matchup out; everyone else picks a favourite. Up now: ${board}`;
          if (sweep === "planned") {
            sweep = "voting";
            target = await text(tv.page.locator(".fb-board .fb-choice-text").first());
            caption += ` This time everyone who can will pick "${target}", to earn it a sweep.`;
          }
        } else if (question.includes("funniest")) {
          caption =
            "The same answers again, the truth still among them, now for laughs: +250 per funny vote. The truth stays hidden until both votes are in.";
        } else {
          truthVote = true;
          truthVotes++;
          caption =
            truthVotes === 1
              ? "Every lie and the truth, shuffled, with no names. Each phone greys out its owner's own lie. +1000 for finding the truth, +500 for every player your lie fools."
              : "Find the truth. Your own lie is greyed out.";
        }
        await capture(question, caption);
        for (const p of phones) {
          if (truthVote && Math.random() < TRUTH_ODDS) {
            await vote(p, (t) => !lies.has(norm(t)));
            sharp.add(p.name);
          } else if (target !== null) {
            await vote(p, (t) => t === target);
          } else {
            await vote(p);
          }
        }
      } else if (phase === "matchupResult") {
        const won = tv.page.locator('.fb-reveal-item[data-won="true"] .fb-reveal-text');
        const winner = (await won.count()) > 0 ? await text(won.first()) : "";
        const points = await awardsLine(tv);
        let swept = "";
        if (sweep === "voting") {
          sweep = "done";
          await expect(tv.page.locator(".fb-award-why", { hasText: "Took every vote!" })).toHaveCount(1);
          swept = " Every vote it could get went one way, so its author gets the +500 sweep bonus.";
        }
        await capture(
          winner ? `"${winner}" wins the matchup` : "Nobody won the matchup",
          `Now the names come out: who wrote each answer and who voted for it.${swept} ${points}`,
        );
      } else if (phase === "result") {
        const truth = await text(tv.page.locator(".fb-truth-text"));
        // Everyone who knowingly picked the truth was paid for it.
        for (const name of sharp) {
          const row = tv.page.locator(".fb-award", { has: tv.page.locator(".roster-name", { hasText: name }) });
          await expect(row.locator(".fb-award-why")).toContainText("Found the truth");
        }
        const points = await awardsLine(tv);
        await capture(
          `The truth: "${truth}"`,
          `The lies come first, each with its author and who fell for it. Then the truth, with where the fact comes from. ${points}`,
        );
      } else if (phase === "leaderboard") {
        const rows = await tv.page.locator(".fb-standing").allInnerTexts();
        const standings = rows.map((r) => r.replace(/\s+/g, " ").trim()).join(" · ");
        // Each phone's score pill agrees with the main screen.
        for (const p of phones) {
          const row = tv.page.locator(".fb-standing", { hasText: p.name });
          const score = (await row.locator(".fb-score").innerText()).trim();
          await expect(p.page.locator(".fb-bar .pill")).toHaveText(`${score} pts`);
        }
        await capture(
          `After question ${number}`,
          `One leaderboard across every kind of question, with a star for whoever scored most this round. ${standings}`,
        );
      }
    }

    // ─── The end ─────────────────────────────────────────────────────────────
    expect([...seenKinds].sort()).toEqual(["1", "2", "3"]);
    expect(sweep).toBe("done");
    const headline = await text(tv.page.locator(".fb-final-headline"));
    for (const p of phones) await expect(p.page.locator(".fb-final-headline")).toHaveText(headline);
    await capture(
      headline,
      "Eight questions, all three kinds mixed at random, one running score. A tie would name everyone in it rather than pick at random. Only the host can close the scores.",
    );

    await button(tv, "Back to the lobby").click();
    await expect(tv.page.locator(".big-code")).toHaveText(code);
    for (const p of phones) await expect(p.page.locator(".room-code-value")).toHaveText(code);
    await capture(
      "Back to the lobby",
      "Same room, same code, same players: ready for another game.",
    );

    if (!HEADLESS) {
      await narrator?.say("That's the whole game", `Every step was checked as it happened. These windows close in ${HOLD} seconds.`);
      await tv.page.waitForTimeout(HOLD * 1000);
    }
  } finally {
    await closeAll();
  }

  const html = buildReplay(beats, images, new Date(), {
    title: "Fibblash Replay",
    source: `A main screen and ${COUNT} phones against the real server`,
  });
  writeFileSync(`${OUTPUT}fibblash-replay.html`, html);
  console.log(`\nReplay: ${OUTPUT}fibblash-replay.html (${beats.length} steps)\n`);

  /** Types an answer on one phone and locks it in, falling back to a spare if
   * the server says it is secretly the true answer. */
  async function answerWith(p: Player, answer: string): Promise<string> {
    const box = p.page.getByRole("textbox", { name: /Your lie|Your answer/ });
    for (const attempt of [answer, ...SPARES]) {
      await box.fill("");
      await box.pressSequentially(attempt, { delay: TYPING_MS });
      await button(p, "Lock it in").click();
      const locked = p.page.locator(".fb-locked");
      const refused = p.page.getByText("That’s the real answer!");
      await expect(locked.or(refused)).toBeVisible();
      if (await locked.isVisible()) return attempt;
    }
    throw new Error(`${p.name} could not find an answer that wasn't the truth`);
  }

  /** One phone votes for the first answer it may pick whose text passes
   * `want`, or for any answer it may pick, at random, when there is no `want`
   * or none passes (say, the wanted answer is its own). A phone with no vote
   * here does nothing. A wanted answer that is nowhere on the ballot fails. */
  async function vote(p: Player, want?: (text: string) => boolean) {
    const cast = button(p, "Vote for this one");
    if (!(await cast.isVisible())) return;
    const options = await p.page.locator("button.fb-choice:not([disabled])").all();
    const texts = await Promise.all(options.map((o) => text(o.locator(".fb-choice-text"))));
    let pick = want ? texts.findIndex(want) : -1;
    if (pick < 0) {
      const anywhere = await p.page.locator("button.fb-choice .fb-choice-text").allInnerTexts();
      if (want && !anywhere.some((t) => want(t.replace(/\s+/g, " ").trim()))) {
        throw new Error(`${p.name} cannot find the answer they want on the ballot: ${anywhere.join(" / ")}`);
      }
      pick = Math.floor(Math.random() * options.length);
    }
    await options[pick].click();
    await cast.click();
    await expect(p.page.getByText("Vote locked in")).toBeVisible();
  }

  /** "Points: Ana +1500 (Found the truth · Fooled 1), ..." from the reveal. */
  async function awardsLine(p: Player): Promise<string> {
    const rows = await p.page.locator(".fb-award").all();
    if (rows.length === 0) return "Nobody scored on this one.";
    const parts: string[] = [];
    for (const row of rows) {
      const name = await text(row.locator(".roster-name"));
      const why = await text(row.locator(".fb-award-why"));
      // A count of one is singular.
      expect(why).not.toMatch(/\b1 votes\b/);
      const delta = await text(row.locator(".fb-delta"));
      parts.push(`${name} ${delta} (${why})`);
    }
    return `Points: ${parts.join(", ")}.`;
  }
});
