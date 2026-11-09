import { useState, type CSSProperties } from "react";
import { useT } from "../../../i18n";
import { Standings } from "./Standings";
import { joinNames } from "./names";
import { clueGivers, psychicWon, roundPoints, totalRounds, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  onNext: () => void;
}

// The secret comes out, as a short sequence nobody has to tap through.
//
// The Psychic's guess goes down on a slip, the slip trembles, and it turns over to
// show the real number. Right: a yellow field bursts out of it and paper flies.
// Wrong: a red shutter drops over the room and the screen shudders. Then the
// headline lands, with the two numbers, the points and the scores.
//
// Everything is CSS on this one mounted screen, with no timers: the styles written
// outside `.wl-vs-live` ARE the finished result, and the animations only hold pieces
// back until their moment. So a tap to skip (which takes `wl-vs-live` away) and
// reduced motion (which never applies the animations) both land on exactly the
// screen the sequence ends on.
export function ResultView({ game, onNext }: Props) {
  const { locale, t } = useT();
  const [skipped, setSkipped] = useState(false);

  const { names, round } = game;
  // The guess and the secret are always set by the time a round reaches its
  // result. The fallbacks only keep TypeScript honest about a shape it can't see.
  const guess = round.guess ?? 0;
  const secret = round.secret ?? 0;
  const won = psychicWon(round);
  const givers = clueGivers(game);
  const psychic = names[round.psychic];
  const lastRound = game.roundIndex + 1 >= totalRounds(game);

  const points = won
    ? t("wl.pointsPsychic", { n: givers.length, who: psychic })
    : `${t("wl.offBy", { n: Math.abs(guess - secret) })} ${t("wl.pointsGivers", {
        who: joinNames(
          givers.map((seat) => names[seat]),
          locale,
        ),
      })}`;

  return (
    <div
      className={skipped ? "wl-vs" : "wl-vs wl-vs-live"}
      data-side={won ? "hit" : "miss"}
      onClick={() => setSkipped(true)}
    >
      <div className="wl-vs-suspense" aria-hidden="true">
        <p className="wl-vs-question">{t("wl.suspense", { who: psychic })}</p>
        <div className="wl-vs-tremble">
          <div className="wl-vs-card">
            <div className="wl-vs-face wl-vs-front">
              <span className="wl-vs-digit num">{guess}</span>
            </div>
            <div className="wl-vs-face wl-vs-back">
              <span className="wl-vs-label">{t("wl.theNumber")}</span>
              <span className="wl-vs-digit num">{secret}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="wl-vs-field" aria-hidden="true" />
      {won && <FlyingSlips count={36} />}

      <main className="screen wl-vs-result">
        <h1 className="wl-vs-headline">{won ? t("wl.psychicWon", { who: psychic }) : t("wl.giversWon")}</h1>

        <div className="wl-reveal">
          <div className="wl-reveal-card wl-reveal-secret">
            <span className="wl-reveal-label">{t("wl.theNumber")}</span>
            <span className="wl-reveal-number num">
              <mark>{secret}</mark>
            </span>
          </div>
          <div className="wl-reveal-card wl-reveal-guess">
            <span className="wl-reveal-label">{t("wl.resultGuess", { who: psychic })}</span>
            <span className="wl-reveal-number num">{guess}</span>
          </div>
        </div>

        <p className="wl-vs-line">{points}</p>

        <Standings names={names} scores={game.scores} deltas={roundPoints(game, guess)} />

        <div className="wl-vs-actions">
          <button className="wl-vs-next" onClick={onNext}>
            {lastRound ? t("wl.finalScores") : t("wl.nextRound", { who: names[game.roundIndex + 1] })}
          </button>
        </div>
      </main>
    </div>
  );
}

// A scattered value between 0 and 1 for slip `i`, with `salt` giving each property
// its own unrelated sequence, so the paper doesn't fly in visible chains. Unlike a
// Math.random call during render, it gives the same answer every render, so a
// re-render can't make the slips jump.
function scatter(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// The paper thrown up by a right guess. Purely decorative, and hidden by CSS when
// the sequence is not running.
function FlyingSlips({ count }: { count: number }) {
  return (
    <div className="wl-vs-flying" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className="wl-vs-fly"
          style={
            {
              "--x": scatter(i, 1),
              "--y": scatter(i, 2),
              "--spin": scatter(i, 3),
              "--wait": scatter(i, 4),
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
