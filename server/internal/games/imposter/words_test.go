package imposter

import (
	"strings"
	"testing"
)

// TestWordListEntriesAreComplete checks each entry on its own: a blank field
// would put an empty slip in someone's hand, and a hint containing the word
// would hand the imposter the answer.
func TestWordListEntriesAreComplete(t *testing.T) {
	for _, w := range wordList {
		fields := []string{w.categoryKey, w.category.en, w.category.fr, w.word.en, w.word.fr, w.hint.en, w.hint.fr}
		for _, f := range fields {
			if strings.TrimSpace(f) == "" {
				t.Errorf("entry %+v has a blank field", w)
				break
			}
		}
		if strings.Contains(normalizeWord(w.hint.en), normalizeWord(w.word.en)) {
			t.Errorf("hint %q gives away the word %q", w.hint.en, w.word.en)
		}
		if strings.Contains(normalizeWord(w.hint.fr), normalizeWord(w.word.fr)) {
			t.Errorf("hint %q gives away the word %q", w.hint.fr, w.word.fr)
		}
	}
}

// TestWordListHasNoDuplicates matters beyond tidiness: one-phone mode remembers
// played words by their English text, so a word listed twice could never be
// told apart from itself. It is checked per language, across all categories.
func TestWordListHasNoDuplicates(t *testing.T) {
	seenEn := make(map[string]bool)
	seenFr := make(map[string]bool)
	for _, w := range wordList {
		en, fr := normalizeWord(w.word.en), normalizeWord(w.word.fr)
		if seenEn[en] {
			t.Errorf("English word %q is listed twice", w.word.en)
		}
		if seenFr[fr] {
			t.Errorf("French word %q is listed twice", w.word.fr)
		}
		seenEn[en], seenFr[fr] = true, true
	}
}

// TestWordListCategoriesAreConsistent catches a typo in one of the many copies
// of a category's name, which would show players two spellings of one category.
func TestWordListCategoriesAreConsistent(t *testing.T) {
	labels := make(map[string]localized)
	for _, w := range wordList {
		if first, ok := labels[w.categoryKey]; ok && first != w.category {
			t.Errorf("category %q is called both %+v and %+v", w.categoryKey, first, w.category)
		}
		labels[w.categoryKey] = w.category
	}
}

// TestEveryCategoryCoversTheLongestMatch keeps every category big enough that a
// match of maxRounds could be played on it without running out of new words.
func TestEveryCategoryCoversTheLongestMatch(t *testing.T) {
	counts := make(map[string]int)
	for _, w := range wordList {
		counts[w.categoryKey]++
	}
	for key, n := range counts {
		if n < maxRounds {
			t.Errorf("category %q has %d words, want at least %d", key, n, maxRounds)
		}
	}
}

func TestPickWordAnyCategoryCanReturnEveryGroup(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 500; i++ {
		seen[pickWord("", nil).categoryKey] = true
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
		if got := pickWord("food", nil).categoryKey; got != "food" {
			t.Fatalf("pickWord(\"food\").categoryKey = %q, want %q", got, "food")
		}
	}
}

func TestPickWordUnknownCategoryFallsBackToAny(t *testing.T) {
	// Must not panic (e.g. index into an empty pool) and must still return a
	// real entry.
	if got := pickWord("not-a-category", nil).categoryKey; got == "" {
		t.Fatal("pickWord with an unknown category returned a zero-value entry")
	}
}
