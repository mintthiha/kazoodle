package wavelength

import (
	"fmt"

	"github.com/mintthiha/party-games/server/internal/game"
)

// Leave applies one player's departure, implementing game.Leaver. Without it
// the room would end the whole match the moment any phone left.
//
// The match carries on unless fewer than minPlayers remain. What else happens
// depends on who left:
//
//   - The Psychic, mid-round: the round cannot be finished without them, so it
//     is dropped unscored and the next one is dealt. If they were the last
//     Psychic, the match ends.
//   - A Clue Giver: they drop out of the round. If the round was waiting on
//     them (their answer, or the chosen number), it stops waiting.
//
// Either way they are taken out of the Psychic queue, so total_rounds shrinks
// if they had not had their turn yet. Their points stay in the standings, and
// their answers stay on the board: the table already read them.
func (Game) Leave(current game.State, playerID string) (game.State, []game.Effect, error) {
	st, ok := current.(*state)
	if !ok {
		return current, nil, fmt.Errorf("wavelength: unexpected state type %T", current)
	}
	if indexOf(st.present, playerID) < 0 {
		return st, nil, nil // not in the match; nothing changes
	}

	next := st.clone()
	next.present = without(st.present, playerID)
	next.queue = without(st.queue, playerID)
	next.givers = without(st.givers, playerID)
	delete(next.pending, playerID)

	// A scored round is only a results screen, so let it stay up. It is resent
	// because what it says about the next round may just have changed: the
	// next Psychic may be the one who left, or there may be no next round now.
	if st.phase == phaseResult {
		return next, []game.Effect{game.Send{Msg: result(next)}}, nil
	}

	if len(next.present) < minPlayers {
		return next, []game.Effect{game.EndGame{Reason: "player_left"}}, nil
	}

	if playerID == st.psychicID {
		if len(next.queue) == 0 {
			return next, []game.Effect{game.EndGame{Reason: "psychic_left"}}, nil
		}
		// beginRound copies the match-level fields from next, including the
		// shrunken present and queue, and starts a fresh round from them.
		dealt := next.beginRound()
		return dealt, roundStart(dealt), nil
	}

	switch st.phase {
	case phaseChoose:
		// Nothing has been entered yet, so the round is dealt again to the
		// smaller table: if the chooser left, the next Clue Giver enters the
		// number instead. RoundStart resets every screen, which loses nothing
		// at this point.
		return next, roundStart(next), nil

	case phaseAnswer:
		if next.allAnswered() {
			return next, closeCategory(next), nil
		}
		return next, []game.Effect{game.Send{Msg: answerProgress(next)}}, nil

	default:
		// Category, talk and guess wait only on the Psychic, who is still here.
		return next, nil, nil
	}
}
