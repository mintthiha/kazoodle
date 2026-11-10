import { useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import type { GameViewProps } from "../registry";
import { fbErrorKey } from "./errors";
import { VoteKind } from "./gen/fibblash_pb";
import { VOTE_QUESTION } from "./labels";
import {
  encodeCastVote,
  encodeFinish,
  encodeHostEnd,
  encodeHostNext,
  encodeHostSkip,
  encodeSubmitAnswer,
} from "./messages";
import { AnswerForm } from "./parts/AnswerForm";
import { Ballot } from "./parts/Ballot";
import { ChoiceBoard } from "./parts/ChoiceBoard";
import { Clock } from "./parts/Clock";
import { FinalBoard } from "./parts/FinalBoard";
import { HostControls } from "./parts/HostControls";
import { MatchupReveal } from "./parts/MatchupReveal";
import { Prompt, QuestionCard } from "./parts/QuestionCard";
import { Reveal } from "./parts/Reveal";
import { Standings } from "./parts/Standings";
import { useFibblash } from "./useFibblash";
import { isPlaying } from "./view";
import "../../screens/lobby.css";
import "./fibblash.css";

// Fibblash on one player's phone. The server's messages are folded into one
// View (see view.ts); this component picks the screen that view calls for, and
// sends what the player does. Everything public is here too, so the game plays
// fine with no main screen at all.
export function FibblashGame(props: GameViewProps) {
  const { selfId, isHost } = props;
  const { t } = useT();
  const { view, people, send, snapshot, actions } = useFibblash(props);
  // Which clock this phone last sent an answer or vote under. Until the
  // server's confirmation arrives, it keeps the button from being pressed
  // twice; a refusal (lastError) hands the form back.
  const [sentFor, setSentFor] = useState("");
  // The host panel lives inside the per-phase key below, so its open state is
  // kept here or it would snap shut every phase.
  const [hostOpen, setHostOpen] = useState(false);

  if (!view) return null;

  const serverError = fbErrorKey(snapshot.lastError);
  const sending = sentFor === view.clockKey && serverError === null;
  const playing = isPlaying(view, selfId);
  const myScore = view.scores[selfId] ?? 0;

  function submit(payload: string) {
    setSentFor(view!.clockKey);
    send(payload);
  }

  let body: ReactNode;
  switch (view.stage) {
    case "intro":
      body = (
        <>
          <QuestionCard question={view.question} withHelp />
          <p className="fb-lead">{t("fb.getReady")}</p>
        </>
      );
      break;

    case "answer":
      body = (
        <>
          <QuestionCard question={view.question} withHelp={!view.myAnswer} />
          <p className="status num" aria-live="polite">
            {t("fb.answeredCount", { n: view.answered.length, total: view.question.playerIds.length })}
          </p>
          {!playing ? (
            <p className="status">{t("fb.watching")}</p>
          ) : view.myAnswer === null ? (
            <AnswerForm
              key={view.clockKey}
              kind={view.question.kind}
              maxLength={view.maxLength}
              sending={sending}
              serverError={serverError}
              onSubmit={(text) => submit(encodeSubmitAnswer(text))}
              onEdit={actions.clearError}
            />
          ) : (
            <section className="fb-locked">
              <p className="fb-truth-label">{t("fb.lockedIn")}</p>
              <p className="fb-locked-text">{view.myAnswer}</p>
            </section>
          )}
        </>
      );
      break;

    case "vote": {
      const vote = view.vote!;
      const heading = (
        <div>
          {vote.vote === VoteKind.MATCHUP && (
            <p className="status">{t("fb.matchupOf", { n: vote.matchup, total: vote.matchups })}</p>
          )}
          <h1 className="fb-vote-q">{t(VOTE_QUESTION[vote.vote])}</h1>
          <p className="fb-prompt-small">
            <Prompt text={view.question.prompt} />
          </p>
        </div>
      );
      const progress = (
        <p className="status num" aria-live="polite">
          {t("fb.votedCount", { n: view.voted, total: view.voters })}
        </p>
      );

      if (view.canVote && view.myVote === null) {
        body = (
          <>
            {heading}
            {progress}
            <Ballot
              key={view.clockKey}
              choices={vote.choices}
              ownChoiceIds={view.ownChoiceIds}
              sending={sending}
              serverError={serverError}
              onVote={(id) => submit(encodeCastVote(id))}
            />
          </>
        );
      } else {
        let note: string | null = null;
        if (view.myVote !== null) note = t("fb.voteLocked");
        else if (view.canVote === false && view.ownChoiceIds.length > 0) note = t("fb.yourMatchup");
        else if (view.canVote === false) note = playing ? t("fb.noVote") : t("fb.watching");
        body = (
          <>
            {heading}
            {note && <p className="fb-lead">{note}</p>}
            <ChoiceBoard choices={vote.choices} picked={view.myVote} ownChoiceIds={view.ownChoiceIds} />
            {progress}
          </>
        );
      }
      break;
    }

    case "matchupResult":
      body = (
        <>
          <p className="fb-prompt-small">
            <Prompt text={view.question.prompt} />
          </p>
          <MatchupReveal result={view.matchupResult!} people={people} />
        </>
      );
      break;

    case "result":
      body = (
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
      const mine = lb.standings.find((s) => s.playerId === selfId)?.delta ?? 0;
      body = (
        <>
          <div>
            <p className="status">{t("fb.afterQuestion", { n: lb.number, total: lb.total })}</p>
            <h1>{t("fb.leaderboard")}</h1>
          </div>
          {lb.skipped && <p className="notice-line">{t("fb.skipped")}</p>}
          {playing && (
            <p className="fb-lead">{mine > 0 ? t("fb.yourPoints", { n: mine }) : t("fb.noPointsYou")}</p>
          )}
          <Standings standings={lb.standings} topIds={lb.topIds} withDeltas people={people} />
        </>
      );
      break;
    }

    case "final":
      body = (
        <>
          <FinalBoard final={view.final!} people={people} />
          <div className="dock">
            {isHost ? (
              <button className="primary" onClick={() => send(encodeFinish())}>
                {t("fb.backToLobby")}
              </button>
            ) : (
              <p className="status">{t("fb.waitClose")}</p>
            )}
          </div>
        </>
      );
      break;
  }

  const room = snapshot.room;
  return (
    // Keyed by the clock, so each phase arrives with the shared screen-in
    // motion and nothing typed for one phase lingers into the next.
    <main
      className="screen fb"
      key={view.clockKey}
      data-kind={view.question.kind}
      data-stage={view.stage}
      data-clock={view.clockKey}
    >
      <div className="fb-bar">
        <p className="status num">{t("fb.questionOf", { n: view.question.number, total: view.question.total })}</p>
        {playing && <span className="pill num">{t("fb.score", { n: myScore })}</span>}
      </div>
      {view.stage !== "final" && <Clock view={view} />}
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
          open={hostOpen}
          onToggle={setHostOpen}
        />
      )}
      {body}
    </main>
  );
}
