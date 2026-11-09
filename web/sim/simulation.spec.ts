import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { BUILD_URL, WEB_URL } from "../e2e/support/stack";
import {
  castVote,
  currentSpeaker,
  dropConnection,
  pickOption,
  readRole,
  restoreConnection,
  seatTable,
  type Player,
  type Role,
} from "../e2e/support/table";
import { buildReplay, type Beat, type Shot } from "./replay";
import { closeAll, measureWindows, openOnePhone, openTable, settled, type Narrator } from "./windows";

// A whole party, played live on your screen against the real server: `npm run sim`.
//
// Every player is their own browser window, tiled across the screen, with a narrator
// along the bottom saying what is going on. Every step asserts what should now be true,
// so a run that finishes is also a test that passed.
//
// SIM_PACE sets the pause between steps in milliseconds, on top of time to read the
// narration. SIM_HOLD is how long the windows stay open at the end, in seconds.
// SIM_HEADLESS=1 hides the windows and does not wait.

const HEADLESS = Boolean(process.env.SIM_HEADLESS);
const PACE = Number(process.env.SIM_PACE ?? (HEADLESS ? 50 : 1500));
const HOLD = Number(process.env.SIM_HOLD ?? 30);
/** Roughly how fast people read, so a long sentence stays up long enough. */
const READING_MS_PER_CHAR = HEADLESS ? 0 : 45;
const TYPING_MS = HEADLESS ? 0 : 90;
const OUTPUT = fileURLToPath(new URL("./output/", import.meta.url));
const NAMES = ["Ana", "Ben", "Cleo", "Dov", "Eli", "Fay", "Gus"];

// Plausible for a food word without being any particular one, and none contains a
// player's name, so they cannot be mistaken for one on screen.
const CLUES = [
  "tasty", "kitchen", "dinner", "snack", "plate", "hungry", "fork", "recipe", "picnic", "menu",
  "dish", "bite", "oven", "lunch", "market", "salty", "sweet", "crumbs", "feast", "pantry",
  "chew", "spicy", "buffet", "leftovers", "napkin", "table", "serving", "savory", "brunch",
  "ingredient", "cooked", "portion", "grocery", "stove", "breakfast",
];

const beats: Beat[] = [];
const images = new Map<string, string>();

function save(jpeg: Buffer): string {
  const id = createHash("sha1").update(jpeg).digest("hex").slice(0, 16);
  images.set(id, jpeg.toString("base64"));
  return id;
}

async function shot(
  page: Page,
  name: string,
  tag: string | undefined,
  fullPage: boolean,
  settle = true,
): Promise<Shot> {
  if (settle) await settled(page);
  const jpeg = await page.screenshot({ type: "jpeg", quality: 72, fullPage });
  return { name, tag, image: save(jpeg) };
}

const pause = (page: Page, ms = PACE) => page.waitForTimeout(ms);

/** Puts each player's name and role in their window's title bar, so that someone
 * watching can see who is who. A reload resets it, so it is set at every step. */
async function nameWindow(p: Player, tag: string | undefined) {
  const title = tag ? `${p.name} · ${tag}` : p.name;
  await p.page.evaluate((t) => {
    document.title = t;
  }, title);
}

function tagFor(role: Role | undefined): string | undefined {
  if (!role) return undefined;
  return role.isImposter ? "imposter" : "crew";
}

async function readStandings(page: Page): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const row of await page.locator(".standings .roster-row").all()) {
    const name = (await row.locator(".roster-name").innerText()).split(/\s|\n/)[0];
    out.set(name, Number(await row.locator(".score-total").innerText()));
  }
  return out;
}

