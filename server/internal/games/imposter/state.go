package imposter

// phase is where a round is in its lifecycle.
type phase int

const (
	phaseReveal phase = iota // players are looking at their role
	phaseClues               // reserved for the next slice
)

func (p phase) String() string {
	switch p {
	case phaseReveal:
		return "reveal"
	case phaseClues:
		return "clues"
	default:
		return "unknown"
	}
}

// state is one round of Imposter. The room stores it as an opaque game.State;
// only this package reads it. Advance treats the value it receives as
// read-only and returns a clone with the change applied.
type state struct {
	phase      phase
	order      []string        // player ids, in turn order; set once in Init
	imposterID string          // which of order is the imposter
	entry      wordEntry       // the secret word, before localization
	ready      map[string]bool // who has confirmed they saw their role
}

// clone returns a copy safe to mutate. order is never changed after Init, so
// the slice is shared rather than copied.
func (s *state) clone() *state {
	ready := make(map[string]bool, len(s.ready))
	for k, v := range s.ready {
		ready[k] = v
	}
	return &state{
		phase:      s.phase,
		order:      s.order,
		imposterID: s.imposterID,
		entry:      s.entry,
		ready:      ready,
	}
}

func (s *state) allReady() bool {
	return len(s.ready) == len(s.order)
}
