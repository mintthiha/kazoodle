import { useState, type CSSProperties } from "react";
import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import { Countdown } from "../Countdown";
import { speakerSeat, type LocalEvent, type LocalGame, type Stage } from "./localGame";
import { makeSeatHue } from "./seatHue";
import { useTurnClock } from "./useTurnClock";

type Dispatch = (event: LocalEvent) => void;

interface SpeakProps {
  game: LocalGame;
  stage: Extract<Stage, { kind: "speak" }>;
  dispatch: Dispatch;
}

// Whose turn it is to say a word, big enough to read from across the table. The
// two modes differ only in what moves things on: a person with a button, or a
// clock. Manual mode offers Reveal on every turn; auto mode does not offer it here
// at all, and it appears on DiscussView once the turns have run out.
export function SpeakView({ game, stage, dispatch }: SpeakProps) {
  const { t } = useT();
  const [paused, setPaused] = useState(false);

  const { names, settings } = game;
  const auto = settings.advance === "auto";
  const hue = makeSeatHue(names.length);
  const speaker = names[speakerSeat(game, stage.turn)];
  const clue = t("imposter.clueProgress", { turn: stage.turn + 1, total: names.length });
  const pass = auto
    ? t("imposter.cluePass", { pass: stage.pass, total: settings.cluePasses })
    : t("local.passOpen", { pass: stage.pass });

  return (
    <main className="screen">
      <div className="slip slip-paper speaker">
        <span className="slip-note">{t("local.speakCue")}</span>
        <h1 className="slip-word" style={{ "--len": [...speaker].length } as CSSProperties}>
          {speaker}
        </h1>
        <span className="slip-note num">
          {pass} · {clue}
        </span>
      </div>

      {auto && (
        // The key is what starts each turn on a full clock: a new key is a new
        // component, with new state. See useTurnClock.
        <TurnClock
          key={`${stage.pass}:${stage.turn}`}
          seconds={settings.clueSeconds}
          paused={paused}
          onExpire={() => dispatch({ type: "turnDone" })}
        />
      )}

      <ol className="roster speak-order">
        {names.map((_, turn) => {
          const seat = speakerSeat(game, turn);
          return (
            <li key={seat} className="roster-row" data-active={turn === stage.turn}>
              <Avatar name={names[seat]} hue={hue(seat)} />
              <span className="roster-name">{names[seat]}</span>
            </li>
          );
        })}
      </ol>

      <div className="dock">
        {auto ? (
          <button className="secondary" onClick={() => setPaused(!paused)}>
            {paused ? t("local.resume") : t("local.pause")}
          </button>
        ) : (
          <>
            <button className="primary" onClick={() => dispatch({ type: "turnDone" })}>
              {t("local.nextPlayer")}
            </button>
            <button className="secondary" onClick={() => dispatch({ type: "openAccuse" })}>
              {t("local.reveal")}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

interface ClockProps {
  seconds: number;
  paused: boolean;
  onExpire: () => void;
}

function TurnClock({ seconds, paused, onExpire }: ClockProps) {
  const { t } = useT();
  const left = useTurnClock(seconds, paused, onExpire);
  return (
    <Countdown
      seconds={left}
      total={seconds}
      label={paused ? t("local.paused") : t("imposter.clueCountdown", { n: left })}
    />
  );
}

// Auto mode's end of the turns. The table can talk for as long as it likes, so
// there is no clock here, only the button the turns were holding back.
export function DiscussView({ dispatch }: { dispatch: Dispatch }) {
  const { t } = useT();

  return (
    <main className="screen">
      <div className="slip slip-paper speaker">
        <h1 className="discuss-heading">{t("imposter.voteHeading")}</h1>
        <span className="slip-note">{t("local.discussBody")}</span>
      </div>

      <div className="dock">
        <button className="primary" onClick={() => dispatch({ type: "openAccuse" })}>
          {t("local.reveal")}
        </button>
      </div>
    </main>
  );
}
