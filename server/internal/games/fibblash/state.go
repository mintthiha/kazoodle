package fibblash

import (
	"math/rand/v2"
	"time"

	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

// phase is where a question is in its lifecycle. Which phases a question goes
// through depends on its kind:
//
//	REAL:     intro → answer → truth → result → leaderboard
//	HYBRID:   intro → answer → truth → funny → result → leaderboard
//	CREATIVE: intro → answer → (matchup → matchupResult)… → leaderboard
//
// and after the last leaderboard, final.
type phase int

const (
	phaseIntro         phase = iota // the question is on screen; nobody can answer yet
	phaseAnswer                     // everyone writes an answer
	phaseTruth                      // REAL, HYBRID: vote for the truth
	phaseFunny                      // HYBRID: vote for the funniest
	phaseMatchup                    // CREATIVE: vote in one matchup
	phaseMatchupResult              // CREATIVE: one matchup's votes revealed
	phaseResult                     // REAL, HYBRID: the truth and the scores revealed
	phaseLeaderboard                // standings after the question
	phaseFinal                      // the match is over; waiting for the host
)

func (p phase) String() string {
	switch p {
	case phaseIntro:
		return "intro"
	case phaseAnswer:
		return "answer"
	case phaseTruth:
		return "truth"
	case phaseFunny:
		return "funny"
	case phaseMatchup:
		return "matchup"
	case phaseMatchupResult:
		return "matchup-result"
	case phaseResult:
		return "result"
	case phaseLeaderboard:
		return "leaderboard"
	case phaseFinal:
		return "final"
	default:
		return "unknown"
	}
}

// timings is how long each phase lasts. A struct rather than constants so a
// host option can change them later, and so a test can see which clock a
// phase armed.
type timings struct {
	intro         time.Duration
	answer        time.Duration
	truth         time.Duration
	funny         time.Duration
	matchup       time.Duration
	matchupResult time.Duration
	result        time.Duration
	leaderboard   time.Duration
	// settle is the pause after the last answer or vote arrives, so "everyone's
	// in" registers on screen before the phase moves on.
	settle time.Duration
}

var defaultTimings = timings{
	intro:         5 * time.Second,
	answer:        30 * time.Second,
	truth:         20 * time.Second,
	funny:         15 * time.Second,
	matchup:       15 * time.Second,
	matchupResult: 6 * time.Second,
	result:        8 * time.Second,
	leaderboard:   8 * time.Second,
	settle:        1500 * time.Millisecond,
}

// of is how long a phase lasts. Final has no clock: it waits for the host.
func (t timings) of(p phase) time.Duration {
	switch p {
	case phaseIntro:
		return t.intro
	case phaseAnswer:
		return t.answer
	case phaseTruth:
		return t.truth
	case phaseFunny:
		return t.funny
	case phaseMatchup:
		return t.matchup
	case phaseMatchupResult:
		return t.matchupResult
	case phaseResult:
		return t.result
	case phaseLeaderboard:
		return t.leaderboard
	default:
		return 0
	}
}

// choice is one answer on a ballot. Once a ballot is built its choices never
// change, so states can share them.
type choice struct {
	id      string
	text    string
	authors []string // empty for the truth
	truth   bool
}

// wrote reports whether playerID is one of this choice's authors.
func (c choice) wrote(playerID string) bool {
	return indexOf(c.authors, playerID) >= 0
}

// matchup is one CREATIVE head-to-head: two answers, or three when the number
// of answers was odd.
type matchup struct {
	choices []choice
	voters  []string          // who may vote in it, fixed when it is built
	votes   map[string]string // voter id -> choice id
}

// award is points for one player for one reason, before it goes on the wire.
type award struct {
	playerID string
	points   int
	reason   pb.AwardReason
	count    int
}

// state is one match of Fibblash. The room stores it as an opaque game.State;
// only this package reads it. Every handler treats the value it is given as
// read-only and returns a changed clone.
type state struct {
	// ── match-level ──
	roster    []string       // every player the match started with, in join order; set once
	present   []string       // the players still here, in join order
	locale    string         // the one language the whole match is played in
	questions []question     // the whole match, planned at the start
	scores    map[string]int // player id -> points so far
	seed      uint64         // see rng
	times     timings

	// ── question-level ──
	index      int // into questions
	phase      phase
	answers    map[string]string // author id -> their answer, as cleaned
	order      []string          // authors in the order they answered
	choices    []choice          // REAL, HYBRID: the ballot, truth included
	voters     []string          // REAL, HYBRID: who may vote, fixed when the ballot opens
	truthVotes map[string]string // voter id -> choice id
	funnyVotes map[string]string // voter id -> choice id
	matchups   []matchup         // CREATIVE
	current    int               // CREATIVE: index into matchups
	deltas     map[string]int    // points this question, so far
	awards     []award           // what the latest reveal awarded, for its message
	skipped    bool              // the host skipped this question before it was scored
	endedEarly bool              // final only: the match stopped before its last question
}

// clone returns a copy that is safe to change. A Go assignment of a struct
// copies its fields, but a slice or map field is only a small header pointing
// at shared storage, so `c := *s` alone would leave both states writing into
// the same maps. Each one that a handler changes is copied by hand.
//
// roster, questions and choices are never changed after they are made, and
// present and voters are only ever replaced (see without), never written into,
// so those are shared.
func (s *state) clone() *state {
	c := *s
	c.scores = copyInts(s.scores)
	c.deltas = copyInts(s.deltas)
	c.answers = copyStrings(s.answers)
	c.truthVotes = copyStrings(s.truthVotes)
	c.funnyVotes = copyStrings(s.funnyVotes)
	// A fresh backing array, so appending to the clone's order cannot write into
	// spare room the original's slice also points at.
	c.order = append([]string(nil), s.order...)
	c.awards = append([]award(nil), s.awards...)
	c.matchups = make([]matchup, len(s.matchups))
	for i, m := range s.matchups {
		m.votes = copyStrings(m.votes)
		c.matchups[i] = m
	}
	return &c
}

func copyInts(m map[string]int) map[string]int {
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func copyStrings(m map[string]string) map[string]string {
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// q is the question being played.
func (s *state) q() question {
	return s.questions[s.index]
}

// isPresent reports whether id is still in the match.
func (s *state) isPresent(id string) bool {
	return indexOf(s.present, id) >= 0
}

// rng is a random source for one decision in the current question. It is
// derived from the match's seed, the question and a purpose number, rather than
// kept as a live generator in the state, so that Advance stays a pure function:
// the same state always shuffles the same way, and a clone cannot disturb the
// original's sequence.
func (s *state) rng(purpose uint64) *rand.Rand {
	return rand.New(rand.NewPCG(s.seed, uint64(s.index)<<8|purpose))
}

// Purposes for rng, so two shuffles in one question never share a stream.
const (
	rngBallot  = 1
	rngPairing = 2
)

// indexOf returns id's position in ids, or -1.
func indexOf(ids []string, id string) int {
	for i, x := range ids {
		if x == id {
			return i
		}
	}
	return -1
}

// without returns a new slice holding ids minus id. It never changes ids,
// which may be shared with another state.
func without(ids []string, id string) []string {
	out := make([]string, 0, len(ids))
	for _, x := range ids {
		if x != id {
			out = append(out, x)
		}
	}
	return out
}
