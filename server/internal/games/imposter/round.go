package imposter

import (
	"math/rand/v2"
	"time"

	"github.com/mintthiha/party-games/server/internal/game"
)

// beginRound returns the state for the next round of the match s belongs to:
// every match-level field carried over untouched, every round-level field
// fresh — a new word, a new imposter, a reshuffled turn order, back to the
// reveal phase. s itself is not modified. The word is the one match-level
// exception: it is added to usedWords, so the next round draws a different one.
//
// Init uses it too, with a round-zero seed state, so there is exactly one
// place that decides what starting a round means.
func (s *state) beginRound() *state {
	// A new slice rather than a shuffle in place: clone shares order between
	// states, so shuffling s.order would reorder the round the room is still
	// holding.
	order := make([]string, len(s.order))
	copy(order, s.order)
	rand.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })

	imposterID, partnerID := pickImposters(order, imposterCount(s.imposters, len(order)))
	entry := pickWord(s.wordCategory, s.usedWords)

	// A fresh slice rather than a plain append. Every clone of s shares its
	// usedWords, and append may write into the same underlying array when it
	// has spare room, which would change a state the room is still holding.
	usedWords := make([]string, 0, len(s.usedWords)+1)
	usedWords = append(usedWords, s.usedWords...)
	usedWords = append(usedWords, entry.word.en)

	return &state{
		roster:       s.roster,
		locales:      s.locales,
		scores:       copyScores(s.scores),
		round:        s.round + 1,
		totalRounds:  s.totalRounds,
		cluePasses:   s.cluePasses,
		clueSeconds:  s.clueSeconds,
		hintsEnabled: s.hintsEnabled,
		wordCategory: s.wordCategory,
		imposters:    s.imposters,
		usedWords:    usedWords,

		phase:      phaseReveal,
		order:      order,
		imposterID: imposterID,
		partnerID:  partnerID,
		entry:      entry,
		deltas:     make(map[string]int32),
		ready:      make(map[string]bool),
		votes:      make(map[string]string),
		cluePass:   1,
	}
}

// pickImposters draws count imposters (one or two) from order, never the player
// in order[0]. That player speaks first, and an imposter going first has heard
// nothing at all to base a clue on, which loses most rounds on the spot. The cost
// is that whoever speaks first is known to be crew; the first clue is the least
// suspicious one anyway, so that gives little away.
//
// partnerID is empty when count is 1. It needs at least count+1 players, which
// minPlayers and twoImposterMinPlayers guarantee.
func pickImposters(order []string, count int) (imposterID, partnerID string) {
	seats := order[1:]
	first := rand.IntN(len(seats))
	if count < 2 {
		return seats[first], ""
	}
	// Draw from one seat fewer, then step over the seat already taken, so the
	// two can never be the same player.
	second := rand.IntN(len(seats) - 1)
	if second >= first {
		second++
	}
	return seats[first], seats[second]
}

// nextClue moves the clue phase on by one turn, which is the one rule shared
// by a submitted clue and a departure mid-phase: step to the next player, and
// when the table has gone all the way around, start the next pass or — if that
// was the last pass — open the vote.
//
// It sets the phase on the state it is handed, so callers pass a clone they
// already own, the same contract as resolveVote.
func nextClue(next *state) []game.Effect {
	if next.turn < len(next.order) {
		return clueTurnEffects(next)
	}
	// The table has gone all the way around.
	if next.cluePass < next.cluePasses {
		next.cluePass++
		next.turn = 0 // same order again, from the top
		return clueTurnEffects(next)
	}
	next.phase = phaseVote
	// The clue clock is replaced rather than dropped: this Timer is the
	// voting deadline, and arming it supersedes whatever the clue turn had.
	return votePhaseEffects(next)
}

// votePhaseEffects opens the vote and starts the deadline for it. Every way
// into the vote comes through here — the last clue, the last timed-out turn,
// and a ballot reissued because somebody left — so no path can open a vote
// that nothing ever closes.
func votePhaseEffects(st *state) []game.Effect {
	return []game.Effect{
		game.Send{Msg: votePhase(st)},
		game.Timer{After: voteSeconds * time.Second, Tag: tagVote},
	}
}

// stealPhaseEffects does the same for the caught imposter's one guess. Alone
// on that screen with everyone watching is exactly where someone puts their
// phone down.
func stealPhaseEffects(st *state) []game.Effect {
	return []game.Effect{
		game.Send{Msg: stealPrompt(st)},
		game.Timer{After: stealSeconds * time.Second, Tag: tagSteal},
	}
}

// clueTurnEffects announces whose turn it is and, if the host set a clock,
// asks the platform for one. Every way into a clue turn goes through here —
// the first turn of the phase, the next player, the start of a second pass,
// and the turn left open by someone leaving — so no path can announce a turn
// and forget its clock.
//
// The Timer is per turn by design: it is armed again on each new turn, and the
// room drops the old one as it accepts the event that caused this one.
func clueTurnEffects(st *state) []game.Effect {
	effects := []game.Effect{game.Send{Msg: clueTurn(st)}}
	if st.clueSeconds > 0 {
		effects = append(effects, game.Timer{
			After: time.Duration(st.clueSeconds) * time.Second,
			Tag:   tagClueTurn,
		})
	}
	return effects
}

// These name each clock on the way out and on the way back. The game arms
// clocks in three phases, so an expiry says which one it was rather than
// leaving the game to infer it from state that may have moved on.
const (
	tagClueTurn = "clue-turn"
	tagVote     = "vote"
	tagSteal    = "steal"
)

// roundStart is the effects that open a round: a private RoleAssignment for
// each player, then a RevealProgress broadcast so everyone sees "0 / 5 ready".
// A client treats a RoleAssignment as "a new round has begun" and clears the
// last one off its screen, so this is also how a match moves on.
func roundStart(st *state) []game.Effect {
	effects := make([]game.Effect, 0, len(st.order)+1)
	for _, id := range st.order {
		effects = append(effects, game.Send{To: []string{id}, Msg: roleFor(st, id)})
	}
	effects = append(effects, game.Send{Msg: revealProgress(st)}) // broadcast
	return effects
}
