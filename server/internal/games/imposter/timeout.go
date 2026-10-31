package imposter

import "github.com/mintthiha/party-games/server/internal/game"

// missedClue is the text recorded for a player whose clue clock ran out. It is
// stored rather than skipped quietly on purpose — see advanceTimer — and the
// web client renders it as "(ran out of time)" instead of an empty word.
const missedClue = ""

// advanceTimer answers one of this game's own clocks running out. tag says
// which clock; today there is only the clue turn.
//
// A clock that expires in a phase it does not belong to is ignored rather than
// treated as an error: the room already drops expiries from a previous arming,
// so the only way to get here out of phase would be a bug, and ending a live
// round over it would be worse than doing nothing.
func advanceTimer(st *state, tag string) (game.State, []game.Effect, error) {
	switch {
	case tag == tagClueTurn && st.phase == phaseClues:
		return clueTurnTimedOut(st)
	case tag == tagVote && st.phase == phaseVote:
		return voteTimedOut(st)
	case tag == tagSteal && st.phase == phaseSteal:
		return stealTimedOut(st)
	default:
		return st, nil, nil
	}
}

// voteTimedOut closes the ballot on time. Everyone who has not voted is
// recorded as abstaining, which is the honest reading of saying nothing, and
// the round resolves on the votes that did arrive.
//
// Abstentions do not count towards any suspect, so a room where nobody voted
// ends in no removal and the imposter escaping — the same outcome as a room
// that deliberately all abstained. A phone that died should not be able to
// convict anyone.
func voteTimedOut(st *state) (game.State, []game.Effect, error) {
	next := st.clone()
	for _, id := range next.order {
		if _, voted := next.votes[id]; !voted {
			next.votes[id] = "" // the sentinel for "no suspect"
		}
	}
	return next, resolveVote(next), nil
}

// stealTimedOut ends a caught imposter's guess that never came. An unmade
// guess is a wrong guess: the crew's win stands, exactly as it would have if
// the imposter had guessed and missed.
func stealTimedOut(st *state) (game.State, []game.Effect, error) {
	next := st.clone()
	next.phase = phaseOutcome
	votedOutID, _ := tally(next)
	applyAward(next, true, false)

	res := result{
		votedOutID:     votedOutID,
		crewWon:        true,
		stealAttempted: false,
	}
	effects := make([]game.Effect, 0, len(next.order))
	for _, id := range next.order {
		effects = append(effects, game.Send{To: []string{id}, Msg: outcomeFor(next, id, res)})
	}
	return next, effects, nil
}

// clueTurnTimedOut ends one player's clue turn.
func clueTurnTimedOut(st *state) (game.State, []game.Effect, error) {
	next := st.clone()

	// The missed turn is recorded, not skipped. Skipping looks kinder, but it
	// hands the imposter a free way out: saying nothing is the safest clue
	// there is, so a quiet skip would make stalling the dominant strategy for
	// exactly the player the crew is trying to catch. An entry everyone can
	// see puts the cost back where it belongs — the table knows who ran out.
	next.clues = append(next.clues, clueEntry{playerID: next.order[next.turn], text: missedClue})
	next.turn++

	// Same rule as a submitted clue: next player, next pass, or the vote.
	return next, nextClue(next), nil
}
