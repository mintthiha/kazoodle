import { useT } from "../../i18n";
import { Avatar } from "../../players/Avatar";
import { makeSeatHue } from "./seatHue";
import { MAX_NAME_LENGTH, duplicateSeats, resizeNames, resolveNames, type SeatBounds } from "./seats";

interface Props {
  /** As typed, so a blank seat stays blank and keeps its "Player 3" placeholder. */
  names: string[];
  bounds: SeatBounds;
  onChange: (names: string[]) => void;
}

// Who is playing: a stepper for how many, and a name per seat. A blank name is
// fine and becomes "Player 3", so the shortest path to a game is one tap. Two
// seats with the same name are outlined; the screen around this decides what to
// say about it and whether it blocks starting.
export function SeatEditor({ names, bounds, onChange }: Props) {
  const { t } = useT();

  const resolved = resolveNames(names, (n) => t("local.playerN", { n }));
  const clashes = duplicateSeats(resolved);
  const hue = makeSeatHue(names.length);

  function rename(seat: number, name: string) {
    onChange(names.map((old, i) => (i === seat ? name : old)));
  }

  return (
    <section>
      <div className="seat-head">
        <h2>{t("lobby.players")}</h2>
        <div className="stepper">
          <button
            className="secondary"
            aria-label={t("local.removePlayer")}
            disabled={names.length <= bounds.min}
            onClick={() => onChange(resizeNames(names, names.length - 1, bounds))}
          >
            −
          </button>
          <output className="stepper-count num" aria-live="polite">
            {/* Keyed so each change remounts the digit and replays its tick (see
                .stepper-digit). The live region stays put, or screen readers
                would miss the change. */}
            <span key={names.length} className="stepper-digit">
              {names.length}
            </span>
          </output>
          <button
            className="secondary"
            aria-label={t("local.addPlayer")}
            disabled={names.length >= bounds.max}
            onClick={() => onChange(resizeNames(names, names.length + 1, bounds))}
          >
            +
          </button>
        </div>
      </div>

      <ol className="seat-list">
        {names.map((name, seat) => (
          <li key={seat} className="seat-row" data-clash={clashes.has(seat)}>
            <Avatar name={resolved[seat]} hue={hue(seat)} />
            <input
              value={name}
              onChange={(e) => rename(seat, e.target.value)}
              placeholder={t("local.playerN", { n: seat + 1 })}
              aria-label={t("local.nameLabel", { n: seat + 1 })}
              aria-invalid={clashes.has(seat)}
              autoComplete="off"
              autoCapitalize="words"
              maxLength={MAX_NAME_LENGTH}
              enterKeyHint="next"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // Typing a whole table's names one-handed: Enter moves down the
                // list, so nobody has to aim for the next box.
                const next = e.currentTarget.closest("li")?.nextElementSibling;
                next?.querySelector("input")?.focus();
              }}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
