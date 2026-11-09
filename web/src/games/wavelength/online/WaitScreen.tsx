import type { ReactNode } from "react";
import { useT } from "../../../i18n";
import { Board, type BoardCategory } from "../Board";

interface Props {
  /** What the room is waiting on, in one line. */
  heading: string;
  /** A smaller line above the heading, e.g. "Answer locked in". */
  kicker?: string;
  /** "2 of 3 answered", while answers come in. */
  progress?: { n: number; total: number };
  /** The Clue Giver's own number, for phones allowed to see it. */
  number?: ReactNode;
  board: BoardCategory[];
  /** Mark the newest category as just arrived. */
  freshNewest?: boolean;
}

// Every phone that isn't acting right now: whose move it is, how far along the
// room is, and everything said so far, so nobody stares at a blank screen.
export function WaitScreen({ heading, kicker, progress, number, board, freshNewest }: Props) {
  const { t } = useT();

  return (
    <main className="screen">
      <div>
        {kicker && <p className="status">{kicker}</p>}
        <h1 className="wl-headline">{heading}</h1>
        {progress && (
          <p className="status num" aria-live="polite">
            {t("wl.answeredCount", { n: progress.n, total: progress.total })}
          </p>
        )}
      </div>

      {number}

      {board.length > 0 && (
        <section>
          <h2>{t("wl.soFar")}</h2>
          <Board categories={board} freshNewest={freshNewest} />
        </section>
      )}
    </main>
  );
}
