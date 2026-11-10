package fibblash

import "github.com/mintthiha/party-games/server/internal/games/fibblash/pb"

// localized is one piece of player-facing text in every language the game is
// played in. The whole match is played in one language (see matchLocale), so
// every player reads the same words and two lies can be compared.
type localized struct {
	en string
	fr string
}

// in returns the text in locale, falling back to English for a language the
// bank has not been written in.
func (l localized) in(locale string) string {
	if locale == "fr" && l.fr != "" {
		return l.fr
	}
	return l.en
}

// difficulty is how hard a REAL or HYBRID question is to know outright. It is
// recorded for whoever curates the bank; selection does not use it yet.
type difficulty int

const (
	easy difficulty = iota + 1
	medium
	hard
)

// question is one entry in the bank. For REAL and HYBRID, answer,
// explanation and source are mandatory, and bank_test.go checks they are
// there. For CREATIVE only the prompt and category are used.
type question struct {
	id       string
	kind     pb.Kind
	category string // a key the client translates: "history", "ridiculous", ...
	prompt   localized

	answer      localized
	accept      []string // other spellings that also count as the truth, any language
	explanation localized
	source      string
	difficulty  difficulty
}

// truths is every string that counts as this question's true answer.
func (q question) truths() []string {
	out := []string{q.answer.en, q.answer.fr}
	return append(out, q.accept...)
}

// hasTruth reports whether this kind of question has a right answer that is
// shuffled in among the lies.
func hasTruth(k pb.Kind) bool {
	return k == pb.Kind_KIND_REAL || k == pb.Kind_KIND_HYBRID
}
