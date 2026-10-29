package room

import (
	"fmt"
	"strings"
)

// Joining without a name is allowed: the room names the player instead. This
// file is the whole of that policy, kept apart from the join plumbing so the
// numbering can be tested on its own.

// guestLabels is the one user-facing string the server produces. Everything
// else a player reads comes from the web client's i18n layer, which is where
// strings belong — but a display name has to be a real name by the time it is
// broadcast, because every screen that shows it treats it as one. So the name
// is built in the joining player's own language and then behaves exactly like
// a typed name: fixed, shown to everyone the same way.
//
// The consequence to accept: a guest who joins in French is "Invité 2" to the
// English players too. That is the same as someone typing an accented name,
// and the alternative — sending a flag and localizing per viewer — would mean
// every screen in the app learning the difference between a name and a
// placeholder.
var guestLabels = map[string]string{
	"en": "Guest",
	"fr": "Invité",
}

func guestLabel(locale string) string {
	if label, ok := guestLabels[locale]; ok {
		return label
	}
	return guestLabels[defaultLocale]
}

// cleanName is what a submitted display name becomes. Empty — including a name
// that was nothing but spaces — means "give me a guest name".
func cleanName(displayName string) string {
	return strings.TrimSpace(displayName)
}

// guestSuffixLen is how many characters follow the dash. Four from a
// 32-character alphabet is about a million possibilities — far more than a
// room needs, and short enough to read off a phone screen and say out loud.
const guestSuffixLen = 5

// guestAttempts bounds the retry on a collision. Hitting it would mean several
// draws in a row landing on names already in the room, which at these odds
// means something is wrong rather than unlucky.
const guestAttempts = 20

// guestName returns the name for a player who gave none: the label in their
// language, a dash, and a random tag — "Guest-7K3MP".
//
// Random rather than counted. A sequence has to be computed from who is
// currently here, so it changes meaning as people come and go: the Guest 2 who
// left and the Guest 2 who arrives later are different people with the same
// name, and in a game where you vote by name that is a real problem. A tag
// drawn at random belongs to one player for as long as they are here.
//
// taken is every display name currently in use, so a draw that collides — with
// another guest or with someone who typed the same thing by hand — is thrown
// away and redrawn. After guestAttempts the last draw is used anyway: a name
// that may repeat beats refusing someone entry to a party game.
func guestName(locale string, taken []string) string {
	label := guestLabel(locale)
	var candidate string
	for i := 0; i < guestAttempts; i++ {
		candidate = fmt.Sprintf("%s-%s", label, randString(codeAlphabet, guestSuffixLen))
		if !containsFold(taken, candidate) {
			return candidate
		}
	}
	return candidate
}

func containsFold(haystack []string, needle string) bool {
	for _, s := range haystack {
		if strings.EqualFold(strings.TrimSpace(s), needle) {
			return true
		}
	}
	return false
}
