package imposter

import (
	"fmt"
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

// ─── how many passes a round has ────────────────────────────────────────────

func TestCluePassesFromOption(t *testing.T) {
	tests := []struct {
		name      string
		requested int32
		want      int
	}{
		{name: "unset means the default", requested: 0, want: defaultCluePasses},
		{name: "negative means the default", requested: -2, want: defaultCluePasses},
		{name: "one pass is the quick version", requested: 1, want: 1},
		{name: "the maximum is kept", requested: maxCluePasses, want: maxCluePasses},
		{name: "above the maximum is clamped", requested: 50, want: maxCluePasses},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := cluePassesFromOption(tt.requested); got != tt.want {
				t.Errorf("cluePassesFromOption(%d) = %d, want %d", tt.requested, got, tt.want)
			}
		})
	}
}

func TestInitAppliesTheCluePassesOption(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{CluePasses: 3}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	s := st.(*state)
	if s.cluePasses != 3 {
		t.Errorf("cluePasses = %d, want 3", s.cluePasses)
	}
	if s.cluePass != 1 {
		t.Errorf("cluePass = %d, want the round to start on the first pass", s.cluePass)
	}
}

func TestDefaultRoundHasTwoCluePasses(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), nil)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	if got := st.(*state).cluePasses; got != defaultCluePasses {
		t.Errorf("cluePasses = %d with no options, want %d", got, defaultCluePasses)
	}
}

// ─── going around the table twice ───────────────────────────────────────────

func TestSecondPassGoesAroundAgainBeforeTheVote(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(4, "en"), startOpts(&pb.StartOptions{CluePasses: 2}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	order := st.(*state).order
	st, _ = readyAll(t, st, order)

	// Pass 1: one clue each. The last one must not open the vote.
	var effects []game.Effect
	for i, id := range order {
		st, effects, err = (Game{}).Advance(st, clueEvent(id, fmt.Sprintf("first-%d", i)))
		if err != nil {
			t.Fatalf("Advance(pass 1 clue %d): %v", i, err)
		}
	}
	if got := st.(*state).phase; got != phaseClues {
		t.Fatalf("phase = %s after one lap of a two-pass round, want clues", got)
	}
	ct := broadcastMsg(t, effects).GetClueTurn()
	if ct == nil {
		t.Fatal("no ClueTurn broadcast opening the second pass")
	}
	if ct.GetCluePass() != 2 || ct.GetTotalCluePasses() != 2 {
		t.Errorf("pass %d of %d, want 2 of 2", ct.GetCluePass(), ct.GetTotalCluePasses())
	}
	if ct.GetPlayerId() != order[0] {
		t.Errorf("second pass starts with %s, want %s — same order, from the top", ct.GetPlayerId(), order[0])
	}
	if ct.GetTurnIndex() != 0 {
		t.Errorf("turnIndex = %d at the start of the second pass, want 0", ct.GetTurnIndex())
	}
	// The first pass is still on screen: that is what the second clue is read
	// against.
	if len(ct.GetCluesSoFar()) != len(order) {
		t.Errorf("recap has %d clues, want the %d from the first pass", len(ct.GetCluesSoFar()), len(order))
	}

	// Pass 2: one clue each again, and now the vote opens.
	for i, id := range order {
		st, effects, err = (Game{}).Advance(st, clueEvent(id, fmt.Sprintf("second-%d", i)))
		if err != nil {
			t.Fatalf("Advance(pass 2 clue %d): %v", i, err)
		}
	}
	if got := st.(*state).phase; got != phaseVote {
		t.Fatalf("phase = %s after the second lap, want vote", got)
	}
	vp := broadcastMsg(t, effects).GetVotePhase()
	if vp == nil {
		t.Fatal("no VotePhase broadcast after the last clue of the last pass")
	}
	if len(vp.GetClues()) != 2*len(order) {
		t.Errorf("vote recap has %d clues, want both passes (%d)", len(vp.GetClues()), 2*len(order))
	}
	// Both of a player's clues are in the recap, in the order they were given.
	if vp.GetClues()[0].GetPlayerId() != order[0] || vp.GetClues()[len(order)].GetPlayerId() != order[0] {
		t.Error("the recap is not two laps of the same order")
	}
}

func TestTurnOrderIsEnforcedInEveryPass(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{CluePasses: 2}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	order := st.(*state).order
	st, _ = readyAll(t, st, order)
	for i, id := range order { // finish pass 1
		st, _, err = (Game{}).Advance(st, clueEvent(id, fmt.Sprintf("first-%d", i)))
		if err != nil {
			t.Fatalf("Advance(pass 1 clue %d): %v", i, err)
		}
	}

	// Pass 2 is open and it is order[0]'s turn, so order[1] is still too early.
	if _, _, err := (Game{}).Advance(st, clueEvent(order[1], "out of turn")); err == nil {
		t.Error("expected an out-of-turn clue in the second pass to be rejected")
	}
}

func TestOnePassRoundStillGoesStraightToTheVote(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{CluePasses: 1}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	order := st.(*state).order
	st, _ = readyAll(t, st, order)

	var effects []game.Effect
	for i, id := range order {
		st, effects, err = (Game{}).Advance(st, clueEvent(id, fmt.Sprintf("clue-%d", i)))
		if err != nil {
			t.Fatalf("Advance(clue %d): %v", i, err)
		}
	}
	if got := st.(*state).phase; got != phaseVote {
		t.Fatalf("phase = %s after one lap of a one-pass round, want vote", got)
	}
	if broadcastMsg(t, effects).GetVotePhase() == nil {
		t.Error("no VotePhase broadcast after the last clue of a one-pass round")
	}
}

func TestEveryRoundOfTheMatchGetsItsPassesBack(t *testing.T) {
	st, _, err := (Game{}).Init(mkPlayers(3, "en"), startOpts(&pb.StartOptions{Rounds: 2, CluePasses: 2}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	st, _ = playRound(t, st, "escape", "")
	st, _, err = (Game{}).Advance(st, playAgainEvent(st.(*state).order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}

	s := st.(*state)
	if s.cluePasses != 2 || s.cluePass != 1 {
		t.Errorf("round 2: pass %d of %d, want 1 of 2", s.cluePass, s.cluePasses)
	}
	if len(s.clues) != 0 {
		t.Errorf("round 2 starts with %d clues, want none", len(s.clues))
	}
}
