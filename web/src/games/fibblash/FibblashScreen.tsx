import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { Avatar } from "../../players/Avatar";
import type { GameViewProps } from "../registry";
import { VoteKind } from "./gen/fibblash_pb";
import { KIND_HELP, VOTE_QUESTION } from "./labels";
import { encodeFinish, encodeHostEnd, encodeHostNext, encodeHostSkip } from "./messages";
import { ChoiceBoard } from "./parts/ChoiceBoard";
import { Clock } from "./parts/Clock";
import { FinalBoard } from "./parts/FinalBoard";
import { HostControls } from "./parts/HostControls";
import { MatchupReveal } from "./parts/MatchupReveal";
import { Prompt, QuestionCard } from "./parts/QuestionCard";
import { Reveal } from "./parts/Reveal";
import { Standings } from "./parts/Standings";
import type { People } from "./parts/people";
import { useFibblash } from "./useFibblash";
import "./fibblash.css";

// Fibblash on the main screen: the TV everyone looks up at. It folds the same
// messages a phone does but only ever gets the public ones, so it can show the
// question, the ballot, the reveal and the scores, and nothing secret. Nobody
// types here; the only controls are the host's, when this screen is the host.
export function FibblashScreen(props: GameViewProps) {
  const { isHost } = props;
  const { t } = useT();
  const { view, people, send, snapshot, actions } = useFibblash(props);
  if (!view) return null;

  let stage: ReactNode;
  switch (view.stage) {
    case "intro":
      stage = <QuestionCard question={view.question} withHelp />;
      break;

    case "answer":
      stage = (
        <>
          <QuestionCard question={view.question} />
          <p className="fb-tv-call">{t("fb.answerOnPhones")}</p>
          <p className="status">{t(KIND_HELP[view.question.kind])}</p>
          <Seats ids={view.question.playerIds} done={view.answered} people={people} />
        </>
      );
      break;

    case "vote": {
      const vote = view.vote!;
      stage = (
        <>
          {vote.vote === VoteKind.MATCHUP && (
            <p className="status">{t("fb.matchupOf", { n: vote.matchup, total: vote.matchups })}</p>
          )}
          <p className="fb-prompt-small">
            <Prompt text={view.question.prompt} />
          </p>
          <h1 className="fb-vote-q">{t(VOTE_QUESTION[vote.vote])}</h1>
          <ChoiceBoard choices={vote.choices} />
          <p className="fb-tv-call">
            {t("fb.voteOnPhones")}{" "}
            <span className="status num">{t("fb.votedCount", { n: view.voted, total: view.voters })}</span>
          </p>
        </>
      );
      break;
    }

    case "matchupResult":
      stage = (
        <>
          <p className="fb-prompt-small">
            <Prompt text={view.question.prompt} />
          </p>
          <MatchupReveal result={view.matchupResult!} people={people} />
        </>
      );
      break;

    case "result":
      stage = (
        <>
          <p className="fb-prompt-small">
            <Prompt text={view.question.prompt} />
          </p>
          <Reveal result={view.result!} people={people} />
        </>
      );
      break;

    case "leaderboard": {
      const lb = view.leaderboard!;
      stage = (
        <>
          <p className="status">{t("fb.afterQuestion", { n: lb.number, total: lb.total })}</p>
          <h1>{t("fb.leaderboard")}</h1>
          {lb.skipped && <p className="notice-line">{t("fb.skipped")}</p>}
          <Standings standings={lb.standings} topIds={lb.topIds} withDeltas people={people} />
        </>
      );
      break;
    }

    case "final":
      stage = (
        <>
          <FinalBoard final={view.final!} people={people} />
          {isHost ? (
            <button className="primary fb-tv-finish" onClick={() => send(encodeFinish())}>
              {t("fb.backToLobby")}
            </button>
          ) : (
            <p className="status">{t("fb.waitClose")}</p>
          )}
        </>
      );
      break;
  }

  const room = snapshot.room;
  return (
    <main className="fb fb-tv" data-kind={view.question.kind} data-stage={view.stage} data-clock={view.clockKey}>
      <header className="fb-tv-bar">
        <span className="fb-tv-brand">{t("game.fibblash.name")}</span>
        <span className="status num">{t("fb.questionOf", { n: view.question.number, total: view.question.total })}</span>
        {room && <span className="fb-tv-code num">{room.code}</span>}
      </header>
      {view.stage !== "final" && <Clock view={view} />}
      {/* Keyed by the clock, so each phase arrives with its own entrance. */}
      <div className="fb-tv-stage" key={view.clockKey}>
        {stage}
      </div>
      {isHost && room && (
        <HostControls
          playerIds={room.players.filter((p) => !p.screen).map((p) => p.id)}
          offline={room.offline}
          people={people}
          canAdvance={view.stage !== "final"}
          onNext={() => send(encodeHostNext())}
          onSkip={() => send(encodeHostSkip())}
          onEnd={() => send(encodeHostEnd())}
          onRemove={actions.kickPlayer}
        />
      )}
    </main>
  );
}

/** Everyone taking part, lit up once they have answered: on the big screen, so
 * the room can see who it is waiting for. Who, never what. */
function Seats({ ids, done, people }: { ids: string[]; done: string[]; people: People }) {
  return (
    <ul className="fb-seats" role="list">
      {ids.map((id) => (
        <li key={id} className="fb-seat" data-done={done.includes(id)}>
          <Avatar name={people.nameFor(id)} hue={people.hueFor(id)} />
          <span>{people.nameFor(id)}</span>
        </li>
      ))}
    </ul>
  );
}
