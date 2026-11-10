package fibblash

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"

	"github.com/mintthiha/party-games/server/internal/game"
)

// maxAnswerLength is the longest answer accepted, counted in characters
// (runes) rather than bytes, so "é" counts as one the way it does in the
// browser. Long enough for a decent joke, short enough to fit a ballot row
// on a phone and a tile on the main screen.
const maxAnswerLength = 45

// cleanAnswer is what a typed answer becomes before any rule looks at it:
// control characters dropped, runs of whitespace (including newlines) folded
// to one space, and the ends trimmed.
//
// It does not escape HTML. The text goes out as a JSON string and every client
// renders it as text, never as markup, which is where escaping belongs: an
// answer of "<b>hi</b>" should show those characters, not bold.
func cleanAnswer(s string) string {
	var b strings.Builder
	space := false
	for _, r := range s {
		switch {
		case unicode.IsSpace(r):
			space = true
		case unicode.IsControl(r) || r == utf8.RuneError:
			// Dropped: invisible, and a broken byte would make the
			// message unmarshalable for everyone.
		default:
			if space && b.Len() > 0 {
				b.WriteByte(' ')
			}
			space = false
			b.WriteRune(r)
		}
	}
	return b.String()
}

// checkAnswer returns a *game.Rejected if text cannot be an answer. text must
// already have been through cleanAnswer.
func checkAnswer(text string) error {
	if text == "" {
		return game.Reject(codeAnswerEmpty, "an answer can't be empty")
	}
	if utf8.RuneCountInString(text) > maxAnswerLength {
		return game.Reject(codeAnswerTooLong, "answer is over %d characters", maxAnswerLength)
	}
	return nil
}

// ligatures are the letters Unicode does not treat as an accented form of
// anything, so stripping accents would leave them alone.
var ligatures = strings.NewReplacer("œ", "oe", "æ", "ae", "ß", "ss")

// articles are dropped from the front of an answer before comparing, in both
// languages the game is played in, so "a coffee pot" and "coffee pot" are the
// same answer, as are "la licorne" and "licorne".
var articles = map[string]bool{
	"a": true, "an": true, "the": true,
	"le": true, "la": true, "les": true, "l": true,
	"un": true, "une": true, "des": true, "du": true, "de": true,
}

// answerKey puts an answer into the form two answers are compared in: case,
// accents, punctuation, spacing and a leading article stop mattering. It is how
// the game tells that a lie is really the truth, and that two players wrote the
// same lie.
//
// It returns "" for an answer with no letters or digits at all ("!!!"). Callers
// must not treat two such answers as the same: see choiceKey.
func answerKey(s string) string {
	s = ligatures.Replace(strings.ToLower(s))

	// NFD splits an accented letter into the letter plus a separate accent
	// mark, which can then be dropped. See imposter's normalizeWord for the
	// same trick.
	strip := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)))
	if out, _, err := transform.String(strip, s); err == nil {
		s = out
	}

	// Split on anything that is not a letter or digit, so "red-hot" and
	// "red hot" become the same two words.
	words := strings.FieldsFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	if len(words) > 1 && articles[words[0]] {
		words = words[1:]
	}
	return strings.Join(words, "")
}

// isTruth reports whether text is the question's true answer, in any language
// the game knows it in or any spelling it accepts.
func isTruth(q question, text string) bool {
	key := answerKey(text)
	if key == "" {
		return false
	}
	for _, t := range q.truths() {
		if answerKey(t) == key {
			return true
		}
	}
	return false
}
