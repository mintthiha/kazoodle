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

// guestName returns the name for a player who gave none: the label in their
// language plus the lowest number not already in the room. taken is every
// display name currently in use.
//
// Lowest-free rather than roster-size-plus-one, so that a room which has seen
// people come and go does not end up with two "Guest 3"s — the numbering has
// to survive departures, not just arrivals. The comparison ignores case so a
// player who types "guest 2" by hand still pushes the next guest to 3 rather
// than creating a confusing near-duplicate.
func guestName(locale string, taken []string) string {
	label := guestLabel(locale)
	for n := 1; ; n++ {
		candidate := fmt.Sprintf("%s %d", label, n)
		if !containsFold(taken, candidate) {
			return candidate
		}
	}
}

func containsFold(haystack []string, needle string) bool {
	for _, s := range haystack {
		if strings.EqualFold(strings.TrimSpace(s), needle) {
			return true
		}
	}
	return false
}
