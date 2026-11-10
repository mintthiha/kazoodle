package fibblash

import (
	"fmt"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

// This file is the match's state machine: what ending each phase leads to, and
// what entering each phase tells the room. Every way of moving the match on —
// a clock running out, everyone being done, the host pressing Next — comes
// through endPhase, and every phase is announced by enter, so no path can move
// the match on and forget to say so.

// startQuestion returns the state for question i: match-level fields carried
// over from s, question-level fields fresh. s is not modified. Init uses it on
// a seed state too, so there is one place that decides what a question starts
// with.
func (s *state) startQuestion(i int) *state {
	return &state{
		roster:    s.roster,
		present:   s.present,
		locale:    s.locale,
		questions: s.questions,
		scores:    copyInts(s.scores),
		seed:      s.seed,
		times:     s.times,

		index:      i,
		phase:      phaseIntro,
		answers:    make(map[string]string),
		truthVotes: make(map[string]string),
		funnyVotes: make(map[string]string),
		deltas:     make(map[string]int),
	}
}

// endPhase moves the match on from wherever it is, as if the phase's clock had
// run out. It returns the new state and everything the room must be told.
func endPhase(st *state) (*state, []game.Effect) {
	if st.phase == phaseFinal {
		return st, nil // only Finish leaves the final standings
	}

	next := st.clone()
	switch st.phase {
	case phaseIntro:
		next.phase = phaseAnswer

	case phaseAnswer:
		openVoting(next)

	case phaseTruth:
		if next.q().kind == kindHybrid {
			next.phase = phaseFunny
		} else {
			reveal(next)
		}

	case phaseFunny:
		reveal(next)

	case phaseMatchup:
		next.apply(scoreMatchup(next.matchups[next.current]))
		next.phase = phaseMatchupResult

	case phaseMatchupResult:
		if next.current+1 < len(next.matchups) {
			next.current++
			next.awards = nil
			next.phase = phaseMatchup
		} else {
			next.phase = phaseLeaderboard
		}

	case phaseResult:
		next.phase = phaseLeaderboard

	case phaseLeaderboard:
		if next.index+1 < len(next.questions) {
			next = next.startQuestion(next.index + 1)
		} else {
			next.phase = phaseFinal
		}
	}
	return next, enter(next)
}

// openVoting closes the answers and builds whatever is voted on next. It
// changes the state it is handed, so callers pass a clone they own.
func openVoting(next *state) {
	q := next.q()
	if hasTruth(q.kind) {
		next.choices = buildBallot(next.order, next.answers, q.answer.in(next.locale), next.rng(rngBallot))
		next.voters = next.present
		if len(next.order) == 0 {
			// Nobody wrote a lie, so a vote would have one option. Go
			// straight to the reveal: nobody scores, the truth is shown.
			reveal(next)
			return
		}
		next.phase = phaseTruth
		return
	}

	next.matchups = buildMatchups(next.present, next.order, next.answers, next.rng(rngPairing))
	next.current = 0
	if len(next.matchups) == 0 {
		// Fewer than two answers: nothing to put head to head.
		next.phase = phaseLeaderboard
		return
	}
	next.phase = phaseMatchup
}

// reveal scores a REAL or HYBRID question and moves to its result.
func reveal(next *state) {
	awards := scoreTruth(next.choices, next.truthVotes)
	if next.q().kind == kindHybrid {
		awards = append(awards, scoreVotes(next.choices, next.funnyVotes)...)
	}
	next.apply(awards)
	next.phase = phaseResult
}

// enter is everything the room must be told as a phase begins: the broadcast
// that says which phase this is, any private message that goes with it, and
// the phase's clock.
func enter(s *state) []game.Effect {
	switch s.phase {
	case phaseIntro:
		return []game.Effect{game.Send{Msg: questionIntro(s)}, phaseClock(s)}

	case phaseAnswer:
		return []game.Effect{game.Send{Msg: answerPhase(s)}, phaseClock(s)}

	case phaseTruth, phaseFunny, phaseMatchup:
		effects := []game.Effect{game.Send{Msg: votePhase(s)}}
		for _, id := range s.present {
			effects = append(effects, game.Send{To: []string{id}, Msg: yourBallot(s, id)})
		}
		effects = append(effects, game.Send{Msg: voteProgress(s)})
		if s.ballot().done(s) {
			// Nobody can vote here (say, a pair in a three-player game where
			// the third player left). Show the choices, then move on.
			return append(effects, settleClock(s))
		}
		return append(effects, phaseClock(s))

	case phaseMatchupResult:
		return []game.Effect{game.Send{Msg: matchupResult(s)}, phaseClock(s)}

	case phaseResult:
		return []game.Effect{game.Send{Msg: questionResult(s)}, phaseClock(s)}

	case phaseLeaderboard:
		return []game.Effect{game.Send{Msg: leaderboard(s)}, phaseClock(s)}

	case phaseFinal:
		// No clock: the final standings stay up until the host sends Finish.
		return []game.Effect{game.Send{Msg: finalResult(s)}}

	default:
		return nil
	}
}

// tag names the clock of the phase the state is in. A timer that comes back
// with any other tag belongs to a phase already over and is ignored. The room
// already drops stale timers by itself (see room.applyTimer); this is the
// game's own check, so it does not depend on that.
func (s *state) tag() string {
	return fmt.Sprintf("q%d:%s:%d", s.index, s.phase, s.current)
}

// phaseClock is the full clock for the phase s is in.
func phaseClock(s *state) game.Timer {
	return game.Timer{After: s.times.of(s.phase), Tag: s.tag()}
}

// settleClock is the short pause once everyone is done, replacing the phase's
// clock so the match does not sit waiting for time nobody needs.
func settleClock(s *state) game.Timer {
	return game.Timer{After: s.times.settle, Tag: s.tag()}
}

// waitOrSettle is the clock effect after an answer, a vote or a departure:
// leave the phase's clock running while anyone is still to act, or cut it
// short when nobody is.
//
// KeepTimer matters here. The room cancels its clock after any event that
// does not say otherwise, and a vote is a phase-wide deadline: it must not
// restart, or stop, every time somebody votes.
func waitOrSettle(s *state, done bool) game.Effect {
	if done {
		return settleClock(s)
	}
	return game.KeepTimer{}
}

// openBallot is the vote currently open, whichever kind it is, so the code
// that takes a vote does not need to know which.
type openBallot struct {
	kind    pb.VoteKind
	choices []choice
	voters  []string
	votes   map[string]string
}

// ballot returns the vote open in the current phase. Outside a vote it is the
// zero openBallot, with no choices and no voters.
func (s *state) ballot() openBallot {
	switch s.phase {
	case phaseTruth:
		return openBallot{kind: pb.VoteKind_VOTE_KIND_TRUTH, choices: s.choices, voters: s.voters, votes: s.truthVotes}
	case phaseFunny:
		return openBallot{kind: pb.VoteKind_VOTE_KIND_FUNNY, choices: s.choices, voters: s.voters, votes: s.funnyVotes}
	case phaseMatchup:
		m := s.matchups[s.current]
		return openBallot{kind: pb.VoteKind_VOTE_KIND_MATCHUP, choices: m.choices, voters: m.voters, votes: m.votes}
	default:
		return openBallot{}
	}
}

// progress is how many of the voters still here have voted, out of how many
// voters are still here.
func (b openBallot) progress(s *state) (voted, total int) {
	for _, id := range b.voters {
		if !s.isPresent(id) {
			continue
		}
		total++
		if _, ok := b.votes[id]; ok {
			voted++
		}
	}
	return voted, total
}

// done reports whether nobody still here has a vote left to cast.
func (b openBallot) done(s *state) bool {
	voted, total := b.progress(s)
	return voted == total
}

// recordVote writes a vote into whichever ballot is open. It changes the state
// it is handed, so callers pass a clone they own.
func (s *state) recordVote(voterID, choiceID string) {
	switch s.phase {
	case phaseTruth:
		s.truthVotes[voterID] = choiceID
	case phaseFunny:
		s.funnyVotes[voterID] = choiceID
	case phaseMatchup:
		s.matchups[s.current].votes[voterID] = choiceID
	}
}

// allAnswered reports whether every player still here has answered.
func (s *state) allAnswered() bool {
	for _, id := range s.present {
		if _, ok := s.answers[id]; !ok {
			return false
		}
	}
	return true
}
