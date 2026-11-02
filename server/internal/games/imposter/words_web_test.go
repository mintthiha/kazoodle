package imposter

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"testing"
)

// webWordsPath is the copy of wordList that one-phone mode reads. That mode runs
// with no server at all, so it cannot ask for a word and has to ship its own.
// The path climbs out of this package to the repo root; go test always runs in
// the package's own directory, so it is stable.
const webWordsPath = "../../../../web/src/games/imposter/local/words.gen.json"

// updateWebWords rewrites the file instead of checking it:
//
//	go test ./internal/games/imposter -run TestWebWordsMatch -update
var updateWebWords = flag.Bool("update", false, "rewrite the web client's copy of the word list")

// webLocalized and webWord are the JSON shape of the web copy. The `json:"..."`
// tags name each field in the output. wordEntry itself stays untagged, and its
// fields unexported, because the server has no other reason to serialize it.
type webLocalized struct {
	En string `json:"en"`
	Fr string `json:"fr"`
}

type webWord struct {
	CategoryKey string       `json:"categoryKey"`
	Category    webLocalized `json:"category"`
	Word        webLocalized `json:"word"`
	Hint        webLocalized `json:"hint"`
}

func toWeb(l localized) webLocalized {
	return webLocalized{En: l.en, Fr: l.fr}
}

// TestWebWordsMatch fails when wordList changes and the web copy does not, which
// is what keeps words.go the one list anybody edits. It lives in a test rather
// than a CI step so that plain `go test ./...` catches it on any machine.
func TestWebWordsMatch(t *testing.T) {
	words := make([]webWord, 0, len(wordList))
	for _, w := range wordList {
		words = append(words, webWord{
			CategoryKey: w.categoryKey,
			Category:    toWeb(w.category),
			Word:        toWeb(w.word),
			Hint:        toWeb(w.hint),
		})
	}
	want, err := json.MarshalIndent(words, "", "  ")
	if err != nil {
		t.Fatalf("encoding word list: %v", err)
	}
	want = append(want, '\n')

	if *updateWebWords {
		if err := os.WriteFile(webWordsPath, want, 0o644); err != nil {
			t.Fatalf("writing %s: %v", webWordsPath, err)
		}
		return
	}

	got, err := os.ReadFile(webWordsPath)
	if err != nil {
		t.Fatalf("reading %s: %v", webWordsPath, err)
	}
	// A Windows checkout may hand back CRLF line endings. That is the same list.
	got = bytes.ReplaceAll(got, []byte("\r\n"), []byte("\n"))
	if !bytes.Equal(got, want) {
		t.Errorf("%s is out of date with wordList. Run: go test ./internal/games/imposter -run TestWebWordsMatch -update", webWordsPath)
	}
}
