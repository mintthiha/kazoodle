package imposter

import (
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"

	"github.com/mintthiha/party-games/server/internal/game"
)

// Client-facing rejection codes for a clue. They are part of the wire contract
// in the same way a message field is: the web client maps each one to a
// translated sentence (web/src/games/imposter/clueError.ts), so renaming one
// here silently degrades the player's warning to a generic "that didn't work".
const (
	codeClueEmpty     = "imposter.clue_empty"
	codeClueIsWord    = "imposter.clue_is_the_word"
	codeClueDuplicate = "imposter.clue_duplicate"
)

// validateClue decides whether playerID may submit text as their clue, and
// returns a *game.Rejected naming the reason if not. It is pure: it reads the
// round's state and never changes it.
//
// Two rules beyond "not empty":
//
// A clue may not BE the secret word. Saying the word out loud ends the round
// as a guessing game, which is the one thing the format can't survive.
//
// A clue may not repeat a clue already given this round — including one the
// same player gave on an earlier pass. Repeating is how a player skips their
// second turn without appearing to, and it starves the crew of the extra
// information the second pass exists to produce.
func validateClue(st *state, playerID, text string) error {
	if text == "" {
		return game.Reject(codeClueEmpty, "imposter: a clue can't be empty")
	}

	norm := normalizeWord(text)

	// Deliberately NOT applied to the imposter. The imposter doesn't know the
	// word, so if the server rejected their clue for matching it, the
	// rejection itself would tell them they'd found it — they could type
	// candidate words until one bounced and win every round. Crew already know
	// the word, so refusing it leaks nothing to them.
	if !st.isImposter(playerID) {
		// Both language forms, not just this player's. Crew already know the
		// word, so refusing either form tells them nothing new, and a French
		// player typing "Beach" leaks it to everyone reading in English.
		for _, form := range st.entry.word.forms() {
			if norm == normalizeWord(form) {
				return game.Reject(codeClueIsWord, "imposter: %s's clue is the secret word", playerID)
			}
		}
	}

	for _, c := range st.clues {
		if normalizeWord(c.text) == norm {
			return game.Reject(codeClueDuplicate, "imposter: %q was already given this round", text)
		}
	}
	return nil
}

// ligatures are the letters Unicode does not treat as an accented form of
// anything, so stripping accents would leave them alone. "œuf" is the one that
// matters: nearly everyone types it as "oeuf".
var ligatures = strings.NewReplacer("œ", "oe", "æ", "ae")

// normalizeWord puts two player-typed words into a form that can be compared:
// case, surrounding whitespace and accents stop mattering, nothing else does. It
// backs both the clue rules above and the steal guess, so "Aéroport", "aeroport"
// and " AEROPORT " are one word everywhere in the game.
func normalizeWord(s string) string {
	s = ligatures.Replace(strings.ToLower(strings.TrimSpace(s)))

	// An accented letter can be stored as one character or as a letter plus a
	// separate accent mark. NFD splits every one into the second form, which
	// leaves the accents as characters that can simply be dropped.
	strip := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)))
	out, _, err := transform.String(strip, s)
	if err != nil {
		// Only bad UTF-8 can get here. Compare the text as it came rather than
		// refuse the player: the worst outcome is an accent that still counts.
		return s
	}
	return out
}
