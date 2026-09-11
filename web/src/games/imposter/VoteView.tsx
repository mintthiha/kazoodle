import { useT } from "../../i18n";
import type { VotePhase, VoteProgress } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { nameFor } from "./nameFor";

interface Props extends GameViewProps {
  votePhase: VotePhase | null;
  progress: VoteProgress | null;
  myVote: string | null;
  onVote: (suspectId: string) => void;
}

// The clue recap, then one button per candidate. Voting again before everyone
// has voted just replaces this player's pick.
export function VoteView({ votePhase, progress, myVote, onVote, selfId, players }: Props) {
  const { t } = useT();

  if (!votePhase) {
    return (
      <main className="screen">
        <p className="hint">{t("imposter.dealing")}</p>
      </main>
    );
  }

  return (
    <main className="screen">
      <h1>{t("imposter.voteHeading")}</h1>

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
          {votePhase.candidateIds.map((id) => (
            <li key={id}>
              <button className={id === myVote ? "primary" : "secondary"} onClick={() => onVote(id)}>
                {nameFor(players, id)}
                {id === selfId && <span className="you"> ({t("lobby.you")})</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
