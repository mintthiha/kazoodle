package wavelength

import (
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/mintthiha/party-games/server/internal/game"
)

// minPlayers is the smallest table: one Psychic and two Clue Givers, so a
// guess is read from more than one person.
const minPlayers = 3

// The secret number's range, inclusive at both ends.
const (
	lowest  = 1
	highest = 10
)

// categoriesPerRound is how many categories the Psychic asks before guessing.
const categoriesPerRound = 3

// Length limits, counted in characters (runes) rather than bytes, so "é" counts
// as one the way it does in the browser. They match the one-phone version.
const (
	maxCategoryLength = 32
	maxAnswerLength   = 40
)

// Rejection codes a client translates into a sentence. See game.Rejected.
const (
	codeCategoryEmpty    = "wavelength.category_empty"
	codeCategoryTooLong  = "wavelength.category_too_long"
	codeCategoryRepeated = "wavelength.category_repeated"
	codeAnswerEmpty      = "wavelength.answer_empty"
	codeAnswerTooLong    = "wavelength.answer_too_long"
	codeNumberOutOfRange = "wavelength.number_out_of_range"
)

// checkCategory returns a *game.Rejected if name cannot be the next category,
// given the ones already asked. name must already be trimmed.
func checkCategory(asked []category, name string) error {
	if name == "" {
		return game.Reject(codeCategoryEmpty, "a category can't be empty")
	}
	if utf8.RuneCountInString(name) > maxCategoryLength {
		return game.Reject(codeCategoryTooLong, "category %q is over %d characters", name, maxCategoryLength)
	}
	for _, c := range asked {
		// EqualFold compares ignoring case, so "Animals" repeats "animals".
		if strings.EqualFold(c.name, name) {
			return game.Reject(codeCategoryRepeated, "category %q was already asked", name)
		}
	}
	return nil
}

// checkAnswer returns a *game.Rejected if text cannot be an answer. text must
// already be trimmed.
func checkAnswer(text string) error {
	if text == "" {
		return game.Reject(codeAnswerEmpty, "an answer can't be empty")
	}
	if utf8.RuneCountInString(text) > maxAnswerLength {
		return game.Reject(codeAnswerTooLong, "answer is over %d characters", maxAnswerLength)
	}
	return nil
}

// checkNumber returns a *game.Rejected unless n is a valid secret or guess.
func checkNumber(n int32) error {
	if n < lowest || n > highest {
		return game.Reject(codeNumberOutOfRange, "%d is not between %d and %d", n, lowest, highest)
	}
	return nil
}

// award is what each player earns from a guess. A right guess is worth one
// point to the Psychic for every Clue Giver they read; a wrong one is worth one
// point to each Clue Giver. Both sides can win the same total, so a round is
// fair whatever the size of the table.
func award(psychicID string, givers []string, won bool) map[string]int32 {
	out := make(map[string]int32, len(givers))
	if won {
		out[psychicID] = int32(len(givers))
		return out
	}
	for _, id := range givers {
		out[id] = 1
	}
	return out
}

// givingOrder is the Clue Givers for a round with this Psychic: everyone else
// present, going round the table from the Psychic's left. It returns a new
// slice.
func givingOrder(present []string, psychicID string) []string {
	start := indexOf(present, psychicID)
	n := len(present)
	out := make([]string, 0, n-1)
	for i := 1; i < n; i++ {
		out = append(out, present[(start+i)%n])
	}
	return out
}

// leaders is the highest-scoring players still in the match, in join order,
// or nothing if nobody has scored. Plural because a tie is a shared win.
func leaders(s *state) []string {
	var best int32
	for _, id := range s.present {
		if s.scores[id] > best {
			best = s.scores[id]
		}
	}
	if best == 0 {
		return nil
	}
	var out []string
	for _, id := range s.present {
		if s.scores[id] == best {
			out = append(out, id)
		}
	}
	return out
}

// scoreRow is one line of the standings before it becomes a wire message.
type scoreRow struct {
	playerID string
	score    int32
	delta    int32
}

// standings ranks the whole roster by score, highest first, ties in join order
// so two players on the same score never swap places between rounds.
func standings(s *state) []scoreRow {
	rows := make([]scoreRow, len(s.roster))
	for i, id := range s.roster {
		rows[i] = scoreRow{playerID: id, score: s.scores[id], delta: s.deltas[id]}
	}
	// SliceStable keeps equal scores in roster (join) order.
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].score > rows[j].score })
	return rows
}
