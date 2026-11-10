package fibblash

import (
	"math/rand/v2"
	"testing"
)

func seeded() *rand.Rand { return rand.New(rand.NewPCG(1, 2)) }

func TestBuildBallotMergesDuplicateLies(t *testing.T) {
	order := []string{"p1", "p2", "p3", "p4"}
	answers := map[string]string{
		"p1": "A Kettle",
		"p2": "kettle!", // the same lie as p1's, written differently
		"p3": "a toaster",
		"p4": "!!!", // no letters: must not merge with anything
	}
	cs := buildBallot(order, answers, "coffee pot", seeded())

	if len(cs) != 4 { // kettle, toaster, !!!, truth
		t.Fatalf("ballot has %d choices, want 4: %+v", len(cs), cs)
	}
	var truths int
	ids := make(map[string]bool)
	for _, c := range cs {
		ids[c.id] = true
		if c.truth {
			truths++
			if len(c.authors) != 0 || c.text != "coffee pot" {
				t.Errorf("truth choice = %+v", c)
			}
		}
		if c.text == "A Kettle" {
			// The first author's spelling, credited to both.
			if len(c.authors) != 2 || c.authors[0] != "p1" || c.authors[1] != "p2" {
				t.Errorf("merged lie authors = %v, want [p1 p2]", c.authors)
			}
		}
	}
	if truths != 1 {
		t.Errorf("ballot has %d truths, want 1", truths)
	}
	if len(ids) != len(cs) {
		t.Errorf("choice ids are not unique: %v", ids)
	}
}

func TestBuildBallotLabelsInDisplayOrder(t *testing.T) {
	order := []string{"p1", "p2"}
	answers := map[string]string{"p1": "x", "p2": "y"}
	cs := buildBallot(order, answers, "z", seeded())
	for i, c := range cs {
		if c.id != string(choiceIDs[i]) {
			t.Errorf("choice %d has id %q, want %q", i, c.id, string(choiceIDs[i]))
		}
	}
}

func TestPairUp(t *testing.T) {
	tests := []struct {
		n    int
		want []int // group sizes
	}{
		{n: 0, want: nil},
		{n: 1, want: nil},
		{n: 2, want: []int{2}},
		{n: 3, want: []int{3}},
		{n: 4, want: []int{2, 2}},
		{n: 5, want: []int{3, 2}},
		{n: 12, want: []int{2, 2, 2, 2, 2, 2}},
	}
	for _, tt := range tests {
		ids := make([]string, tt.n)
		for i := range ids {
			ids[i] = string(rune('a' + i))
		}
		groups := pairUp(ids, seeded())
		if len(groups) != len(tt.want) {
			t.Fatalf("n=%d: %d groups, want %d", tt.n, len(groups), len(tt.want))
		}
		seen := make(map[string]bool)
		for i, g := range groups {
			if len(g) != tt.want[i] {
				t.Errorf("n=%d: group %d has %d, want %d", tt.n, i, len(g), tt.want[i])
			}
			for _, id := range g {
				if seen[id] {
					t.Errorf("n=%d: %s is in two groups", tt.n, id)
				}
				seen[id] = true
			}
		}
	}
}

func TestBuildMatchupsVoters(t *testing.T) {
	answers := map[string]string{"p1": "a", "p2": "b", "p3": "c", "p4": "d", "p5": "e"}

	t.Run("pair authors sit their own matchup out", func(t *testing.T) {
		present := []string{"p1", "p2", "p3", "p4"}
		ms := buildMatchups(present, present, answers, seeded())
		if len(ms) != 2 {
			t.Fatalf("%d matchups, want 2", len(ms))
		}
		for _, m := range ms {
			if len(m.voters) != 2 {
				t.Errorf("pair matchup has voters %v, want the other two players", m.voters)
			}
			for _, c := range m.choices {
				if indexOf(m.voters, c.authors[0]) >= 0 {
					t.Errorf("author %s may vote on their own pair", c.authors[0])
				}
			}
		}
	})

	t.Run("trio authors vote in their own matchup", func(t *testing.T) {
		present := []string{"p1", "p2", "p3"}
		ms := buildMatchups(present, present, answers, seeded())
		if len(ms) != 1 || len(ms[0].choices) != 3 {
			t.Fatalf("want one trio, got %+v", ms)
		}
		if len(ms[0].voters) != 3 {
			t.Errorf("trio voters = %v, want all three", ms[0].voters)
		}
	})

	t.Run("a player who did not answer votes everywhere", func(t *testing.T) {
		present := []string{"p1", "p2", "p3"}
		ms := buildMatchups(present, []string{"p1", "p2"}, answers, seeded())
		if len(ms) != 1 || len(ms[0].voters) != 1 || ms[0].voters[0] != "p3" {
			t.Errorf("want one pair voted on by p3, got %+v", ms)
		}
	})
}
