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

// state is one round of Imposter. The room stores it as an opaque game.State;
// only this package reads it. Advance treats the value it receives as
// read-only and returns a clone with the change applied.
type state struct {
	phase        phase
	order        []string          // player ids, in turn order; set once in Init
	imposterID   string            // which of order is the imposter
	entry        wordEntry         // the secret word, before localization
	locales      map[string]string // player id -> locale; set once in Init, used by Outcome
	hintsEnabled bool              // host option, set once in Init: give the imposter the category

	ready map[string]bool // reveal phase: who has confirmed they saw their role

	turn  int         // clue phase: index into order of whose turn it is
	clues []clueEntry // clue phase: submitted so far, in turn order

	votes map[string]string // vote phase: voter id -> suspect id, or "" for an abstain
}

// clone returns a copy safe to mutate. order and locales are never changed
// after Init, so those are shared rather than copied.
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
		phase:        s.phase,
		order:        s.order,
		imposterID:   s.imposterID,
		entry:        s.entry,
		locales:      s.locales,
		hintsEnabled: s.hintsEnabled,
		ready:        ready,
		turn:         s.turn,
		clues:        clues,
		votes:        votes,
	}
}

func (s *state) allReady() bool {
	return len(s.ready) == len(s.order)
}

func (s *state) allVoted() bool {
	return len(s.votes) == len(s.order)
}
