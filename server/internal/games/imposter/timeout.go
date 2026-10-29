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
	if tag != tagClueTurn || st.phase != phaseClues {
		return st, nil, nil
	}

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
