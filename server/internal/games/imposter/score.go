package imposter

import "sort"

// How a round pays out. Three outcomes, three prices: catching the imposter is
// the common case and worth the least per player; the imposter is one person
// against the room, so escaping pays double and stealing a lost round pays
// triple.
const (
	pointsCatch  = 1 // to each crew member still in the round, when the imposter is caught and fails the steal
	pointsEscape = 2 // to the imposter, when the vote fails to catch them
	pointsSteal  = 3 // to the imposter instead, when caught but their steal guess is right
)

// defaultRounds and maxRounds bound StartOptions.rounds. Three is long enough
// for a comeback and short enough to finish; the cap exists only so a buggy or
// hostile client can't ask for a match that never ends.
const (
	defaultRounds = 3
	maxRounds     = 10
)

// roundsFromOption turns the host's requested round count into one this game
// will actually play. Out-of-range values are corrected rather than rejected,
// so an older or sloppier client gets a sane match instead of a failed start.
func roundsFromOption(requested int32) int {
	switch {
	case requested <= 0:
		return defaultRounds
	case requested > maxRounds:
		return maxRounds
	default:
		return int(requested)
	}
}

// award returns what each player earned from a round that ended this way, as
// a player id -> points map with no zero entries. It is pure: give it the same
// arguments and it answers the same way, which is the whole reason it lives
// apart from the phase handlers.
//
// order is who was still in the round when it resolved, so a player who left
// before the vote closed earns nothing from it — they weren't there for the
// catch.
func award(order []string, imposterID string, caught, stealCorrect bool) map[string]int32 {
	out := make(map[string]int32, len(order))
	switch {
	case !caught:
		out[imposterID] = pointsEscape
	case stealCorrect:
		out[imposterID] = pointsSteal
	default:
		for _, id := range order {
			if id != imposterID {
				out[id] = pointsCatch
			}
		}
	}
	return out
}

// applyAward records a resolved round's points on next, which must be a clone
// the caller owns. It fills deltas (this round) and adds them into scores (the
// match so far).
func applyAward(next *state, caught, stealCorrect bool) {
	next.deltas = award(next.order, next.imposterID, caught, stealCorrect)
	for id, pts := range next.deltas {
		next.scores[id] += pts
	}
}

// leaders returns the highest-scoring players still in the round, in roster
// order, or nothing if no one has scored yet. Plural because a tie at the top
// is a shared win, not a coin flip. Players who left are excluded: a match
// they walked out of isn't theirs to win.
func leaders(st *state) []string {
	var best int32
	for _, id := range st.order {
		if s := st.scores[id]; s > best {
			best = s
		}
	}
	if best == 0 {
		return nil
	}
	out := make([]string, 0, len(st.order))
	for _, id := range st.roster { // roster, not order, so the result is in join order
		if st.scores[id] == best && contains(st.order, id) {
			out = append(out, id)
		}
	}
	return out
}

// standings ranks the whole roster by score, highest first, ties broken by
// join order so the table never reshuffles between rounds for no reason.
// Everyone appears, including players who left and players on zero.
func standings(st *state) []scoreRow {
	rows := make([]scoreRow, len(st.roster))
	for i, id := range st.roster {
		rows[i] = scoreRow{playerID: id, score: st.scores[id], delta: st.deltas[id], joined: i}
	}
	// SliceStable isn't needed: the joined tiebreak already makes the order
	// total, so the sort has nothing left to decide.
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].score != rows[j].score {
			return rows[i].score > rows[j].score
		}
		return rows[i].joined < rows[j].joined
	})
	return rows
}

// scoreRow is one line of the standings table, before it becomes a wire
// message. joined is the player's index in the roster, used only as the
// tiebreak.
type scoreRow struct {
	playerID string
	score    int32
	delta    int32
	joined   int
}
