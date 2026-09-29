import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import type { VotePhase, VoteProgress } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { nameFor } from "./nameFor";

// What this player is choosing: a specific suspect, or abstaining. Kept as a
// tagged union rather than a bare string so "no one picked yet" (null),
// "picked nobody on purpose" (abstain), and "picked a real player" can't be
// confused with each other.
export type VoteChoice = { kind: "suspect"; id: string } | { kind: "abstain" };

interface Props extends GameViewProps {
  votePhase: VotePhase | null;
  progress: VoteProgress | null;
  myVote: VoteChoice | null; // the choice actually sent to the server so far, if any
  onLockIn: (choice: VoteChoice) => void;
}

function sameChoice(a: VoteChoice | null, b: VoteChoice | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "abstain" || b.kind === "abstain") return a.kind === b.kind;
  return a.id === b.id;
}

// Tapping a candidate only changes this ballot's local highlight — it does
// not vote. Nothing is sent to the server until "Lock in", and a locked-in
// choice can still be changed (and re-locked) right up until the countdown
// hits zero, at which point whatever is currently selected (or abstain, if
// nothing was ever picked) is sent automatically.
export function VoteView({ votePhase, progress, myVote, onLockIn, selfId, players }: Props) {
  const { t } = useT();

  const [selected, setSelected] = useState<VoteChoice | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // A fresh VotePhase means a new round of voting: start the countdown over
  // and clear this player's local pick.
  useEffect(() => {
    if (!votePhase) return;
    setSelected(null);
    setTimedOut(false);
    setSecondsLeft(votePhase.voteSeconds || null);
  }, [votePhase]);

  useEffect(() => {
    if (secondsLeft === null || timedOut) return;
    if (secondsLeft <= 0) {
      setTimedOut(true);
      onLockIn(selected ?? { kind: "abstain" });
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, timedOut, selected, onLockIn]);

  if (!votePhase) {
    return (
      <main className="screen">
        <p className="status">{t("imposter.dealing")}</p>
      </main>
    );
  }

  function describe(choice: VoteChoice): string {
    return choice.kind === "abstain" ? t("imposter.abstain") : nameFor(players, choice.id);
  }

  return (
    <main className="screen">
      <h1>{t("imposter.voteHeading")}</h1>

      {secondsLeft !== null && (
        <p className="status">
          {timedOut ? t("imposter.voteTimeUp") : t("imposter.voteTimeLeft", { seconds: secondsLeft })}
        </p>
      )}

      <section>
        <h2>{t("imposter.cluesHeading")}</h2>
        <ul className="players">
          {votePhase.clues.map((c, i) => (
            <li key={i}>
              <strong>{nameFor(players, c.playerId)}:</strong> {c.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          {t("imposter.voteProgress", {
            voted: progress?.votedPlayerIds.length ?? 0,
            total: progress?.total ?? players.length,
          })}
        </h2>
        <ul className="players">
          {votePhase.candidateIds.map((id) => {
            const choice: VoteChoice = { kind: "suspect", id };
            return (
              <li key={id}>
                <button
                  className={sameChoice(selected, choice) ? "primary" : "secondary"}
                  disabled={timedOut}
                  onClick={() => setSelected(choice)}
                >
                  {nameFor(players, id)}
                  {id === selfId && <span className="you"> ({t("lobby.you")})</span>}
                </button>
              </li>
            );
          })}
          <li>
            <button
              className={selected?.kind === "abstain" ? "primary" : "secondary"}
              disabled={timedOut}
              onClick={() => setSelected({ kind: "abstain" })}
            >
              {t("imposter.abstain")}
            </button>
          </li>
        </ul>
      </section>

      {myVote && <p className="status">{t("imposter.voteLockedIn", { who: describe(myVote) })}</p>}

      <button
        className="primary"
        disabled={timedOut || !selected || sameChoice(selected, myVote)}
        onClick={() => selected && onLockIn(selected)}
      >
        {myVote ? t("imposter.changeVote") : t("imposter.lockIn")}
      </button>
    </main>
  );
}
