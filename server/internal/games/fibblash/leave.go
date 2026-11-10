package fibblash

import (
	"fmt"

	"github.com/mintthiha/party-games/server/internal/game"
)

// Leave applies one player's departure, implementing game.Leaver. Without it
// the room would end the whole match the moment any phone left.
//
// The match carries on unless fewer than minPlayers remain, in which case it
// goes straight to the final standings. Otherwise the player simply stops
// being waited on: whatever they already wrote stays on the ballot (and can
// still fool people, and still score for them), any vote they cast still
// counts, and their row stays on the leaderboard.
//
// A player whose phone has only dropped has not left. The room holds their
// seat for a while; the game does not hear about it and keeps running on its
// clocks. Leave is called only once the seat is given up.
func (g *Game) Leave(current game.State, playerID string) (game.State, []game.Effect, error) {
	st, ok := current.(*state)
	if !ok {
		return current, nil, fmt.Errorf("fibblash: unexpected state type %T", current)
	}
	// Every return below that does not change phase says KeepTimer: the room
	// cancels its clock after any effects that do not, and a departure must not
	// freeze the match.
	if !st.isPresent(playerID) || st.phase == phaseFinal {
		return st, []game.Effect{game.KeepTimer{}}, nil
	}

	next := st.clone()
	next.present = without(st.present, playerID)

	if len(next.present) < minPlayers {
		next.endedEarly = true
		next.phase = phaseFinal
		return next, enter(next), nil
	}

	switch st.phase {
	case phaseAnswer:
		return next, []game.Effect{
			game.Send{Msg: answerProgress(next)},
			waitOrSettle(next, next.allAnswered()),
		}, nil

	case phaseTruth, phaseFunny, phaseMatchup:
		return next, []game.Effect{
			game.Send{Msg: voteProgress(next)},
			waitOrSettle(next, next.ballot().done(next)),
		}, nil

	default:
		// Intro, reveals and the leaderboard wait on nobody.
		return next, []game.Effect{game.KeepTimer{}}, nil
	}
}
