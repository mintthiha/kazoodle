package wavelength

// phase is where a round is in its lifecycle.
type phase int

const (
	phaseChoose   phase = iota // chosen secret only: waiting for the chooser to enter the number
	phaseCategory              // the Psychic is naming the next category
	phaseAnswer                // the Clue Givers are answering the newest category
	phaseTalk                  // spoken answers only: the table talks until the Psychic is ready
	phaseGuess                 // the Psychic is guessing
	phaseResult                // the round is scored; waiting for PlayAgain
)

func (p phase) String() string {
	switch p {
	case phaseChoose:
		return "choose"
	case phaseCategory:
		return "category"
	case phaseAnswer:
		return "answer"
	case phaseTalk:
		return "talk"
	case phaseGuess:
		return "guess"
	case phaseResult:
		return "result"
	default:
		return "unknown"
	}
}

// answer is one Clue Giver's answer to one category.
type answer struct {
	playerID string
	text     string
}

// category is one category asked this round. answers is filled in once, when
// the last answer arrives, and never changed after that, so clones can share it.
type category struct {
	name    string
	answers []answer
}

// state is one match of Wavelength. The room stores it as an opaque
// game.State; only this package reads it. Every handler treats the value it is
// given as read-only and returns a changed clone.
//
// Match-level fields survive from one round to the next (see beginRound);
// round-level fields start fresh every round.
type state struct {
	// ── match-level ──
	roster  []string         // every player id the match started with, in join order; set once
	present []string         // the players still here, in join order
	queue   []string         // players still to be the Psychic, in order; excludes this round's
	scores  map[string]int32 // player id -> points so far
	round   int              // 1-based
	spoken  bool             // host option: answers are said out loud, not typed
	chosen  bool             // host option: the Clue Givers pick the number

	// ── round-level ──
	phase      phase
	psychicID  string
	givers     []string          // this round's Clue Givers, going round from the Psychic
	secret     int               // 0 until known (a chosen secret not yet entered)
	categories []category        // asked so far, oldest first; the last is open during phaseAnswer
	pending    map[string]string // phaseAnswer: giver id -> answer to the open category
	guess      int               // phaseResult: what the Psychic guessed
	deltas     map[string]int32  // phaseResult: what this round awarded
}

// clone returns a copy that is safe to change. A Go assignment of a struct
// copies its fields, but a slice or map field is only a small header pointing
// at shared storage, so `copy := *s` would leave both states writing into the
// same maps. Each mutable map and slice is therefore copied by hand.
//
// roster never changes, so it is shared. present, queue and givers are never
// changed in place: the code that changes them (leave.go, beginRound) builds a
// new slice, so sharing them here is safe too.
func (s *state) clone() *state {
	c := *s // copies every plain field: ints, bools, strings, and the slice/map headers
	c.scores = copyPoints(s.scores)
	c.deltas = copyPoints(s.deltas)
	c.pending = make(map[string]string, len(s.pending))
	for k, v := range s.pending {
		c.pending[k] = v
	}
	// A new backing array, so appending a category to the clone cannot write
	// into spare room that the original's slice also points at.
	c.categories = make([]category, len(s.categories))
	copy(c.categories, s.categories)
	return &c
}

func copyPoints(m map[string]int32) map[string]int32 {
	out := make(map[string]int32, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// totalRounds is how many rounds the match will have: the ones played, this
// one, and one for every player still waiting their turn as the Psychic.
func (s *state) totalRounds() int {
	return s.round + len(s.queue)
}

// matchOver reports whether no round can follow this one.
func (s *state) matchOver() bool {
	return len(s.queue) == 0 || len(s.present) < minPlayers
}

// chooserID is the Clue Giver who enters a chosen secret: the first one round
// from the Psychic. Empty when the server draws the number.
func (s *state) chooserID() string {
	if !s.chosen || len(s.givers) == 0 {
		return ""
	}
	return s.givers[0]
}

// isGiver reports whether id is a Clue Giver this round.
func (s *state) isGiver(id string) bool {
	return indexOf(s.givers, id) >= 0
}

// allAnswered reports whether every Clue Giver has answered the open category.
func (s *state) allAnswered() bool {
	for _, id := range s.givers {
		if _, ok := s.pending[id]; !ok {
			return false
		}
	}
	return true
}

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
