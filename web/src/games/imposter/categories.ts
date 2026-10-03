// The categories a host can restrict a round to. Keys must match the
// server's (server/internal/games/imposter/words.go's wordList categoryKeys)
// exactly — the server treats any other key as "any category", so a typo
// here silently degrades instead of erroring, which is why each key is
// listed right next to its server-side counterpart below.
import type { MessageKey } from "../../i18n/messages";

export interface CategoryOption {
  /** "" means "any category" — the server's default. */
  key: string;
  labelKey: MessageKey;
}

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { key: "", labelKey: "imposter.category.any" },
  { key: "places", labelKey: "imposter.category.places" },
  { key: "food", labelKey: "imposter.category.food" },
  { key: "animals", labelKey: "imposter.category.animals" },
  { key: "objects", labelKey: "imposter.category.objects" },
  { key: "activities", labelKey: "imposter.category.activities" },
  { key: "jobs", labelKey: "imposter.category.jobs" },
  { key: "weather", labelKey: "imposter.category.weather" },
];
