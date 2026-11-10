package fibblash

import (
	"strings"
	"testing"

	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

// The bank is content, edited by hand. These tests are its proofreader: every
// entry must have what its kind needs, in both languages.

var categories = map[string]bool{
	"history": true, "geography": true, "science": true, "animals": true,
	"food": true, "technology": true, "movies": true, "music": true,
	"sports": true, "weird": true, "everyday": true, "ridiculous": true,
}

func TestBankEntriesAreComplete(t *testing.T) {
	ids := make(map[string]bool)
	for _, q := range defaultBank {
		t.Run(q.id, func(t *testing.T) {
			if q.id == "" || ids[q.id] {
				t.Fatalf("missing or duplicate id %q", q.id)
			}
			ids[q.id] = true

			if !categories[q.category] {
				t.Errorf("unknown category %q; add it here and to the client's i18n", q.category)
			}
			if q.prompt.en == "" || q.prompt.fr == "" {
				t.Error("prompt needs both languages")
			}

			switch q.kind {
			case kindReal, kindHybrid:
				if q.answer.en == "" || q.answer.fr == "" {
					t.Error("answer needs both languages")
				}
				if q.explanation.en == "" || q.explanation.fr == "" {
					t.Error("explanation needs both languages")
				}
				if q.source == "" {
					t.Error("needs a source")
				}
				if q.difficulty == 0 {
					t.Error("needs a difficulty")
				}
				if !strings.Contains(q.prompt.en, "____") || !strings.Contains(q.prompt.fr, "____") {
					t.Error("prompt needs a ____ blank in both languages")
				}
				for _, a := range []string{q.answer.en, q.answer.fr} {
					if len([]rune(a)) > maxAnswerLength {
						t.Errorf("answer %q is longer than a player may type", a)
					}
					if !isTruth(q, a) {
						t.Errorf("answer %q does not count as its own truth", a)
					}
				}
			case kindCreative:
				if q.answer.en != "" || q.source != "" {
					t.Error("a creative prompt has no right answer")
				}
			default:
				t.Errorf("unknown kind %v", q.kind)
			}
		})
	}
}

// TestBankCoversTheLongestMatch checks there are enough questions that a
// match of maxQuestions never runs short of any kind it might draw.
func TestBankCoversTheLongestMatch(t *testing.T) {
	counts := make(map[pb.Kind]int)
	for _, q := range defaultBank {
		counts[q.kind]++
	}
	for _, kw := range kindWeights {
		// At most two in a row means at most ceil(2n/3) of one kind.
		need := (2*maxQuestions + 2) / 3
		if counts[kw.kind] < need {
			t.Errorf("%v: %d questions, a %d-question match could need %d", kw.kind, counts[kw.kind], maxQuestions, need)
		}
	}
}
