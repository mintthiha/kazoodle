package fibblash

import (
	"strings"

	"github.com/mintthiha/party-games/server/internal/game"
)

// The table size. Three is the fewest that makes a vote mean anything; twelve
// is the most a ballot of lies plus the truth can label (see choiceIDs) and the
// most a phone screen of answers can show.
const (
	minPlayers = 3
	maxPlayers = 12
)

// Rejection codes a client translates into a sentence. See game.Rejected.
const (
	codeAnswerEmpty     = "fibblash.answer_empty"
	codeAnswerTooLong   = "fibblash.answer_too_long"
	codeAnswerIsTruth   = "fibblash.answer_is_truth"
	codeAlreadyAnswered = "fibblash.already_answered"
	codeTooLate         = "fibblash.too_late"
	codeNotPlaying      = "fibblash.not_playing"
	codeCannotVote      = "fibblash.cannot_vote"
	codeAlreadyVoted    = "fibblash.already_voted"
	codeNoSuchChoice    = "fibblash.no_such_choice"
	codeOwnChoice       = "fibblash.own_choice"
	codeNotHost         = "fibblash.not_host"
	codeMatchOver       = "fibblash.match_over"
	codeNotOver         = "fibblash.not_over"
)

// The languages the bank is written in.
var locales = []string{"en", "fr"}

// matchLocale picks the one language the whole match is played in: the most
// common among the players, and on a tie whichever of the tied languages the
// earliest player to join reads. One language for everyone is what makes the
// game work at all — two lies can only be compared, and a ballot only read
// aloud, if they are in the same language.
func matchLocale(players []game.Player) string {
	counts := make(map[string]int)
	for _, p := range players {
		counts[supported(p.Locale)]++
	}
	best := supported(players[0].Locale)
	for _, p := range players {
		// Strictly more, so a tie keeps the language seen first.
		if loc := supported(p.Locale); counts[loc] > counts[best] {
			best = loc
		}
	}
	return best
}

// supported maps a player's locale ("fr-CA", "en") onto one the bank has,
// defaulting to English.
func supported(locale string) string {
	lower := strings.ToLower(locale)
	for _, l := range locales {
		if strings.HasPrefix(lower, l) {
			return l
		}
	}
	return "en"
}
