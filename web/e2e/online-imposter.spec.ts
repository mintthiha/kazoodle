import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  castVote,
  currentSpeaker,
  dropConnection,
  giveClue,
  newPlayer,
  pickOption,
  readRole,
  readRoles,
  restoreConnection,
  seatTable,
  type Player,
} from "./support/table";

const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });

async function table(browser: Browser, names: string[]): Promise<Player[]> {
  const players: Player[] = [];
  for (const name of names) players.push(await newPlayer(browser, name));
  return players;
}

/** One clue each from a one-pass game. */
async function oneClueEach(players: Player[]) {
  for (let i = 0; i < players.length; i++) {
    await giveClue(players, (p) => `clue${p.name}`);
  }
}

test.describe("the results", () => {
  test("show the clues with the imposter marked, and who voted for whom", async ({ browser }) => {
    const players = await table(browser, ["Ana", "Ben", "Cleo", "Dov"]);
    await seatTable(players);
    const [ana] = players;

    await pickOption(ana, "Clues per player", "1");
    await button(ana.page, "Start Imposter").click();
    const roles = await readRoles(players);
    const imposter = players.find((p) => roles.get(p.name)!.isImposter)!;
    const crew = players.filter((p) => p !== imposter);

    await oneClueEach(players);

    // Everyone votes for the same crew member, except that crew member.
    const framed = crew[0];
    for (const p of players) {
      await castVote(p, p === framed ? crew[1].name : framed.name);
    }

    const screen = crew[1].page;
    await expect(screen.getByRole("heading", { name: "The imposter wins!" })).toBeVisible();

    const recap = screen.locator(".recap");
    await expect(recap.getByRole("heading", { name: "What everyone said" })).toBeVisible();
    for (const p of players) {
      await expect(recap).toContainText(`clue${p.name}`);
    }
    const marked = recap.locator('.ledger-row[data-imposter="true"]');
    await expect(marked).toHaveCount(1);
    await expect(marked).toContainText(imposter.name);
    await expect(marked).toContainText(`clue${imposter.name}`);

    // Everyone but the framed player voted for them, and they voted for crew[1].
    const framedRow = screen.locator(".vote-row", { has: screen.getByText(framed.name, { exact: true }) });
    await expect(framedRow.locator(".vote-count")).toHaveText("3");
    for (const p of players.filter((x) => x !== framed)) {
      await expect(framedRow.locator(".vote-voters")).toContainText(p.name);
    }
    const otherRow = screen.locator(".vote-row", { has: screen.getByText(crew[1].name, { exact: true }) });
    await expect(otherRow.locator(".vote-voters")).toHaveText(`From ${framed.name}`);
  });
});

