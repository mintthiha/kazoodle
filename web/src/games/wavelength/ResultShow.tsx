import { useState, type CSSProperties, type ReactNode } from "react";
import { useT } from "../../i18n";
import { Standings, type StandingRow } from "./Standings";

interface Props {
  /** The Psychic's display name. */
  psychic: string;
  guess: number;
  secret: number;
  won: boolean;
  /** Who scored what, in a sentence: "+3 for Ana". */
  pointsLine: string;
  rows: StandingRow[];
  /** A line between the points and the standings, e.g. who won the match. */
  note?: ReactNode;
  /** The buttons at the bottom. Anything with the wl-vs-next class gets the
   * button styling this screen uses. */
  actions: ReactNode;
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
//
// Shared by one-phone and online Wavelength; each works out the names and points
// from its own state and hands them in.
export function ResultShow({ psychic, guess, secret, won, pointsLine, rows, note, actions }: Props) {
  const { t } = useT();
  const [skipped, setSkipped] = useState(false);

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

        <p className="wl-vs-line">{pointsLine}</p>

        {note}

        <Standings rows={rows} />

        <div className="wl-vs-actions">{actions}</div>
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
