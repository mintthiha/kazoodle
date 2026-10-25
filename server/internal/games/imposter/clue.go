package imposter

import (
	"strings"

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
	if playerID != st.imposterID {
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

// normalizeWord puts two player-typed words into a form that can be compared:
// case and surrounding whitespace stop mattering, nothing else does. It backs
// both the clue rules above and the steal guess, so "Beach", "beach" and
// " beach " are one word everywhere in the game.
//
// It does not fold accents, so a French player typing "aeroport" is not yet
// treated as having typed "Aéroport". Fixing that needs a Unicode
// normalization pass (golang.org/x/text) and should be done for the clue rule
// and the steal guess together.
func normalizeWord(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
