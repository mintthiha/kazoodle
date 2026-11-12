package fibblash

import (
	"testing"

	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

// total adds up a player's awards.
func total(awards []award, playerID string) int {
	n := 0
	for _, a := range awards {
		if a.playerID == playerID {
			n += a.points
		}
	}
	return n
}

func TestScoreTruth(t *testing.T) {
	choices := []choice{
		{id: "A", text: "kettle", authors: []string{"p1", "p2"}}, // a merged lie
		{id: "B", text: "toaster", authors: []string{"p3"}},
		{id: "C", text: "coffee pot", truth: true},
	}
	votes := map[string]string{
		"p1": "C", // found the truth
		"p2": "B", // fooled by p3
		"p3": "A", // fooled by p1 and p2
		"p4": "A", // fooled by p1 and p2
	}
	awards := scoreTruth(choices, votes)

	tests := []struct {
		player string
		want   int
	}{
		// +1000 for the truth, +500 x2 for fooling p3 and p4.
		{player: "p1", want: pointsTruth + 2*pointsFooled},
		// Fooled by p3, but her share of lie A fooled two.
		{player: "p2", want: 2 * pointsFooled},
		{player: "p3", want: pointsFooled},
		{player: "p4", want: 0},
	}
	for _, tt := range tests {
		if got := total(awards, tt.player); got != tt.want {
			t.Errorf("%s scored %d, want %d", tt.player, got, tt.want)
		}
	}
}

func TestScoreVotesIgnoresTheTruth(t *testing.T) {
	choices := []choice{
		{id: "A", text: "kettle", authors: []string{"p1"}},
		{id: "B", text: "coffee pot", truth: true},
	}
	awards := scoreVotes(choices, map[string]string{"p2": "A", "p3": "B", "p4": "A"})
	if got := total(awards, "p1"); got != 2*pointsVote {
		t.Errorf("p1 scored %d, want %d", got, 2*pointsVote)
	}
	if len(awards) != 1 {
		t.Errorf("awards = %+v, want only p1's", awards)
	}
}

func TestScoreMatchup(t *testing.T) {
	cs := []choice{
		{id: "A", authors: []string{"p1"}},
		{id: "B", authors: []string{"p2"}},
	}
	tests := []struct {
		name      string
		voters    []string
		votes     map[string]string
		wantP1    int
		wantSweep bool
	}{
		{
			name:   "a split vote",
			voters: []string{"p3", "p4"},
			votes:  map[string]string{"p3": "A", "p4": "B"},
			wantP1: pointsVote,
		},
		{
			name:      "every vote is a sweep",
			voters:    []string{"p3", "p4"},
			votes:     map[string]string{"p3": "A", "p4": "A"},
			wantP1:    2*pointsVote + pointsSweep,
			wantSweep: true,
		},
		{
			name:   "a voter who did not vote spoils the sweep",
			voters: []string{"p3", "p4", "p5"},
			votes:  map[string]string{"p3": "A", "p4": "A"},
			wantP1: 2 * pointsVote,
		},
		{
			name:   "the only vote there was is not a sweep",
			voters: []string{"p3"},
			votes:  map[string]string{"p3": "A"},
			wantP1: pointsVote,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			awards := scoreMatchup(matchup{choices: cs, voters: tt.voters, votes: tt.votes})
			if got := total(awards, "p1"); got != tt.wantP1 {
				t.Errorf("p1 scored %d, want %d", got, tt.wantP1)
			}
			swept := false
			for _, a := range awards {
				if a.reason == pb.AwardReason_AWARD_REASON_SWEEP {
					swept = true
				}
			}
			if swept != tt.wantSweep {
				t.Errorf("sweep = %v, want %v", swept, tt.wantSweep)
			}
		})
	}
}