test.describe("reconnecting", () => {
  test("a reload mid-round keeps the seat, the role and the screen", async ({ browser }) => {
    const players = await table(browser, ["Ana", "Ben", "Cleo"]);
    await seatTable(players);
    const [ana, ben, cleo] = players;

    await button(ana.page, "Start Imposter").click();
    const benRole = await readRole(ben);
    await readRole(ana);
    await readRole(cleo);
    await giveClue(players, () => "first");

    await ben.page.reload();

    // Straight back into the game, not to the join screen or the lobby.
    await expect(ben.page.locator(".ledger-row").first()).toBeVisible();
    await expect(ben.page.getByRole("heading", { name: "Join a game" })).toHaveCount(0);
    await expect(ben.page.locator(".ledger-clues", { hasText: "first" })).toBeVisible();

    // Their private role came back too.
    await button(ben.page, "Show my word").click();
    const peek = ben.page.locator(".peek");
    if (benRole.isImposter) {
      await expect(peek).toContainText("IMPOSTER");
    } else {
      await expect(peek).toContainText(benRole.word);
    }

    // And the seat still works: the round finishes with them in it.
    await giveClue(players, () => "second");
    await giveClue(players, () => "third");
    await expect(ana.page.locator(".ledger-row", { hasText: "Ben" })).toBeVisible();
  });

  test("a dropped phone shows as offline, catches up, and the table carries on", async ({ browser }) => {
    const players = await table(browser, ["Ana", "Ben", "Cleo", "Dov"]);
    await seatTable(players);

    await button(players[0].page, "Start Imposter").click();
    await readRoles(players);

    // Whoever is on turn gives a clue, so that one happens with everyone here.
    await giveClue(players, (p) => `one${p.name}`);

    // Someone not on turn drops, so that the table has no reason to wait for them.
    const onTurn = await currentSpeaker(players);
    const dropped = players.find((p) => p !== onTurn)!;
    const watcher = players.find((p) => p !== onTurn && p !== dropped)!;

    await dropConnection(dropped);
    const notice = watcher.page.locator(".offline-notice");
    await expect(notice).toContainText(`${dropped.name} lost connection`);

    // The game does not stop for them.
    const missed = `missed${onTurn.name}`;
    await onTurn.page.getByLabel("Your clue").fill(missed);
    await button(onTurn.page, "Submit").click();
    await expect(watcher.page.locator(".ledger")).toContainText(missed);
    // Their screen really is out of date, and not just slow to update.
    await expect(dropped.page.locator(".ledger")).not.toContainText(missed);

    // Back, with the clue they missed, and the table can see they are back.
    await restoreConnection(dropped);
    await expect(notice).toBeHidden();
    await expect(dropped.page.locator(".conn-banner")).toBeHidden();
    await expect(dropped.page.locator(".ledger")).toContainText(missed);
  });

  test("the host role moves on when the host's phone drops, and the seat stays", async ({ browser }) => {
    const players = await table(browser, ["Ana", "Ben", "Cleo"]);
    await seatTable(players);
    const [ana, ben] = players;

    await dropConnection(ana);
    await expect(button(ben.page, "Start Imposter")).toBeVisible();
    await expect(ben.page.locator(".pill-offline")).toBeVisible();
    // Two connected players is not enough to start, whatever the roster says.
    await expect(button(ben.page, "Start Imposter")).toBeDisabled();

    await restoreConnection(ana);
    await expect(ben.page.locator(".pill-offline")).toHaveCount(0);
    await expect(ana.page.locator(".lobby .roster-row:not(.roster-seat)")).toHaveCount(3);
    await expect(button(ana.page, "Start Imposter")).toHaveCount(0);
  });

  test("leaving the site empties the seat instead of leaving a phantom", async ({ browser }) => {
    test.setTimeout(60_000);
    const players = await table(browser, ["Ana", "Ben", "Cleo"]);
    await seatTable(players);
    const [ana, , cleo] = players;

    // A full page load elsewhere, which is what used to leave a phantom for good.
    await cleo.page.goto("about:blank");

    const notice = ana.page.locator(".offline-notice");
    await expect(notice).toContainText("Cleo lost connection", { timeout: 5_000 });
    // The lobby's grace period, then they are really gone.
    await expect(ana.page.locator(".lobby .roster-row", { hasText: "Cleo" })).toHaveCount(0, { timeout: 40_000 });
    await expect(notice).toBeHidden();
  });

  test("two tabs on one seat do not fight over it", async ({ browser }) => {
    const players = await table(browser, ["Ana", "Ben", "Cleo"]);
    await seatTable(players);
    const [ana, ben] = players;

    // What "duplicate tab" does: a new page with a copy of the first one's storage.
    const saved = await ben.page.evaluate(() => sessionStorage.getItem("pg.session.v1"));
    const second = await ben.context.newPage();
    await second.addInitScript((value) => {
      if (value) sessionStorage.setItem("pg.session.v1", value);
    }, saved);
    await second.goto("/imposter");
    await expect(second.locator(".room-code-value")).toBeVisible();

    // The first tab stands down and stays down, and the seat stays filled.
    await expect(ben.page.getByRole("heading", { name: "Join a game" })).toBeVisible();
    await expect(ben.page.getByText("opened somewhere else")).toBeVisible();
    await expect(second.locator(".room-code-value")).toBeVisible();
    await expect(ana.page.locator(".lobby .roster-row:not(.roster-seat)")).toHaveCount(3);
    await expect(ana.page.locator(".pill-offline")).toHaveCount(0);
  });
});

