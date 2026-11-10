package fibblash

import (
	"fmt"
	"math/rand/v2"
	"testing"

	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

func TestQuestionCount(t *testing.T) {
	tests := []struct {
		requested int32
		want      int
	}{
		{requested: 0, want: defaultQuestions},
		{requested: -4, want: defaultQuestions},
		{requested: 1, want: minQuestions},
		{requested: 8, want: 8},
		{requested: 99, want: maxQuestions},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprint(tt.requested), func(t *testing.T) {
			if got := questionCount(tt.requested); got != tt.want {
				t.Errorf("questionCount(%d) = %d, want %d", tt.requested, got, tt.want)
			}
		})
	}
}

// TestPlanMatchRules checks the selection rules over many seeds rather than
// one: they are promises about every match, and a single lucky seed would
// prove little.
func TestPlanMatchRules(t *testing.T) {
	for _, n := range []int{3, 6, 12, 20} {
		for seed := uint64(0); seed < 200; seed++ {
			r := rand.New(rand.NewPCG(seed, 0))
			qs := planMatch(defaultBank, n, r)

			if len(qs) != n {
				t.Fatalf("n=%d seed=%d: planned %d questions", n, seed, len(qs))
			}
			seen := make(map[string]bool)
			kinds := make(map[pb.Kind]bool)
			for i, q := range qs {
				if seen[q.id] {
					t.Fatalf("n=%d seed=%d: %s appears twice", n, seed, q.id)
				}
				seen[q.id] = true
				kinds[q.kind] = true
				if i >= maxRun && sameRun(qs[i-maxRun:i+1]) {
					t.Fatalf("n=%d seed=%d: %d %v in a row ending at %d", n, seed, maxRun+1, q.kind, i)
				}
			}
			if len(kinds) != 3 {
				t.Fatalf("n=%d seed=%d: only %d kinds appeared", n, seed, len(kinds))
			}
		}
	}
}

func sameRun(qs []question) bool {
	for _, q := range qs[1:] {
		if q.kind != qs[0].kind {
			return false
		}
	}
	return true
}

// TestPlanMatchWeights checks the long-run mix is near 40/30/30. The bounds are
// wide on purpose: this guards against a broken weighting, not against
// ordinary randomness.
func TestPlanMatchWeights(t *testing.T) {
	counts := make(map[pb.Kind]int)
	total := 0
	for seed := uint64(0); seed < 500; seed++ {
		for _, q := range planMatch(defaultBank, 12, rand.New(rand.NewPCG(seed, 1))) {
			counts[q.kind]++
			total++
		}
	}
	for _, kw := range kindWeights {
		share := 100 * counts[kw.kind] / total
		if share < kw.weight-8 || share > kw.weight+8 {
			t.Errorf("%v made up %d%% of questions, want about %d%%", kw.kind, share, kw.weight)
		}
	}
}

func TestPlanMatchRespectsTheBank(t *testing.T) {
	tests := []struct {
		name string
		bank []question
		n    int
		want int
	}{
		{
			name: "a bank smaller than the match",
			bank: []question{{id: "r1", kind: kindReal}, {id: "c1", kind: kindCreative}},
			n:    12, want: 2,
		},
		{
			// Only one kind, so the run rule cannot hold; the plan still
			// fills up rather than coming back empty.
			name: "a one-kind bank",
			bank: []question{{id: "r1", kind: kindReal}, {id: "r2", kind: kindReal}, {id: "r3", kind: kindReal}},
			n:    3, want: 3,
		},
		{name: "an empty bank", bank: nil, n: 5, want: 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := planMatch(tt.bank, tt.n, rand.New(rand.NewPCG(7, 7)))
			if len(got) != tt.want {
				t.Errorf("planned %d questions, want %d", len(got), tt.want)
			}
		})
	}
}

func TestPlanMatchIsDeterministicForASeed(t *testing.T) {
	a := planMatch(defaultBank, 12, rand.New(rand.NewPCG(99, 0)))
	b := planMatch(defaultBank, 12, rand.New(rand.NewPCG(99, 0)))
	for i := range a {
		if a[i].id != b[i].id {
			t.Fatalf("question %d differs: %s vs %s", i, a[i].id, b[i].id)
		}
	}
}
