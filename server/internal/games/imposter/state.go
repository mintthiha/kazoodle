package imposter

// phase is where a round is in its lifecycle.
type phase int

const (
	phaseReveal  phase = iota // players are looking at their role
	phaseClues                // players give one clue each, in turn order
	phaseVote                 // everyone votes for who they think the imposter is
	phaseSteal                // the imposter was caught; they get one guess at the word
	phaseOutcome              // the round is over; results are final
)

func (p phase) String() string {
	switch p {
	case phaseReveal:
		return "reveal"
	case phaseClues:
		return "clues"
	case phaseVote:
		return "vote"
	case phaseSteal:
		return "steal"
	case phaseOutcome:
		return "outcome"
	default:
		return "unknown"
	}
}

// clueEntry is one player's clue, in the order it was given.
type clueEntry struct {
	playerID string
	text     string
}

// state is one match of Imposter, which is a run of totalRounds rounds plus
// the round currently being played. The room stores it as an opaque
// game.State; only this package reads it. Advance treats the value it
// receives as read-only and returns a clone with the change applied.
//
// The fields split into two groups. Match-level fields survive a round
// ending: they are copied unchanged into the next round (see beginRound).
// Round-level fields are reset for every round.
type state struct {
	// ── match-level ──
	roster       []string          // every player id the match started with, in join order; set once
	locales      map[string]string // player id -> locale; set once, used to localize per recipient
	scores       map[string]int32  // player id -> points so far in the match
	round        int               // 1-based index of the round being played
	totalRounds  int               // how many rounds this match runs for
	cluePasses   int               // host option: how many times the table goes around giving clues
	hintsEnabled bool              // host option: give the imposter the category
	wordCategory string            // host option: StartOptions.category, so every round draws from the same pool

	// ── round-level ──
	phase      phase
	order      []string         // player ids still in the round, in turn order
	imposterID string           // which of order is the imposter this round
	entry      wordEntry        // the secret word, before localization
	deltas     map[string]int32 // what this round alone awarded, once it resolved

	ready map[string]bool // reveal phase: who has confirmed they saw their role

	turn     int         // clue phase: index into order of whose turn it is, within the current pass
	cluePass int         // clue phase: which pass of the table this is, 1-based
	clues    []clueEntry // clue phase: submitted so far, in the order given, across all passes

	votes map[string]string // vote phase: voter id -> suspect id, or "" for an abstain
}

// clone returns a copy safe to mutate. roster and locales are never changed
// after the match starts, so those are shared rather than copied; order is
// shared too and rebuilt from scratch by the one place that changes it (Leave).
func (s *state) clone() *state {
	ready := make(map[string]bool, len(s.ready))
	for k, v := range s.ready {
		ready[k] = v
	}
	votes := make(map[string]string, len(s.votes))
	for k, v := range s.votes {
		votes[k] = v
	}
	clues := make([]clueEntry, len(s.clues))
	copy(clues, s.clues)

	return &state{
		roster:       s.roster,
		locales:      s.locales,
		scores:       copyScores(s.scores),
		round:        s.round,
		totalRounds:  s.totalRounds,
		cluePasses:   s.cluePasses,
		hintsEnabled: s.hintsEnabled,
		wordCategory: s.wordCategory,
		phase:        s.phase,
		order:        s.order,
		imposterID:   s.imposterID,
		entry:        s.entry,
		deltas:       copyScores(s.deltas),
		ready:        ready,
		turn:         s.turn,
		cluePass:     s.cluePass,
		clues:        clues,
		votes:        votes,
	}
}

// copyScores copies a points map. Both scores and deltas are written on a
// clone after a round resolves, so neither can be shared with the state the
// room still holds.
func copyScores(m map[string]int32) map[string]int32 {
	out := make(map[string]int32, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func (s *state) allReady() bool {
	return len(s.ready) == len(s.order)
}

func (s *state) allVoted() bool {
	return len(s.votes) == len(s.order)
}

// matchOver reports whether the match is finished once the current round is.
// Two ways to be done: the last round has been played, or so many players have
// left that another round can't legally start.
func (s *state) matchOver() bool {
	return s.round >= s.totalRounds || len(s.order) < minPlayers
}