/** The table of seven online: one match, played to the end. */
async function playOnlineMatch() {
  const act = "Online, seven phones";
  const stage = await openTable(NAMES, WEB_URL);
  const players = stage.phones;
  const narrator: Narrator | null = stage.narrator;
  if (process.env.SIM_CHECK_WINDOWS) {
    console.log(JSON.stringify(await measureWindows(stage), null, 1));
    return;
  }
  const byName = (name: string) => players.find((p) => p.name === name)!;
  const [ana] = players;

  let roles = new Map<string, Role>();
  const capture = async (title: string, caption: string, opts: { fullPage?: boolean; only?: Player[] } = {}) => {
    await narrator?.say(title, caption);
    await Promise.all(players.map((p) => nameWindow(p, tagFor(roles.get(p.name)))));
    const who = opts.only ?? players;
    const shots = await Promise.all(
      who.map((p) => shot(p.page, p.name, tagFor(roles.get(p.name)), opts.fullPage ?? false)),
    );
    beats.push({ act, title, caption, shots });
    await pause(ana.page, PACE + caption.length * READING_MS_PER_CHAR);
  };

  const code = await seatTable(players);
  await expect(ana.page.locator(".choice", { hasText: "Imposters at 7+ players" })).toBeVisible();
  await pickOption(ana, "Category", "Food");
  await pickOption(ana, "Clues per player", "1");
  await pickOption(ana, "Time per clue", "30s");
  await expect(byName("Ben").page.locator(".setup-readout")).toContainText("Two imposters");
  await capture(
    "Seven players in one room",
    `Room ${code}. At seven players the host gets a choice of one or two imposters, and two is the default. The new rule is on everyone's rules card.`,
  );

  const totals = new Map(NAMES.map((n) => [n, 0]));
  const words: string[] = [];
  let clueIndex = 0;

  /** Everyone turns their slip over and confirms it, starting a round. */
  async function dealRound(title: string): Promise<{ imposters: Player[]; crew: Player[]; word: string }> {
    roles = new Map();
    for (const p of players) roles.set(p.name, await readRole(p, false));
    const imposters = players.filter((p) => roles.get(p.name)!.isImposter);
    const crew = players.filter((p) => !imposters.includes(p));
    const word = roles.get(crew[0].name)!.word;

    expect(imposters, "seven players should mean two imposters").toHaveLength(2);
    expect(roles.get(imposters[0].name)!.partnerLine).toBe(`Your partner: ${imposters[1].name}`);
    expect(roles.get(imposters[1].name)!.partnerLine).toBe(`Your partner: ${imposters[0].name}`);
    for (const p of crew) expect(roles.get(p.name)!.word).toBe(word);
    expect(words, "a match should not deal the same word twice").not.toContain(word);
    words.push(word);

    await capture(
      title,
      `The word is "${word}". ${imposters[0].name} and ${imposters[1].name} are the imposters, and each slip names the other one. The crew's slips don't.`,
    );
    for (const p of players) {
      await p.page.getByRole("button", { name: "Got it" }).click();
    }
    return { imposters, crew, word };
  }

  async function giveOneClue(): Promise<Player> {
    const speaker = await currentSpeaker(players);
    await speaker.page.getByLabel("Your clue").pressSequentially(CLUES[clueIndex++], { delay: TYPING_MS });
    await speaker.page.getByRole("button", { name: "Submit" }).click();
    await expect(speaker.page.getByRole("heading", { name: "Your turn" })).toBeHidden();
    await pause(speaker.page, PACE / 3);
    return speaker;
  }

  // ─── Round 1: a catch, a wrong guess, and two phones misbehaving ──────────

  await ana.page.getByRole("button", { name: "Start Imposter" }).click();
  const r1 = await dealRound("Round 1: the deal");
  const first = await giveOneClue();
  expect(r1.imposters, "an imposter should never have to speak first").not.toContain(first);
  await capture(
    "Round 1: the first clue",
    `${first.name} speaks first. That is always a crew member now, since an imposter who goes first has heard nothing to work from.`,
  );

  // A phone locks while it is not their turn.
  const onTurn = await currentSpeaker(players);
  const locked = players.find((p) => p !== onTurn && p !== ana)!;
  await dropConnection(locked);
  const notice = ana.page.locator(".offline-notice");
  await expect(notice).toContainText(`${locked.name} lost connection`);
  await capture(
    `${locked.name}'s phone locks`,
    `The socket really closes, the way it does when a screen locks. Everyone else sees why ${locked.name} might go quiet, and their seat is held for two minutes.`,
  );

  await giveOneClue();
  const missed = CLUES[clueIndex - 1];
  await expect(ana.page.locator(".ledger")).toContainText(missed);
  await expect(locked.page.locator(".ledger")).not.toContainText(missed);
  await capture(
    "The game carries on without them",
    `"${missed}" reached the table but not ${locked.name}, whose screen is out of date and says it is reconnecting.`,
  );

  await restoreConnection(locked);
  await expect(notice).toBeHidden();
  await expect(locked.page.locator(".ledger")).toContainText(missed);
  await capture(
    `${locked.name} comes back`,
    `Same seat and same role, and the clue they missed is there. Before this change they would have landed in the lobby with the game going on without them.`,
  );

  // Someone else reloads the page outright, losing everything in memory.
  const next = await currentSpeaker(players);
  const reloader = players.find((p) => p !== next && p !== ana && p !== locked)!;
  await reloader.page.reload();
  await expect(reloader.page.locator(".ledger")).toContainText(missed);
  await reloader.page.getByRole("button", { name: "Show my word" }).click();
  const peek = reloader.page.locator(".peek");
  if (roles.get(reloader.name)!.isImposter) await expect(peek).toContainText("IMPOSTER");
  else await expect(peek).toContainText(r1.word);
  await capture(
    `${reloader.name} reloads the page`,
    `Nothing survives in memory after a reload, so this came back from the server: the private role, every clue so far, and the same seat.`,
    { only: [reloader, ana] },
  );
  await reloader.page.getByRole("button", { name: "Hide" }).click();

  while (!(await ana.page.getByRole("heading", { name: "Who's the imposter?" }).isVisible())) {
    await giveOneClue();
  }

  const caught1 = r1.imposters[1];
  const decoy = r1.crew[0];
  for (const p of r1.crew) await castVote(p, caught1.name);
  await expect(ana.page.getByText("5 / 7 voted")).toBeVisible();
  await capture(
    "Round 1: the vote",
    "Votes are secret while the ballot is open. Each phone only knows how many are in, not who picked whom.",
  );
  for (const p of r1.imposters) await castVote(p, decoy.name);

  await expect(caught1.page.getByLabel("Your guess")).toBeVisible();
  await expect(r1.imposters[0].page.getByLabel("Your guess")).toHaveCount(0);
  await capture(
    "Round 1: caught, with one guess left",
    `The table caught ${caught1.name}, so only ${caught1.name} gets to guess. ${r1.imposters[0].name} is an imposter too but can only watch.`,
  );

  await caught1.page.getByLabel("Your guess").pressSequentially("no idea", { delay: TYPING_MS });
  await caught1.page.getByRole("button", { name: "Guess" }).click();
  await expect(ana.page.getByRole("heading", { name: "The crew wins!" })).toBeVisible();
  for (const p of r1.crew) totals.set(p.name, totals.get(p.name)! + 1);

  const recap = ana.page.locator(".recap");
  await expect(recap.locator('.ledger-row[data-imposter="true"]')).toHaveCount(2);
  const row = ana.page.locator(".vote-row", { has: ana.page.getByText(caught1.name, { exact: true }) });
  for (const p of r1.crew) await expect(row.locator(".vote-voters")).toContainText(p.name);
  await capture(
    "Round 1: the results",
    "Scroll a phone to see it all. New here: both imposters named, every clue with the imposters marked, and who voted for whom. The crew scored +1 each.",
    { fullPage: true, only: [ana, r1.imposters[0]] },
  );
  expect(Object.fromEntries(await readStandings(ana.page))).toEqual(Object.fromEntries(totals));

  // ─── Round 2: a steal, typed sloppily ─────────────────────────────────────

  await ana.page.getByRole("button", { name: "Next round" }).click();
  const r2 = await dealRound("Round 2: a new word");
  for (let i = 0; i < players.length; i++) await giveOneClue();

  const caught2 = r2.imposters[0];
  for (const p of r2.crew) await castVote(p, caught2.name);
  for (const p of r2.imposters) await castVote(p, r2.crew[1].name);
  await expect(caught2.page.getByLabel("Your guess")).toBeVisible();

  // Someone reading over a shoulder, in a hurry: capitals, and no accents.
  const sloppy = `  ${r2.word.normalize("NFD").replace(/\p{Mn}/gu, "").toUpperCase()} `;
  await caught2.page.getByLabel("Your guess").pressSequentially(sloppy, { delay: TYPING_MS });
  await capture(
    "Round 2: a sloppy guess",
    `${caught2.name} types "${sloppy.trim()}" for "${r2.word}", with stray spaces too. Case, spacing and accents no longer cost an imposter a correct guess.`,
    { only: [caught2, ana] },
  );
  await caught2.page.getByRole("button", { name: "Guess" }).click();

  await expect(ana.page.getByRole("heading", { name: "The imposters win!" })).toBeVisible();
  await expect(ana.page.getByText("exactly right")).toBeVisible();
  for (const p of r2.imposters) totals.set(p.name, totals.get(p.name)! + 3);
  await capture(
    "Round 2: stolen",
    "One guess by one imposter, and they share the win: +3 each, because two imposters score as a team.",
    { fullPage: true, only: [ana, caught2] },
  );
  expect(Object.fromEntries(await readStandings(ana.page))).toEqual(Object.fromEntries(totals));

  // ─── Round 3: nobody dares ────────────────────────────────────────────────

  await ana.page.getByRole("button", { name: "Next round" }).click();
  const r3 = await dealRound("Round 3: the last word");
  for (let i = 0; i < players.length; i++) await giveOneClue();
  for (const p of players) {
    await p.page.locator("button.abstain").click();
    await p.page.getByRole("button", { name: "Lock in" }).click();
  }

  await expect(ana.page.getByRole("heading", { name: "The imposters win!" })).toBeVisible();
  for (const p of r3.imposters) totals.set(p.name, totals.get(p.name)! + 2);
  expect(Object.fromEntries(await readStandings(ana.page))).toEqual(Object.fromEntries(totals));

  const best = Math.max(...totals.values());
  const winners = NAMES.filter((n) => totals.get(n) === best);
  await expect(ana.page.locator(".match-winner")).toContainText(winners.join(", "));
  expect(new Set(words).size, "three rounds, three different words").toBe(3);
  await capture(
    "Final standings",
    `Everyone abstained, so the imposters escaped for +2 each. Words dealt: ${words.join(", ")}. Final scores checked against the rules: ${NAMES.map((n) => `${n} ${totals.get(n)}`).join(", ")}.`,
    { fullPage: true, only: [ana, byName(winners[0])] },
  );

  await ana.page.getByRole("button", { name: "Finish" }).click();
  await expect(ana.page.getByRole("button", { name: "Start Imposter" })).toBeVisible();
  roles = new Map();
  await capture("Back to the lobby", "The match is over and the room stays together for another one.", {
    only: [ana],
  });

  await closeAll();
}

