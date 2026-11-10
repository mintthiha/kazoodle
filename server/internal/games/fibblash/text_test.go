package fibblash

import (
	"errors"
	"strings"
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
)

func TestCleanAnswer(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "trims the ends", in: "  a cat  ", want: "a cat"},
		{name: "folds inner whitespace and newlines", in: "a \n\t  big   cat", want: "a big cat"},
		{name: "drops control characters", in: "cat\x00\x07s", want: "cats"},
		{name: "keeps accents and emoji", in: "café 🐈", want: "café 🐈"},
		{name: "keeps markup as text", in: "<b>hi</b>", want: "<b>hi</b>"},
		{name: "nothing but space is empty", in: " \n ", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := cleanAnswer(tt.in); got != tt.want {
				t.Errorf("cleanAnswer(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestCheckAnswer(t *testing.T) {
	tests := []struct {
		name     string
		in       string
		wantCode string
	}{
		{name: "an ordinary answer", in: "a hat"},
		{name: "empty", in: "", wantCode: codeAnswerEmpty},
		{name: "exactly the limit", in: strings.Repeat("é", maxAnswerLength)},
		{name: "one over the limit", in: strings.Repeat("é", maxAnswerLength+1), wantCode: codeAnswerTooLong},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := checkAnswer(tt.in)
			if tt.wantCode == "" {
				if err != nil {
					t.Fatalf("got %v, want accepted", err)
				}
				return
			}
			var rej *game.Rejected
			if !errors.As(err, &rej) || rej.Code != tt.wantCode {
				t.Fatalf("got %v, want rejection %s", err, tt.wantCode)
			}
		})
	}
}

func TestAnswerKey(t *testing.T) {
	tests := []struct {
		name string
		a, b string
		same bool
	}{
		{name: "case and spaces", a: "Coffee Pot", b: "coffeepot", same: true},
		{name: "punctuation", a: "red-hot shoes!", b: "red hot shoes", same: true},
		{name: "accents", a: "Cafetière", b: "cafetiere", same: true},
		{name: "a leading English article", a: "a coffee pot", b: "coffee pot", same: true},
		{name: "a leading French article", a: "la licorne", b: "Licorne", same: true},
		{name: "an elided French article", a: "l'Antarctique", b: "antarctique", same: true},
		{name: "a ligature", a: "œuf", b: "oeuf", same: true},
		{name: "different words", a: "coffee pot", b: "tea pot", same: false},
		// "a" alone is the answer, not an article in front of nothing.
		{name: "an article on its own", a: "A", b: "", same: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := answerKey(tt.a) == answerKey(tt.b); got != tt.same {
				t.Errorf("answerKey(%q)=%q, answerKey(%q)=%q; same=%v, want %v",
					tt.a, answerKey(tt.a), tt.b, answerKey(tt.b), got, tt.same)
			}
		})
	}
}

func TestIsTruth(t *testing.T) {
	q := question{
		kind:   kindReal,
		answer: l("coffee pot", "cafetière"),
		accept: []string{"coffee machine"},
	}
	tests := []struct {
		in   string
		want bool
	}{
		{in: "Coffee pot", want: true},
		{in: "a coffee-pot", want: true},
		{in: "la cafetière", want: true}, // the other language still counts
		{in: "COFFEE MACHINE", want: true},
		{in: "kettle", want: false},
		{in: "!!!", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			if got := isTruth(q, tt.in); got != tt.want {
				t.Errorf("isTruth(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}
