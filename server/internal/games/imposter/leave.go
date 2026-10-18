package imposter

import (
	"fmt"

	"github.com/mintthiha/party-games/server/internal/game"
)

// Leave applies one player's departure mid-round, implementing game.Leaver.
// Without it the room would end the whole round the moment anyone's phone
// died — see game.Leaver's doc comment for why it's a separate interface.
//
// The round carries on wherever that still makes sense. It's abandoned in two
// cases: the imposter left (there's nobody left to catch), or too few players
// remain to play on. Abandoning ends the whole match, scores included: there
// is no way to replay a round whose imposter walked out, and carrying half a
// scoreboard into a game the room has to restart anyway would be worse than
// starting clean.
//
// A departure between rounds is the gentler case. The results screen stays up,
// the player drops out of the turn order, and the next round — if there still
// can be one — is dealt to whoever is left. Their points stay in the standings
// (they earned them) but they can no longer win the match; see leaders.
//
// A departed player's clue stays in the recap. The room already saw it and
// argued about it, so dropping it would quietly rewrite what happened; the web
// client already falls back to showing a bare id for a name it can't resolve.
func (Game) Leave(current game.State, playerID string) (game.State, []game.Effect, error) {
	st, ok := current.(*state)
	if !ok {
		// The room only ever hands a game its own state; a mismatch is a bug.
		return current, nil, fmt.Errorf("imposter: unexpected state type %T", current)
	}
	idx := indexOf(st.order, playerID)
	if idx < 0 {
		return st, nil, nil // not in this round; nothing to do
	}

	next := st.clone()
	// clone shares order with st, and st must stay untouched, so build a new
	// slice instead of cutting this one in place.
	next.order = make([]string, 0, len(st.order)-1)
	next.order = append(next.order, st.order[:idx]...)
	next.order = append(next.order, st.order[idx+1:]...)
	// Their readiness and their vote go with them. Otherwise allReady and
	// allVoted would keep counting a player who is no longer in order, and the
	// round could never finish.
	delete(next.ready, playerID)
	delete(next.votes, playerID)

	// A finished round is just a results screen. Let whoever is left keep
	// reading it, no matter who left or how few remain.
	if st.phase == phaseOutcome {
		return next, nil, nil
	}
	if playerID == st.imposterID {
		return next, []game.Effect{game.EndGame{Reason: "imposter_left"}}, nil
	}
	if len(next.order) < minPlayers {
		return next, []game.Effect{game.EndGame{Reason: "player_left"}}, nil
	}

	switch st.phase {
	case phaseReveal:
		// The one player everyone was waiting on may have been the one who
		// left, in which case the reveal is complete now.
		if next.allReady() {
			next.phase = phaseClues
			return next, []game.Effect{game.Send{Msg: clueTurn(next)}}, nil
		}
		return next, []game.Effect{game.Send{Msg: revealProgress(next)}}, nil

	case phaseClues:
		// turn is an index into order, so removing someone ahead of it shifts
		// it down by one. Removing the current turn-holder leaves turn alone:
		// the next player slides into that slot and is up now.
		if idx < next.turn {
			next.turn--
		}
		// Whoever left may have been the last player still to give a clue this
		// pass, so this goes through the same rule a submitted clue does: the
		// pass may now be over, and with it the whole clue phase.
		return next, nextClue(next), nil

	case phaseVote:
		// Anyone who voted for the player who left no longer has a valid vote.
		// Deleting from a map while ranging over it is well defined in Go:
		// entries removed before they are reached are simply not visited.
		for voter, suspect := range next.votes {
			if suspect == playerID {
				delete(next.votes, voter)
			}
		}
		if next.allVoted() {
			// The player who left was the last one the round was waiting on.
			return next, resolveVote(next), nil
		}
		// A fresh VotePhase, not just a VoteProgress: the candidate list itself
		// changed, and a client builds its ballot from the VotePhase it was
		// handed. Leaving that stale would keep the departed player tappable,
		// and the vote timer auto-submits whatever is selected — so the vote
		// would be rejected as naming someone who isn't in the room, and that
		// player's vote would never register at all.
		//
		// Clients treat it as a new ballot: countdown restarts, selections
		// clear. Votes for players who are still here are kept, since a vote is
		// replaceable right up until it's tallied, so those players can leave
		// theirs as it was — which is why a VoteProgress rides along, to keep
		// the "n / m voted" count honest on the new ballot.
		return next, []game.Effect{
			game.Send{Msg: votePhase(next)},
			game.Send{Msg: voteProgress(next)},
		}, nil

	case phaseSteal:
		// Everyone is waiting on the imposter, who is still here — a departing
		// imposter was handled above. Nothing to announce.
		return next, nil, nil

	default:
		return next, nil, fmt.Errorf("imposter: leave in unexpected phase %s", st.phase)
	}
}
