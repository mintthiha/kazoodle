import type { MessageKey } from "../../i18n";
import { AwardReason, Kind, VoteKind } from "./gen/fibblash_pb";

// The wire's enums and keys, as the sentence keys that describe them. Typed
// maps rather than string-built keys, so a renamed key is a compile error and
// an enum value with no sentence cannot slip through.

export const KIND_NAME: Record<Kind, MessageKey> = {
  [Kind.UNSPECIFIED]: "fb.kind.1",
  [Kind.REAL]: "fb.kind.1",
  [Kind.CREATIVE]: "fb.kind.2",
  [Kind.HYBRID]: "fb.kind.3",
};

export const KIND_HELP: Record<Kind, MessageKey> = {
  [Kind.UNSPECIFIED]: "fb.kindHelp.1",
  [Kind.REAL]: "fb.kindHelp.1",
  [Kind.CREATIVE]: "fb.kindHelp.2",
  [Kind.HYBRID]: "fb.kindHelp.3",
};

export const VOTE_QUESTION: Record<VoteKind, MessageKey> = {
  [VoteKind.UNSPECIFIED]: "fb.vote.1",
  [VoteKind.TRUTH]: "fb.vote.1",
  [VoteKind.FUNNY]: "fb.vote.2",
  [VoteKind.MATCHUP]: "fb.vote.3",
};

export const AWARD: Record<AwardReason, MessageKey> = {
  [AwardReason.UNSPECIFIED]: "fb.award.3",
  [AwardReason.FOUND_TRUTH]: "fb.award.1",
  [AwardReason.FOOLED]: "fb.award.2",
  [AwardReason.VOTES]: "fb.award.3",
  [AwardReason.SWEEP]: "fb.award.4",
};

const CATEGORY: Record<string, MessageKey> = {
  history: "fb.cat.history",
  geography: "fb.cat.geography",
  science: "fb.cat.science",
  animals: "fb.cat.animals",
  food: "fb.cat.food",
  technology: "fb.cat.technology",
  movies: "fb.cat.movies",
  music: "fb.cat.music",
  sports: "fb.cat.sports",
  weird: "fb.cat.weird",
  everyday: "fb.cat.everyday",
  ridiculous: "fb.cat.ridiculous",
};

/** The sentence key for a category, or null for one this build has never heard
 * of: a newer server can add categories, and an unlabelled one is better left
 * off than shown as a raw key. */
export function categoryKey(category: string): MessageKey | null {
  return CATEGORY[category] ?? null;
}

/** Whether a kind of question has a true answer hidden among the lies. */
export function hasTruth(kind: Kind): boolean {
  return kind === Kind.REAL || kind === Kind.HYBRID;
}