test.describe("two imposters", () => {
  test("seven players get two, as a team, and the results name both", async ({ browser }) => {
    test.setTimeout(120_000);
    const players = await table(browser, ["Ana", "Ben", "Cleo", "Dov", "Eli", "Fay", "Gus"]);
    await seatTable(players);
    const [ana] = players;

    // The choice only appears once the table is big enough, and only for the host.
    await expect(ana.page.locator(".choice", { hasText: "Imposters at 7+ players" })).toBeVisible();
    await expect(players[1].page.locator(".setup-readout")).toContainText("Two imposters");
    await pickOption(ana, "Clues per player", "1");

    await button(ana.page, "Start Imposter").click();
    const roles = await readRoles(players);

    const imposters = players.filter((p) => roles.get(p.name)!.isImposter);
    expect(imposters).toHaveLength(2);
    expect(roles.get(imposters[0].name)!.partnerLine).toBe(`Your partner: ${imposters[1].name}`);
    expect(roles.get(imposters[1].name)!.partnerLine).toBe(`Your partner: ${imposters[0].name}`);
    const crew = players.filter((p) => !imposters.includes(p));
    for (const p of crew) expect(roles.get(p.name)!.partnerLine).toBe("");
    // Neither of them has to go first.
    const first = await giveClue(players, (p) => `clue1${p.name}`);
    expect(imposters).not.toContain(first);
    for (let i = 1; i < players.length; i++) {
      await giveClue(players, (p) => `clue1${p.name}`);
    }

    // The table catches the second imposter, not the first.
    const caught = imposters[1];
    for (const p of players) await castVote(p, caught.name);

    // Only the caught one gets to guess.
    await expect(caught.page.getByLabel("Your guess")).toBeVisible();
    await expect(imposters[0].page.getByLabel("Your guess")).toHaveCount(0);
    await caught.page.getByLabel("Your guess").fill("definitely not it");
    await button(caught.page, "Guess").click();

    const screen = crew[0].page;
    await expect(screen.getByRole("heading", { name: "The crew wins!" })).toBeVisible();
    await expect(screen.locator(".verdict-who")).toHaveCount(2);
    await expect(screen.locator('.recap .ledger-row[data-imposter="true"]')).toHaveCount(2);
  });
});

test.describe("steal guesses", () => {
  test("forgive accents and capitals", async ({ browser }) => {
    test.setTimeout(120_000);
    const players = await table(browser, ["Ana", "Ben", "Cleo"]);
    await seatTable(players);
    const [ana] = players;

    await pickOption(ana, "Clues per player", "1");
    await button(ana.page, "Start Imposter").click();
    const roles = await readRoles(players);
    const imposter = players.find((p) => roles.get(p.name)!.isImposter)!;
    const word = [...roles.values()].find((r) => !r.isImposter)!.word;

    await oneClueEach(players);
    for (const p of players) await castVote(p, imposter.name);

    // Typed in capitals, with spaces, and with any accents dropped, by someone in a
    // hurry.
    const sloppy = word.normalize("NFD").replace(/\p{Mn}/gu, "").toUpperCase();
    await imposter.page.getByLabel("Your guess").fill(`  ${sloppy} `);
    await button(imposter.page, "Guess").click();

    await expect(ana.page.getByRole("heading", { name: "The imposter wins!" })).toBeVisible();
    await expect(ana.page.getByText("exactly right")).toBeVisible();
  });
});
