import { useState, type CSSProperties } from "react";
import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import { crewWon, isImposter, type LocalGame, type StealState } from "./localGame";
import { makeSeatHue } from "./seatHue";

interface Props {
  game: LocalGame;
  accused: number;
  /** Set when the accused really was an imposter. See the steal below. */
  steal?: StealState;
  onSteal: (correct: boolean) => void;
  onPlayAgain: () => void;
  onChangePlayers: () => void;
}

// The moment the whole table has been waiting for, and the one place in the app
// that plays a sequence nobody tapped for.
//
// The accused's name goes down on a slip, the slip trembles, and it turns over.
// Caught: a yellow field bursts out of the slip and paper flies. Wrong: a red
// shutter slams down from the top, the screen shudders, and black scraps sink.
//
// Everything is CSS on this one mounted screen, with no timers: the styles written
// outside `.vs-live` ARE the finished result, and the animations only hold pieces
// back until their moment. So there is one way to reach the end. Taking `vs-live`
// away (a tap to skip) or never applying the animations (reduced motion) both land
// on exactly what the sequence lands on.
//
// A caught imposter still has one way out: a guess at the word, said out loud. Only
// the table can rule on something spoken, so the result holds at "Caught!" with two
// buttons and without the word on screen, which would give the guess away. A ruling
// also takes `vs-live` away, so that a stolen win changes the colour outright instead
// of replaying the whole sequence for the other side.
export function VerdictView({ game, accused, steal, onSteal, onPlayAgain, onChangePlayers }: Props) {
  const { locale, t } = useT();
  const [skipped, setSkipped] = useState(false);

  const won = crewWon(game, accused, steal);
  const pending = steal === "pending";
  const decided = steal === "hit" || steal === "miss";
  const accusedName = game.names[accused];
  const hue = makeSeatHue(game.names.length);
  const imposters = game.partner === null ? [game.imposter] : [game.imposter, game.partner];

  function line(): string {
    if (steal === "hit") return t("local.stolenLine", { who: accusedName });
    if (steal === "miss") return t("local.missedLine", { who: accusedName });
    if (pending) return t("local.stealPrompt", { who: accusedName });
    return t("local.innocentLine", { who: accusedName });
  }

  function headline(): string {
    if (pending) return t("imposter.stealHeading");
    if (won) return t("imposter.crewWon");
    return t(game.partner === null ? "imposter.imposterWon" : "imposter.imposterWonPair");
  }

  return (
    <div
      className={skipped || decided ? "vs" : "vs vs-live"}
      data-side={won ? "crew" : "imposter"}
      onClick={() => setSkipped(true)}
    >
      <div className="vs-suspense" aria-hidden="true">
        <p className="vs-question">{t("local.suspense", { who: accusedName })}</p>
        <div className="vs-tremble">
          <div className="vs-card">
            <div
              className="vs-face vs-front"
              style={{ "--len": [...accusedName].length } as CSSProperties}
            >
              <span className="slip-word">{accusedName}</span>
            </div>
            <div className="vs-face vs-back">
              <span className="vs-back-word">
                {isImposter(game, accused) ? t("local.flipImposter") : t("local.flipInnocent")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="vs-field" aria-hidden="true" />
      <FlyingSlips count={won ? 40 : 18} />

      <main className="screen vs-result">
        <h1 className="vs-headline">{headline()}</h1>
        <p className="vs-line">{line()}</p>

        {pending ? (
          <div className="vs-actions">
            <p className="vs-question-steal">{t("local.stealQuestion")}</p>
            <button className="vs-again" onClick={() => onSteal(true)}>
              {t("local.stealHit")}
            </button>
            <button className="vs-change" onClick={() => onSteal(false)}>
              {t("local.stealMiss")}
            </button>
          </div>
        ) : (
          <>
            <dl className="verdict-facts vs-facts">
              {/* Everyone already knows a lone imposter who was caught. Otherwise this
                  is the reveal: who it really was, or who the other one was. */}
              {(!isImposter(game, accused) || imposters.length > 1) && (
                <div>
                  <dt>{t(imposters.length > 1 ? "imposter.theImposters" : "imposter.theImposter")}</dt>
                  {imposters.map((seat) => (
                    <dd key={seat} className="verdict-who">
                      <Avatar name={game.names[seat]} hue={hue(seat)} />
                      {game.names[seat]}
                    </dd>
                  ))}
                </div>
              )}
              <div>
                <dt>{t("imposter.theWord")}</dt>
                <dd className="verdict-word">
                  <span className="verdict-slip">{game.entry.word[locale]}</span>
                  <span className="verdict-category">{game.entry.category[locale]}</span>
                </dd>
              </div>
            </dl>

            <div className="vs-actions">
              <button className="vs-again" onClick={onPlayAgain}>
                {t("local.playAgain")}
              </button>
              <button className="vs-change" onClick={onChangePlayers}>
                {t("local.changePlayers")}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// A scattered value between 0 and 1 for slip `i`, with `salt` giving each property
// its own unrelated sequence. If the properties moved together the paper would fly
// in visible chains. It gives the same answer on every render, which a call to
// Math.random in the middle of a render would not, so a re-render cannot make the
// slips jump.
function scatter(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// The flying paper: the app's one material, torn up. Purely decorative, and hidden
// by CSS when the sequence is not running. See .vs-fly in local.css for how the
// side of the verdict changes the way they move.
function FlyingSlips({ count }: { count: number }) {
  return (
    <div className="vs-flying" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className="vs-fly"
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
