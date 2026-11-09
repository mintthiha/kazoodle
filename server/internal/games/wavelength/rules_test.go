package wavelength

import (
	"reflect"
	"strings"
	"testing"
)

func TestCheckCategory(t *testing.T) {
	asked := []category{{name: "Animals"}}
	tests := []struct {
		name     string
		category string
		wantCode string // "" means accepted
	}{
		{"fresh", "Food", ""},
		{"empty", "", codeCategoryEmpty},
		{"at the limit", strings.Repeat("a", maxCategoryLength), ""},
		{"over the limit", strings.Repeat("a", maxCategoryLength+1), codeCategoryTooLong},
		// Runes, not bytes: 32 "é" is 64 bytes but only 32 characters.
		{"accents count once", strings.Repeat("é", maxCategoryLength), ""},
		{"repeat", "Animals", codeCategoryRepeated},
		{"repeat in another case", "aNiMaLs", codeCategoryRepeated},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rejectCode(checkCategory(asked, tt.category)); got != tt.wantCode {
				t.Errorf("code = %q, want %q", got, tt.wantCode)
			}
		})
	}
}

func TestCheckAnswer(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		wantCode string
	}{
		{"ordinary", "Penguins", ""},
		{"empty", "", codeAnswerEmpty},
		{"at the limit", strings.Repeat("x", maxAnswerLength), ""},
		{"over the limit", strings.Repeat("x", maxAnswerLength+1), codeAnswerTooLong},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rejectCode(checkAnswer(tt.text)); got != tt.wantCode {
				t.Errorf("code = %q, want %q", got, tt.wantCode)
			}
		})
	}
}

func TestCheckNumber(t *testing.T) {
	tests := []struct {
		n    int32
		want bool // accepted
	}{
		{0, false}, {1, true}, {5, true}, {10, true}, {11, false}, {-3, false},
	}
	for _, tt := range tests {
		if got := checkNumber(tt.n) == nil; got != tt.want {
			t.Errorf("checkNumber(%d) accepted = %v, want %v", tt.n, got, tt.want)
		}
	}
}

func TestAward(t *testing.T) {
	givers := []string{"p2", "p3", "p4"}
	tests := []struct {
		name string
		won  bool
		want map[string]int32
	}{
		{"right guess: one point to the Psychic per Clue Giver", true, map[string]int32{"p1": 3}},
		{"wrong guess: one point to each Clue Giver", false, map[string]int32{"p2": 1, "p3": 1, "p4": 1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := award("p1", givers, tt.won); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("award = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGivingOrder(t *testing.T) {
	present := []string{"p1", "p2", "p3", "p4"}
	tests := []struct {
		psychic string
		want    []string
	}{
		{"p1", []string{"p2", "p3", "p4"}},
		{"p3", []string{"p4", "p1", "p2"}}, // wraps round the table
		{"p4", []string{"p1", "p2", "p3"}},
	}
	for _, tt := range tests {
		if got := givingOrder(present, tt.psychic); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("givingOrder(%s) = %v, want %v", tt.psychic, got, tt.want)
		}
	}
}

func TestStandingsAndLeaders(t *testing.T) {
	st := &state{
		roster:  []string{"p1", "p2", "p3", "p4"},
		present: []string{"p1", "p2", "p4"}, // p3 left
		scores:  map[string]int32{"p2": 2, "p3": 5, "p4": 2},
		deltas:  map[string]int32{"p4": 1},
	}

	var order []string
	for _, row := range standings(st) {
		order = append(order, row.playerID)
	}
	// p3 still listed, and first: their points were earned. p2 before p4 on
	// the tie because p2 joined first.
	if want := []string{"p3", "p2", "p4", "p1"}; !reflect.DeepEqual(order, want) {
		t.Errorf("standings order = %v, want %v", order, want)
	}

	// p3 has the most points but has left, so cannot win.
	if got, want := leaders(st), []string{"p2", "p4"}; !reflect.DeepEqual(got, want) {
		t.Errorf("leaders = %v, want %v", got, want)
	}

	if got := leaders(&state{present: []string{"p1"}, scores: map[string]int32{}}); got != nil {
		t.Errorf("leaders with no points = %v, want none", got)
	}
}