/** One phone, in airplane mode, from the production build. */
async function playOnePhone() {
  const act = "One phone, no signal";
  const stage = await openOnePhone("The phone", BUILD_URL);
  const narrator = stage.narrator;
  const { page, context } = stage.phones[0];

  // Counts beeps by watching the browser's own audio API.
  await context.addInitScript(() => {
    const w = window as unknown as { beeps: number };
    w.beeps = 0;
    const real = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      w.beeps++;
      return real.call(this);
    };
  });

  const capture = async (title: string, caption: string, fullPage = false, tag?: string, settle = true) => {
    await narrator?.say(title, caption);
    beats.push({ act, title, caption, shots: [await shot(page, "The phone", tag, fullPage, settle)] });
    await pause(page, PACE + caption.length * READING_MS_PER_CHAR);
  };
  const button = (name: string | RegExp) => page.getByRole("button", { name });

  // One visit with a connection is what saves the app.
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
  });

  await context.setOffline(true);

  // A page this phone has never opened, loaded with no network.
  await page.goto("/imposter/local");
  await expect(page.getByRole("heading", { name: "One phone, passed around" })).toBeVisible();

  for (let i = 3; i < NAMES.length; i++) await button("One more player").click();
  for (const [i, name] of NAMES.entries()) {
    await page.getByRole("textbox", { name: `Name of player ${i + 1}`, exact: true }).fill(name);
  }
  await expect(page.getByRole("switch", { name: "Two imposters at 7+ players" })).toBeChecked();
  await expect(page.getByRole("heading", { name: "How to play" })).toBeVisible();
  await capture(
    "Airplane mode, and it still opens",
    "The network is off, and this page was never visited before going offline. The saved app answers. Setup now explains the rules, and at seven players it offers a second imposter.",
    true,
  );

  await button("Deal the words").click();
  const imposters: string[] = [];
  let word = "";
  let shownImposter = false;
  let shownCrew = false;
  for (const [i, name] of NAMES.entries()) {
    await expect(page.getByRole("heading", { name: `Pass the phone to ${name}` })).toBeVisible();
    await button(/Tap to see your word/).click();
    await expect(button(/Tap to hide/)).toBeVisible();
    if (await page.locator(".slip-imposter").isVisible()) {
      imposters.push(name);
      if (!shownImposter) {
        shownImposter = true;
        await capture(
          `${name} reads their slip`,
          `${name} is an imposter, and the slip names their partner so the two can cover for each other.`,
          false,
          "imposter",
        );
      }
    } else {
      word = await page.locator(".slip-word mark").innerText();
      if (!shownCrew) {
        shownCrew = true;
        await capture(`${name} reads their slip`, `The crew's slip has the word, "${word}".`, false, "crew");
      }
    }
    await button(i === NAMES.length - 1 ? "Start the game" : "Next player").click();
  }
  expect(imposters).toHaveLength(2);

  const speaker = page.locator(".speaker h1");
  const firstSpeaker = await speaker.innerText();
  expect(imposters).not.toContain(firstSpeaker);
  await capture(
    "Saying clues out loud",
    `${firstSpeaker} goes first, and it can never be an imposter here either. Clues are spoken in this mode, so the phone only keeps the turn.`,
  );

  await button("Next player").click();
  const secondSpeaker = await speaker.innerText();
  await page.reload();
  await expect(speaker).toHaveText(secondSpeaker);
  await capture(
    "Pull to refresh, still offline",
    `A reload with no network lands back on ${secondSpeaker}'s turn, with the same word and the same imposters.`,
  );

  await button("Reveal the imposter").click();
  await page.locator(".accuse-row", { hasText: imposters[0] }).click();
  await button(`Accuse ${imposters[0]}`).click();
  await expect(page.locator(".vs-question")).toHaveText(`Was it ${imposters[0]}?`);
  await capture(
    "The accusation",
    "The verdict sequence from before still plays, up to the point of the catch.",
    false,
    undefined,
    false,
  );

  await expect(page.getByRole("heading", { name: "Caught!" })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".verdict-slip")).toHaveCount(0);
  await button("Yes, they got it").waitFor();
  await capture(
    "Caught, with one guess left",
    `New: ${imposters[0]} says a guess out loud, and the table rules on it. The word stays off the screen, since showing it would give the guess away.`,
  );

  await button("Yes, they got it").click();
  await expect(page.getByRole("heading", { name: "The imposters win!" })).toBeVisible();
  await expect(page.locator(".verdict-slip")).toHaveText(word);
  await expect(page.locator(".verdict-who")).toHaveCount(2);
  await capture(
    "Stolen",
    `The table said ${imposters[0]} got it, so the screen turns red and names both imposters. This mode still keeps no score.`,
    true,
  );

  // Auto mode, for the sound. Two seconds short of a real wait is not worth faking.
  await button("Change players or settings").click();
  await page.locator(".choice", { hasText: "Who moves" }).locator(".choice-option", { hasText: "The app" }).click();
  await page.locator(".choice", { hasText: "Time per clue" }).locator(".choice-option", { hasText: /^10s$/ }).click();
  await expect(page.getByRole("switch", { name: "Sound when a turn ends" })).toBeChecked();
  await button("Deal the words").click();
  for (const [i] of NAMES.entries()) {
    await button(/Tap to see your word/).click();
    await button(i === NAMES.length - 1 ? "Start the game" : "Next player").click();
  }
  const before = await speaker.innerText();
  const beeps = () => page.evaluate(() => (window as unknown as { beeps: number }).beeps);
  expect(await beeps()).toBe(0);
  await capture("The clock runs the turns", `Auto mode, ten seconds a turn, with the phone down on the table. ${before} is up.`);

  await expect(speaker).not.toHaveText(before, { timeout: 15_000 });
  await expect.poll(beeps).toBe(1);
  await capture(
    "Beep",
    `Ten seconds passed and the turn moved on. The browser's audio API was called exactly once, so the table heard it. Silent in a screenshot, but counted by this run.`,
  );

  if (!HEADLESS) {
    await narrator?.say(
      "That's the whole party",
      `Every step was checked as it happened. These windows close in ${HOLD} seconds.`,
    );
    await pause(page, HOLD * 1000);
  }
  await closeAll();
}

test("a whole party", async () => {
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });

  try {
    await playOnlineMatch();
    if (process.env.SIM_CHECK_WINDOWS) return;
    await playOnePhone();
  } finally {
    await closeAll();
  }

  const html = buildReplay(beats, images, new Date());
  writeFileSync(`${OUTPUT}replay.html`, html);
  console.log(`\nReplay: ${OUTPUT}replay.html (${Math.round(html.length / 1024 / 1024)} MB, ${beats.length} steps)\n`);
});
