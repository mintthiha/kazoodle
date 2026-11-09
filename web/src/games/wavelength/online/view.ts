// What one phone shows in online Wavelength, as a pure fold over the server's
// messages: the current view plus one message gives the next view. No React and
// no socket, so every transition is testable on its own, and a reconnecting
// phone rebuilds its screen just by folding the replayed messages again.

import type { Category, Result, RoundStart, WavelengthServerMessage } from "../gen/wavelength_pb";

export type Stage = "choose" | "category" | "answer" | "talk" | "guess" | "result";

export interface View {
  /** This round's RoundStart: who the Psychic is, who the Clue Givers are. */
  start: RoundStart;
  stage: Stage;
  /** The number, if this phone may know it: 0 for the Psychic, and for everyone
   * until a chosen number has been entered. */
  secret: number;
  /** Every category whose answers are all in, oldest first. */
  categories: Category[];
  /** The category being answered right now, during the answer stage. */
  open: { name: string; number: number; total: number } | null;
  /** Who has answered the open category so far. Never what. */
  answered: string[];
  /** The scored round, once there is one. */
  result: Result | null;
}

/** The view a RoundStart opens with. A chosen number waits for the chooser; a
 * drawn one goes straight to the round, which the next message confirms. */
function opening(start: RoundStart): View {
  let stage: Stage = "category";
  if (start.chosenSecret) stage = "choose";
  else if (start.spokenAnswers) stage = "talk";
  return { start, stage, secret: start.secret, categories: [], open: null, answered: [], result: null };
}

/** Apply one server message. Before the first RoundStart there is no round to
 * show, so anything else is ignored until one arrives. */
export function fold(view: View | null, msg: WavelengthServerMessage): View | null {
  const body = msg.body;
  if (body.case === "roundStart") return opening(body.value);
  if (view === null) return null;

  switch (body.case) {
    case "secretSet":
      return { ...view, secret: body.value.secret };
    case "categoryTurn":
      return { ...view, stage: "category", categories: body.value.categories, open: null, answered: [] };
    case "answerPhase": {
      const { category, number, total, categories } = body.value;
      return { ...view, stage: "answer", categories, open: { name: category, number, total }, answered: [] };
    }
    case "answerProgress":
      return { ...view, answered: body.value.answeredIds };
    case "talkPhase":
      return { ...view, stage: "talk" };
    case "guessTurn":
      return { ...view, stage: "guess", categories: body.value.categories, open: null };
    case "result":
      return { ...view, stage: "result", result: body.value, categories: body.value.categories };
    default:
      return view;
  }
}

/** This phone's part in the round. */
export type Role = "psychic" | "giver" | "watcher";

/** A player who joined the room after the round was dealt is in neither list,
 * and only watches. */
export function roleOf(view: View, selfId: string): Role {
  if (view.start.psychicId === selfId) return "psychic";
  if (view.start.giverIds.includes(selfId)) return "giver";
  return "watcher";
}
