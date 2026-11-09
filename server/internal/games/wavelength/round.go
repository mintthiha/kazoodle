package wavelength

import (
	"math/rand/v2"

	"github.com/mintthiha/party-games/server/internal/game"
)

// beginRound returns the state for the next round: the next player in the
// queue is the Psychic, everyone else present is a Clue Giver, and the number
// is drawn (or left at 0 for the Clue Givers to choose). s is not modified.
//
// Init uses it too, on a round-zero seed, so there is one place that decides
// what starting a round means. The caller makes sure the queue is not empty.
func (s *state) beginRound() *state {
	psychicID := s.queue[0]

	next := &state{
		roster:  s.roster,
		present: s.present,
		// A re-slice, not a copy: it shares the array but nothing ever writes
		// into a queue in place (leave.go builds a new one), so that is safe.
		queue:  s.queue[1:],
		scores: copyPoints(s.scores),
		round:  s.round + 1,
		spoken: s.spoken,
		chosen: s.chosen,

		psychicID: psychicID,
		givers:    givingOrder(s.present, psychicID),
		pending:   make(map[string]string),
		deltas:    make(map[string]int32),
	}
	if s.chosen {
		next.phase = phaseChoose
	} else {
		next.secret = lowest + rand.IntN(highest-lowest+1)
		next.phase = afterSecret(next)
	}
	return next
}

// afterSecret is the phase a round enters once its number is known.
func afterSecret(s *state) phase {
	if s.spoken {
		return phaseTalk
	}
	return phaseCategory
}

// roundStart is the effects that open a round: a private RoundStart for each
// player, then whatever the opening phase announces.
func roundStart(s *state) []game.Effect {
	effects := make([]game.Effect, 0, len(s.present)+1)
	for _, id := range s.present {
		effects = append(effects, game.Send{To: []string{id}, Msg: roundStartFor(s, id)})
	}
	return append(effects, phaseOpening(s)...)
}

// phaseOpening is the broadcast that tells everyone which phase the round has
// just entered. Every way into a phase comes through here, so no path can move
// the round on and forget to say so.
func phaseOpening(s *state) []game.Effect {
	switch s.phase {
	case phaseCategory:
		return []game.Effect{game.Send{Msg: categoryTurn(s)}}
	case phaseAnswer:
		return []game.Effect{game.Send{Msg: answerPhase(s)}}
	case phaseTalk:
		return []game.Effect{game.Send{Msg: talkPhase()}}
	case phaseGuess:
		return []game.Effect{game.Send{Msg: guessTurn(s)}}
	default:
		// phaseChoose is announced by RoundStart itself, and phaseResult by
		// the guess handler, which has the result to send.
		return nil
	}
}

// closeCategory freezes the open category's answers in giver order and moves
// on: to the next category, or to the guess after the last one. It changes the
// state it is handed, so callers pass a clone they own.
func closeCategory(next *state) []game.Effect {
	open := &next.categories[len(next.categories)-1]
	open.answers = make([]answer, 0, len(next.givers))
	for _, id := range next.givers {
		open.answers = append(open.answers, answer{playerID: id, text: next.pending[id]})
	}
	next.pending = make(map[string]string)

	if len(next.categories) < categoriesPerRound {
		next.phase = phaseCategory
	} else {
		next.phase = phaseGuess
	}
	return phaseOpening(next)
}
