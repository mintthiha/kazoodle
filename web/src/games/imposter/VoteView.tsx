import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { makeHueFor } from "../../players/hues";
import type { RoleAssignment, VotePhase, VoteProgress } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { makeNameFor } from "./nameFor";
import { ClueLedger } from "./ClueLedger";
import { Countdown } from "./Countdown";
import { buildLedger } from "./ledger";
import { WordPeek } from "./WordSlip";

// What this player is choosing: a specific suspect, or abstaining. Kept as a
// tagged union rather than a bare string so "no one picked yet" (null),
// "picked nobody on purpose" (abstain), and "picked a real player" can't be
// confused with each other.
export type VoteChoice = { kind: "suspect"; id: string } | { kind: "abstain" };

interface Props extends GameViewProps {
  role: RoleAssignment | null;
  votePhase: VotePhase | null;
  progress: VoteProgress | null;
  myVote: VoteChoice | null; // the choice actually sent to the server so far, if any
  /** True once this round has issued more than one ballot, which only happens
   * when a player left mid-vote and the server reissued it. */
  reopened: boolean;
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
export function VoteView({
  role,
  votePhase,
  progress,
  myVote,
  reopened,
  onLockIn,
  selfId,
  players,
  departed,
}: Props) {
  const { t } = useT();

  const name = makeNameFor(players, departed, t);
  const hue = makeHueFor(players, departed);

  const [selected, setSelected] = useState<VoteChoice | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // A fresh VotePhase means a new round of voting: start the countdown over
  // and clear this player's local pick.
  useEffect(() => {
    if (!votePhase) return;
    setSelected(null);
    setSecondsLeft(votePhase.voteSeconds || null);
  }, [votePhase]);

  // Display only. This countdown used to submit a vote of its own when it hit
  // zero, which made every client responsible for closing the ballot: a phone
  // asleep in a pocket held the round open, and a client that simply never
  // submitted could hold it open on purpose. The server now owns the
  // deadline and abstains whoever has not answered, so this stops at zero and
  // waits for the server to say what happened.
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  // Zero means "the server is about to close this", not "it is closed".
  const timedOut = secondsLeft !== null && secondsLeft <= 0;

  if (!votePhase) {
    return (
      <main className="screen">
        <p className="status">{t("imposter.dealing")}</p>
      </main>
    );
  }

  function describe(choice: VoteChoice): string {
    return choice.kind === "abstain" ? t("imposter.abstain") : name(choice.id);
  }

  const rows = buildLedger(votePhase.candidateIds, votePhase.clues);

  return (
    <main className="screen">
      <div>
        <h1>{t("imposter.voteHeading")}</h1>
        <p className="status num">
          {t("imposter.voteProgress", {
            voted: progress?.votedPlayerIds.length ?? 0,
            total: progress?.total ?? players.length,
          })}
        </p>
      </div>

      {reopened && (
        <p className="notice-line" role="status">
          {t("imposter.ballotReopened")}
        </p>
      )}

      {secondsLeft !== null && (
        <Countdown
          seconds={secondsLeft}
          total={votePhase.voteSeconds}
          label={
            timedOut ? t("imposter.voteTimeUp") : t("imposter.voteTimeLeft", { seconds: secondsLeft })
          }
        />
      )}

      <WordPeek role={role} partnerName={role?.partnerId ? name(role.partnerId) : undefined} />

      <ClueLedger
        rows={rows}
        passes={0}
        selfId={selfId}
        name={name}
        hue={hue}
        candidates={votePhase.candidateIds}
        selectedId={selected?.kind === "suspect" ? selected.id : null}
        disabled={timedOut}
        onPick={(id) => setSelected({ kind: "suspect", id })}
      />

      <button
        className="abstain"
        aria-pressed={selected?.kind === "abstain"}
        disabled={timedOut}
        onClick={() => setSelected({ kind: "abstain" })}
      >
        {t("imposter.abstain")}
      </button>

      <div className="dock">
        {myVote && <p className="status">{t("imposter.voteLockedIn", { who: describe(myVote) })}</p>}
        {/* After a reload this phone no longer knows what it picked, only that the
            server has a vote from it. Votes are secret, so nobody will say which. */}
        {!myVote && progress?.votedPlayerIds.includes(selfId) && (
          <p className="status">{t("imposter.voteAlreadyIn")}</p>
        )}
        <button
          className="primary"
          disabled={timedOut || !selected || sameChoice(selected, myVote)}
          onClick={() => selected && onLockIn(selected)}
        >
          {myVote ? t("imposter.changeVote") : t("imposter.lockIn")}
        </button>
      </div>
    </main>
  );
}
