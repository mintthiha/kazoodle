package imposter

import (
	"errors"
	"fmt"
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
)

// rejectionCode returns the client-facing code of err, or "" if err is not a
// rejection. A plain error reaching a player as "something went wrong" is a
// different outcome from a rejection, so the tests distinguish them.
func rejectionCode(err error) string {
	var rej *game.Rejected
	if errors.As(err, &rej) {
		return rej.Code
	}
	return ""
}

func TestValidateClue(t *testing.T) {
	// wordList[0] is Beach / Plage. p2 is the imposter throughout.
	order := []string{"p1", "p2", "p3"}

	tests := []struct {
		name     string
		locale   string // the acting player's locale
		playerID string
		clues    []clueEntry
		text     string
		wantCode string
	}{
		{
			name:     "an ordinary clue is fine",
			playerID: "p1",
			text:     "sand",
		},
		{
			name:     "empty is rejected",
			playerID: "p1",
			text:     "",
			wantCode: codeClueEmpty,
		},
		{
			name:     "crew may not say the secret word",
			playerID: "p1",
			text:     "Beach",
			wantCode: codeClueIsWord,
		},
		{
			name:     "case and whitespace don't get the word past the rule",
			playerID: "p1",
			text:     "  bEaCh ",
			wantCode: codeClueIsWord,
		},
		{
			name:     "crew may not say the word in the other language either",
			locale:   "en",
			playerID: "p1",
			text:     "Plage",
			wantCode: codeClueIsWord,
		},
		{
			name:     "a French player is held to the same rule",
			locale:   "fr",
			playerID: "p1",
			text:     "plage",
			wantCode: codeClueIsWord,
		},
		{
			// The rejection would otherwise be an oracle: the imposter could
			// type candidates until one bounced and learn the word outright.
			name:     "the imposter typing the word is allowed",
			playerID: "p2",
			text:     "Beach",
		},
		{
			name:     "a clue someone else already gave is rejected",
			playerID: "p3",
			clues:    []clueEntry{{playerID: "p1", text: "Sand"}},
			text:     "sand",
			wantCode: codeClueDuplicate,
		},
		{
			name:     "repeating your own earlier clue is rejected",
			playerID: "p1",
			clues:    []clueEntry{{playerID: "p1", text: "sand"}},
			text:     "sand",
			wantCode: codeClueDuplicate,
		},
		{
			name:     "a new clue after others have spoken is fine",
			playerID: "p1",
			clues:    []clueEntry{{playerID: "p1", text: "sand"}, {playerID: "p2", text: "towel"}},
			text:     "waves",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := mkState(phaseClues, order, "p2")
			st.clues = tt.clues
			if tt.locale != "" {
				st.locales[tt.playerID] = tt.locale
			}

			err := validateClue(st, tt.playerID, tt.text)
			if tt.wantCode == "" {
				if err != nil {
					t.Fatalf("validateClue(%q) = %v, want accepted", tt.text, err)
				}
				return
			}
			if got := rejectionCode(err); got != tt.wantCode {
				t.Fatalf("validateClue(%q) code = %q (err %v), want %q", tt.text, got, err, tt.wantCode)
			}
		})
	}
}

// A rejected clue must leave the round exactly where it was: same turn, same
// clue list. Otherwise one bad submission costs the player their turn.
func TestRejectedClueDoesNotConsumeTheTurn(t *testing.T) {
	st := mkState(phaseClues, []string{"p1", "p2", "p3"}, "p2")

	next, effects, err := advanceClue(st, "p1", "Beach")
	if rejectionCode(err) != codeClueIsWord {
		t.Fatalf("advanceClue = %v, want a %s rejection", err, codeClueIsWord)
	}
	if effects != nil {
		t.Errorf("a rejected clue produced %d effects, want none", len(effects))
	}
	got := next.(*state)
	if got.turn != 0 {
		t.Errorf("turn moved to %d on a rejected clue, want 0", got.turn)
	}
	if len(got.clues) != 0 {
		t.Errorf("a rejected clue was recorded: %v", got.clues)
	}

	// And the same player can still go, with a legal clue.
	next, _, err = advanceClue(got, "p1", "sand")
	if err != nil {
		t.Fatalf("advanceClue after a rejection: %v", err)
	}
	if n := next.(*state); n.turn != 1 || len(n.clues) != 1 {
		t.Errorf("after the retry: turn=%d clues=%v, want turn 1 and one clue", n.turn, n.clues)
	}
}

// The rules above are checked against validateClue directly. This one drives
// the whole path a real client takes — Init, reveal, then a SubmitClue event
// carrying the actual secret word — so a clue rule that is written but never
// called cannot pass the suite.
func TestCrewCannotSubmitTheSecretWordThroughAdvance(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(4, "en"), nil)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	st, _ = readyAll(t, st, st.(*state).order)

	// Init randomizes the order and the imposter, so walk the table to a crew
	// member's turn rather than assuming the leader is one.
	up := crewIn(t, st.(*state))
	for st.(*state).order[st.(*state).turn] != up {
		cur := st.(*state)
		st, _, err = (Game{}).Advance(st, clueEvent(cur.order[cur.turn], fmt.Sprintf("clue-%d", len(cur.clues))))
		if err != nil {
			t.Fatalf("Advance(clue %s): %v", cur.order[cur.turn], err)
		}
	}

	cur := st.(*state)
	word := cur.entry.word.forLocale("en")
	next, effects, err := (Game{}).Advance(st, clueEvent(up, word))
	if rejectionCode(err) != codeClueIsWord {
		t.Fatalf("submitting %q as crew member %s: err = %v, want a %s rejection", word, up, err, codeClueIsWord)
	}
	if effects != nil {
		t.Errorf("the rejected clue produced %d effects, want none", len(effects))
	}
	if n := next.(*state); len(n.clues) != len(cur.clues) {
		t.Errorf("the secret word was recorded as a clue: %v", n.clues)
	}
}
