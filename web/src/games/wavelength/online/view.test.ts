import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  WavelengthServerMessageSchema,
  type WavelengthServerMessage,
} from "../gen/wavelength_pb";
import { fold, roleOf, type View } from "./view";

type Body = MessageInitShape<typeof WavelengthServerMessageSchema>["body"];
const msg = (body: Body) => create(WavelengthServerMessageSchema, { body });

const roundStart = (over: Record<string, unknown> = {}) =>
  msg({
    case: "roundStart",
    value: { round: 1, totalRounds: 3, psychicId: "p1", giverIds: ["p2", "p3"], secret: 6, ...over },
  } as Body);

function play(...messages: WavelengthServerMessage[]): View | null {
  return messages.reduce<View | null>(fold, null);
}

const animals = { name: "Animals", answers: [{ playerId: "p2", text: "Cats" }] };

describe("fold", () => {
  it("ignores everything before the first RoundStart", () => {
    expect(play(msg({ case: "talkPhase", value: {} }))).toBeNull();
  });

  it.each([
    { name: "a drawn number, typed", over: {}, stage: "category" },
    { name: "a drawn number, spoken", over: { spokenAnswers: true }, stage: "talk" },
    { name: "a chosen number", over: { chosenSecret: true, secret: 0 }, stage: "choose" },
  ])("opens a round: $name", ({ over, stage }) => {
    expect(play(roundStart(over))?.stage).toBe(stage);
  });

  it("learns a chosen number", () => {
    const v = play(roundStart({ chosenSecret: true, secret: 0 }), msg({ case: "secretSet", value: { secret: 4 } }));
    expect(v?.secret).toBe(4);
  });

  it("follows a typed round from category to answers and back", () => {
    let v = play(
      roundStart(),
      msg({ case: "answerPhase", value: { category: "Animals", number: 1, total: 3, categories: [] } }),
      msg({ case: "answerProgress", value: { answeredIds: ["p2"], total: 2 } }),
    );
    expect(v).toMatchObject({ stage: "answer", open: { name: "Animals", number: 1 }, answered: ["p2"] });

    v = fold(v, msg({ case: "categoryTurn", value: { number: 2, total: 3, categories: [animals] } }));
    expect(v).toMatchObject({ stage: "category", open: null, answered: [] });
    expect(v?.categories.map((c) => c.name)).toEqual(["Animals"]);
  });

  it("starts the next round from scratch", () => {
    const v = play(
      roundStart(),
      msg({ case: "guessTurn", value: { categories: [animals] } }),
      roundStart({ round: 2, psychicId: "p2", giverIds: ["p3", "p1"] }),
    );
    expect(v).toMatchObject({ stage: "category", categories: [], result: null });
    expect(v?.start.round).toBe(2);
  });
});

describe("roleOf", () => {
  const v = play(roundStart())!;
  it.each([
    ["p1", "psychic"],
    ["p2", "giver"],
    ["p9", "watcher"],
  ])("%s is the %s", (id, role) => {
    expect(roleOf(v, id)).toBe(role);
  });
});
