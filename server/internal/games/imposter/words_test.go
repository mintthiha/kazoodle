package imposter

import "testing"

func TestPickWordAnyCategoryCanReturnEveryGroup(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 500; i++ {
		seen[pickWord("").categoryKey] = true
	}
	want := []string{"places", "food", "animals", "objects", "activities", "jobs", "weather"}
	for _, key := range want {
		if !seen[key] {
			t.Errorf("pickWord(\"\") never produced category %q in 500 draws", key)
		}
	}
}

func TestPickWordFiltersToCategory(t *testing.T) {
	for i := 0; i < 50; i++ {
		if got := pickWord("food").categoryKey; got != "food" {
			t.Fatalf("pickWord(\"food\").categoryKey = %q, want %q", got, "food")
		}
	}
}

func TestPickWordUnknownCategoryFallsBackToAny(t *testing.T) {
	// Must not panic (e.g. index into an empty pool) and must still return a
	// real entry.
	if got := pickWord("not-a-category").categoryKey; got == "" {
		t.Fatal("pickWord with an unknown category returned a zero-value entry")
	}
}