// In a trio every author is also a voter, and can never vote for their own
// answer. A sweep is every vote the answer could have had, so its own author's
// vote must not count against it.
func TestScoreMatchupTrio(t *testing.T) {
	cs := []choice{
		{id: "A", authors: []string{"p1"}},
		{id: "B", authors: []string{"p2"}},
		{id: "C", authors: []string{"p3"}},
	}
	tests := []struct {
		name      string
		voters    []string
		votes     map[string]string
		wantP1    int
		wantSweep bool
	}{
		{
			name:      "three players: both other authors pick it",
			voters:    []string{"p1", "p2", "p3"},
			votes:     map[string]string{"p1": "B", "p2": "A", "p3": "A"},
			wantP1:    2*pointsVote + pointsSweep,
			wantSweep: true,
		},
		{
			name:      "five players: everyone but its author picks it",
			voters:    []string{"p1", "p2", "p3", "p4", "p5"},
			votes:     map[string]string{"p1": "C", "p2": "A", "p3": "A", "p4": "A", "p5": "A"},
			wantP1:    4*pointsVote + pointsSweep,
			wantSweep: true,
		},
		{
			name:      "its author not voting does not spoil it",
			voters:    []string{"p1", "p2", "p3"},
			votes:     map[string]string{"p2": "A", "p3": "A"},
			wantP1:    2*pointsVote + pointsSweep,
			wantSweep: true,
		},
		{
			name:   "one vote elsewhere spoils it",
			voters: []string{"p1", "p2", "p3", "p4"},
			votes:  map[string]string{"p1": "B", "p2": "A", "p3": "A", "p4": "B"},
			wantP1: 2 * pointsVote,
		},
		{
			name:   "a player who could have voted for it and did not spoils it",
			voters: []string{"p1", "p2", "p3", "p4"},
			votes:  map[string]string{"p1": "B", "p2": "A", "p3": "A"},
			wantP1: 2 * pointsVote,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			awards := scoreMatchup(matchup{choices: cs, voters: tt.voters, votes: tt.votes})
			if got := total(awards, "p1"); got != tt.wantP1 {
				t.Errorf("p1 scored %d, want %d", got, tt.wantP1)
			}
			swept := false
			for _, a := range awards {
				if a.reason == pb.AwardReason_AWARD_REASON_SWEEP {
					swept = true
				}
			}
			if swept != tt.wantSweep {
				t.Errorf("sweep = %v, want %v", swept, tt.wantSweep)
			}
		})
	}
}

func TestWinners(t *testing.T) {
	cs := []choice{{id: "A"}, {id: "B"}, {id: "C"}}
	tests := []struct {
		name  string
		votes map[string]string
		want  []string
	}{
		{name: "nobody voted", votes: nil, want: nil},
		{name: "one winner", votes: map[string]string{"x": "B", "y": "B", "z": "A"}, want: []string{"B"}},
		{name: "a tie is shared", votes: map[string]string{"x": "A", "y": "C"}, want: []string{"A", "C"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := winners(cs, tt.votes)
			if len(got) != len(tt.want) {
				t.Fatalf("winners = %v, want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("winners = %v, want %v", got, tt.want)
				}
			}
		})
	}
}

func TestStandingsShareRanksOnATie(t *testing.T) {
	s := &state{
		roster:  []string{"p1", "p2", "p3", "p4"},
		present: []string{"p1", "p2", "p3"}, // p4 left
		scores:  map[string]int{"p1": 500, "p2": 1500, "p3": 1500, "p4": 2000},
		deltas:  map[string]int{"p1": 500, "p2": 0, "p3": 500},
	}
	rows := standings(s)

	want := []struct {
		id   string
		rank int
	}{
		{id: "p4", rank: 1},
		{id: "p2", rank: 2}, // joined before p3, so listed first...
		{id: "p3", rank: 2}, // ...but the same rank, not a tiebreak
		{id: "p1", rank: 4},
	}
	for i, w := range want {
		if rows[i].playerID != w.id || rows[i].rank != w.rank {
			t.Errorf("row %d = %s rank %d, want %s rank %d", i, rows[i].playerID, rows[i].rank, w.id, w.rank)
		}
	}

	// A player who left keeps their row but cannot win.
	if got := leaders(s); len(got) != 2 || got[0] != "p2" || got[1] != "p3" {
		t.Errorf("leaders = %v, want the tied p2 and p3", got)
	}
	if got := topScorers(s); len(got) != 2 || got[0] != "p1" || got[1] != "p3" {
		t.Errorf("top scorers = %v, want p1 and p3", got)
	}
}

func TestNobodyLeadsBeforeAnyoneScores(t *testing.T) {
	s := &state{present: []string{"p1", "p2"}, scores: map[string]int{}}
	if got := leaders(s); got != nil {
		t.Errorf("leaders = %v, want none", got)
	}
}
