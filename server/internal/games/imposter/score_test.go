package imposter

import (
	"reflect"
	"testing"
)

func TestRoundsFromOption(t *testing.T) {
	tests := []struct {
		name      string
		requested int32
		want      int
	}{
		{name: "unset means the default", requested: 0, want: defaultRounds},
		{name: "negative means the default", requested: -4, want: defaultRounds},
		{name: "one round is allowed", requested: 1, want: 1},
		{name: "a normal pick is kept", requested: 5, want: 5},
		{name: "the maximum is kept", requested: maxRounds, want: maxRounds},
		{name: "above the maximum is clamped", requested: 1000, want: maxRounds},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := roundsFromOption(tt.requested); got != tt.want {
				t.Errorf("roundsFromOption(%d) = %d, want %d", tt.requested, got, tt.want)
			}
		})
	}
}

func TestAward(t *testing.T) {
	order := []string{"a", "b", "c"}
	tests := []struct {
		name         string
		order        []string
		caught       bool
		stealCorrect bool
		want         map[string]int32
	}{
		{
			name:  "imposter escapes the vote",
			order: order,
			want:  map[string]int32{"b": pointsEscape},
		},
		{
			name:   "imposter is caught and the steal misses",
			order:  order,
			caught: true,
			want:   map[string]int32{"a": pointsCatch, "c": pointsCatch},
		},
		{
			name:         "imposter is caught but steals it back",
			order:        order,
			caught:       true,
			stealCorrect: true,
			want:         map[string]int32{"b": pointsSteal},
		},
		{
			// stealCorrect can only be true off the back of a catch, but a
			// caller passing it on an escape must not get both payouts.
			name:         "an escape ignores a stray stealCorrect",
			order:        order,
			stealCorrect: true,
			want:         map[string]int32{"b": pointsEscape},
		},
		{
			name:   "a crew member who already left earns nothing from the catch",
			order:  []string{"b", "c"}, // "a" left before the vote closed
			caught: true,
			want:   map[string]int32{"c": pointsCatch},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := award(tt.order, "b", tt.caught, tt.stealCorrect)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("award() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestApplyAwardAddsToRunningTotals(t *testing.T) {
	st := &state{
		roster:     []string{"a", "b", "c"},
		order:      []string{"a", "b", "c"},
		imposterID: "b",
		scores:     map[string]int32{"a": 1, "b": 2},
	}

	applyAward(st, false, false) // the imposter escapes: +2 to b

	if want := map[string]int32{"b": pointsEscape}; !reflect.DeepEqual(st.deltas, want) {
		t.Errorf("deltas = %v, want %v", st.deltas, want)
	}
	if want := map[string]int32{"a": 1, "b": 2 + pointsEscape}; !reflect.DeepEqual(st.scores, want) {
		t.Errorf("scores = %v, want %v", st.scores, want)
	}
}

func TestStandingsRankByScoreThenJoinOrder(t *testing.T) {
	st := &state{
		roster: []string{"a", "b", "c", "d"},
		order:  []string{"a", "b", "c", "d"},
		scores: map[string]int32{"a": 2, "b": 5, "c": 2},
		deltas: map[string]int32{"b": 3},
	}

	got := standings(st)
	want := []scoreRow{
		{playerID: "b", score: 5, delta: 3, joined: 1},
		{playerID: "a", score: 2, joined: 0}, // tied with c, joined earlier
		{playerID: "c", score: 2, joined: 2},
		{playerID: "d", joined: 3}, // never scored, still listed
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("standings() = %v, want %v", got, want)
	}
}

func TestLeaders(t *testing.T) {
	tests := []struct {
		name   string
		order  []string
		scores map[string]int32
		want   []string
	}{
		{
			name:   "one clear winner",
			order:  []string{"a", "b", "c"},
			scores: map[string]int32{"a": 2, "b": 5, "c": 1},
			want:   []string{"b"},
		},
		{
			name:   "a tie at the top is a shared win, in join order",
			order:  []string{"a", "b", "c"},
			scores: map[string]int32{"a": 5, "b": 1, "c": 5},
			want:   []string{"a", "c"},
		},
		{
			name:   "nobody scored, so nobody won",
			order:  []string{"a", "b", "c"},
			scores: map[string]int32{},
			want:   nil,
		},
		{
			name:   "the top scorer left, so the best of those still here wins",
			order:  []string{"b", "c"}, // "a" is gone
			scores: map[string]int32{"a": 9, "b": 4, "c": 1},
			want:   []string{"b"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &state{roster: []string{"a", "b", "c"}, order: tt.order, scores: tt.scores}
			if got := leaders(st); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("leaders() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestMatchOver(t *testing.T) {
	tests := []struct {
		name        string
		round       int
		totalRounds int
		players     int
		want        bool
	}{
		{name: "mid-match", round: 1, totalRounds: 3, players: 4, want: false},
		{name: "last round", round: 3, totalRounds: 3, players: 4, want: true},
		{name: "single-round match", round: 1, totalRounds: 1, players: 4, want: true},
		{
			// Enough rounds left, but not enough players to run one.
			name: "too few players remain", round: 1, totalRounds: 5, players: minPlayers - 1, want: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &state{round: tt.round, totalRounds: tt.totalRounds, order: make([]string, tt.players)}
			if got := st.matchOver(); got != tt.want {
				t.Errorf("matchOver() = %v, want %v", got, tt.want)
			}
		})
	}
}
