package imposter

import (
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

// Game must satisfy game.Leaver, or the room silently falls back to ending the
// round on every departure. Go interfaces are implicit, so nothing else in the
// build would catch a Leave that drifted out of shape — this assignment does,
// at compile time.
var _ game.Leaver = Game{}

// mkState builds a round in a known shape. The index arithmetic in Leave is
// the fiddly part, and Init deliberately randomizes both the turn order and
// who the imposter is, so these tests construct the layout they need instead
// of drawing for it.
func mkState(ph phase, order []string, imposterID string) *state {
	locales := make(map[string]string, len(order))
	for _, id := range order {
		locales[id] = "en"
	}
	return &state{
		phase:      ph,
		order:      order,
		imposterID: imposterID,
		entry:      wordList[0],
		locales:    locales,
		ready:      make(map[string]bool),
		votes:      make(map[string]string),
	}
}

func leaveOK(t *testing.T, st game.State, playerID string) (*state, []game.Effect) {
	t.Helper()
	next, effects, err := (Game{}).Leave(st, playerID)
	if err != nil {
		t.Fatalf("Leave(%s): %v", playerID, err)
	}
	return next.(*state), effects
}

// crewIn returns a player from order who isn't the imposter, skipping any id
// in except. Used by the tests that drive a real Init and so can't know in
// advance who drew the imposter.
func crewIn(t *testing.T, s *state, except ...string) string {
	t.Helper()
	for _, id := range s.order {
		if id == s.imposterID || contains(except, id) {
			continue
		}
		return id
	}
	t.Fatalf("no crew member in %v besides imposter %s and %v", s.order, s.imposterID, except)
	return ""
}

// findVotePhase returns the VotePhase broadcast in effects. A reopened ballot
// ships a VoteProgress right behind it, so this searches rather than taking
// the last broadcast.
func findVotePhase(t *testing.T, effects []game.Effect) *pb.VotePhase {
	t.Helper()
	for _, m := range broadcasts(t, effects) {
		if vp := m.GetVotePhase(); vp != nil {
			return vp
		}
	}
	t.Fatal("no VotePhase broadcast in effects")
	return nil
}

func wantEndGame(t *testing.T, effects []game.Effect, reason string) {
	t.Helper()
	if !hasEndGame(effects) {
		t.Fatalf("no EndGame in effects, want one with reason %q", reason)
	}
	for _, e := range effects {
		if eg, ok := e.(game.EndGame); ok && eg.Reason != reason {
			t.Errorf("EndGame reason = %q, want %q", eg.Reason, reason)
		}
	}
}

// ─── bookkeeping ────────────────────────────────────────────────────────────

func TestLeaveByStrangerIsANoOp(t *testing.T) {
	st := mkState(phaseClues, []string{"a", "b", "c"}, "a")
	next, effects := leaveOK(t, st, "zz")

	if len(effects) != 0 {
		t.Errorf("got %d effects for a player who isn't in the round, want 0", len(effects))
	}
	if len(next.order) != 3 {
		t.Errorf("order = %v, want it unchanged", next.order)
	}
}

func TestLeaveDoesNotMutateInputState(t *testing.T) {
	st := mkState(phaseReveal, []string{"a", "b", "c", "d"}, "a")
	st.ready["b"] = true
	st.ready["c"] = true

	_, _ = leaveOK(t, st, "b")

	if len(st.order) != 4 {
		t.Errorf("input order = %v, want the original 4", st.order)
	}
	if !st.ready["b"] {
		t.Error("input state's ready map lost b; Leave must treat it as read-only")
	}
}

func TestLeaveDropsReadinessAndVote(t *testing.T) {
	// A stale entry in either map would leave len(ready)/len(votes) out of step
	// with len(order), and allReady/allVoted could then never be true again.
	st := mkState(phaseVote, []string{"a", "b", "c", "d"}, "a")
	for _, id := range st.order {
		st.ready[id] = true
	}
	st.votes["b"] = "a"
	st.votes["d"] = "b"

	next, _ := leaveOK(t, st, "b")

	if next.ready["b"] {
		t.Error("b is still marked ready after leaving")
	}
	if _, ok := next.votes["b"]; ok {
		t.Error("b's vote survived their departure")
	}
	if len(next.order) != 3 {
		t.Errorf("order = %v, want 3 players", next.order)
	}
}

// ─── rounds that can't continue ─────────────────────────────────────────────

func TestLeaveByImposterEndsTheRound(t *testing.T) {
	for _, ph := range []phase{phaseReveal, phaseClues, phaseVote, phaseSteal} {
		t.Run(ph.String(), func(t *testing.T) {
			st := mkState(ph, []string{"a", "b", "c", "d", "e"}, "c")
			_, effects := leaveOK(t, st, "c")
			wantEndGame(t, effects, "imposter_left")
		})
	}
}

func TestLeaveBelowMinPlayersEndsTheRound(t *testing.T) {
	st := mkState(phaseClues, []string{"a", "b", "c"}, "a")
	_, effects := leaveOK(t, st, "b")
	wantEndGame(t, effects, "player_left")
}

func TestLeaveDuringOutcomeNeverEndsTheRound(t *testing.T) {
	// Results are already on everyone's screen. Whoever is left gets to keep
	// reading them — even the imposter walking out, even down to one player,
	// neither of which can change what the round decided.
	st := mkState(phaseOutcome, []string{"a", "b", "c"}, "a")
	next, effects := leaveOK(t, st, "a")

	if len(effects) != 0 {
		t.Errorf("got %d effects for a leave during the outcome, want 0", len(effects))
	}
	if next.phase != phaseOutcome {
		t.Errorf("phase = %s, want outcome", next.phase)
	}
	if len(next.order) != 2 {
		t.Errorf("order = %v, want b and c", next.order)
	}
}

// ─── reveal phase ───────────────────────────────────────────────────────────

func TestLeaveDuringRevealReportsTheSmallerTotal(t *testing.T) {
	st := mkState(phaseReveal, []string{"a", "b", "c", "d"}, "a")
	st.ready["a"] = true

	next, effects := leaveOK(t, st, "d")

	rp := broadcastMsg(t, effects).GetRevealProgress()
	if rp == nil {
		t.Fatal("no RevealProgress broadcast")
	}
	if rp.GetTotal() != 3 {
		t.Errorf("total = %d, want 3", rp.GetTotal())
	}
	if next.phase != phaseReveal {
		t.Errorf("phase = %s, want reveal", next.phase)
	}
}

func TestLeaveByTheLastUnreadyPlayerOpensTheCluePhase(t *testing.T) {
	// The round was waiting on d alone, so their leaving completes the reveal.
	st := mkState(phaseReveal, []string{"a", "b", "c", "d"}, "a")
	st.ready["a"], st.ready["b"], st.ready["c"] = true, true, true

	next, effects := leaveOK(t, st, "d")

	ct := broadcastMsg(t, effects).GetClueTurn()
	if ct == nil {
		t.Fatal("no ClueTurn broadcast; the reveal should be complete")
	}
	if ct.GetPlayerId() != "a" || ct.GetTotal() != 3 {
		t.Errorf("ClueTurn = {%s, total %d}, want {a, total 3}", ct.GetPlayerId(), ct.GetTotal())
	}
	if next.phase != phaseClues {
		t.Errorf("phase = %s, want clues", next.phase)
	}
}

// ─── clue phase ─────────────────────────────────────────────────────────────

func TestLeaveDuringCluesKeepsTheRightPlayerUp(t *testing.T) {
	// order a,b,c,d,e with the imposter parked on e, so every departure below
	// is a crew member. turn is 2: a and b have given clues, c is up.
	tests := []struct {
		name     string
		leaver   string
		wantTurn int
		wantUp   string
	}{
		{"before the current turn", "a", 1, "c"},
		{"the current turn-holder", "c", 2, "d"},
		{"after the current turn", "d", 2, "c"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := mkState(phaseClues, []string{"a", "b", "c", "d", "e"}, "e")
			st.turn = 2
			st.clues = []clueEntry{{playerID: "a", text: "one"}, {playerID: "b", text: "two"}}

			next, effects := leaveOK(t, st, tt.leaver)

			if next.turn != tt.wantTurn {
				t.Errorf("turn = %d, want %d", next.turn, tt.wantTurn)
			}
			ct := broadcastMsg(t, effects).GetClueTurn()
			if ct == nil {
				t.Fatal("no ClueTurn broadcast")
			}
			if ct.GetPlayerId() != tt.wantUp {
				t.Errorf("up next = %s, want %s", ct.GetPlayerId(), tt.wantUp)
			}
			if ct.GetTotal() != 4 {
				t.Errorf("total = %d, want 4", ct.GetTotal())
			}
		})
	}
}

func TestLeaveByTheLastClueGiverOpensTheVote(t *testing.T) {
	st := mkState(phaseClues, []string{"a", "b", "c", "d"}, "a")
	st.turn = 3 // a, b and c have gone; d is the only one left to give a clue
	st.clues = []clueEntry{
		{playerID: "a", text: "one"},
		{playerID: "b", text: "two"},
		{playerID: "c", text: "three"},
	}

	next, effects := leaveOK(t, st, "d")

	vp := broadcastMsg(t, effects).GetVotePhase()
	if vp == nil {
		t.Fatal("no VotePhase broadcast; every remaining player has given a clue")
	}
	if len(vp.GetCandidateIds()) != 3 {
		t.Errorf("candidates = %v, want the 3 remaining players", vp.GetCandidateIds())
	}
	if contains(vp.GetCandidateIds(), "d") {
		t.Error("d is still a candidate after leaving")
	}
	if next.phase != phaseVote {
		t.Errorf("phase = %s, want vote", next.phase)
	}
}

func TestLeaveKeepsTheDepartedPlayersClueInTheRecap(t *testing.T) {
	// The room heard it and argued about it; dropping it would rewrite what
	// happened mid-round.
	st := mkState(phaseClues, []string{"a", "b", "c", "d"}, "d")
	st.turn = 2
	st.clues = []clueEntry{{playerID: "a", text: "sandy"}, {playerID: "b", text: "waves"}}

	_, effects := leaveOK(t, st, "a")

	ct := broadcastMsg(t, effects).GetClueTurn()
	if ct == nil {
		t.Fatal("no ClueTurn broadcast")
	}
	if len(ct.GetCluesSoFar()) != 2 {
		t.Fatalf("recap has %d clues, want both of them", len(ct.GetCluesSoFar()))
	}
	got := ct.GetCluesSoFar()[0]
	if got.GetPlayerId() != "a" || got.GetText() != "sandy" {
		t.Errorf("first clue = {%s, %q}, want a's sandy", got.GetPlayerId(), got.GetText())
	}
}

// ─── vote phase ─────────────────────────────────────────────────────────────

func TestLeaveDuringVoteResolvesOnceEveryoneLeftHasVoted(t *testing.T) {
	// a, b and c have voted; the round was waiting only on d.
	st := mkState(phaseVote, []string{"a", "b", "c", "d"}, "a")
	st.votes["a"], st.votes["b"], st.votes["c"] = "b", "a", "a"

	next, effects := leaveOK(t, st, "d")

	tally := findVoteTally(t, effects)
	if tally.GetVotedOutId() != "a" {
		t.Errorf("voted out = %q, want a", tally.GetVotedOutId())
	}
	if sp := findStealPrompt(effects); sp == nil || sp.GetImposterId() != "a" {
		t.Fatalf("StealPrompt = %v, want one naming the imposter a", sp)
	}
	if next.phase != phaseSteal {
		t.Errorf("phase = %s, want steal", next.phase)
	}
}

func TestLeaveByAVoteTargetVoidsThoseVotes(t *testing.T) {
	// b and c both voted for c, who then left. Those votes are void. d voted
	// for a, who is still here, so that vote stands.
	st := mkState(phaseVote, []string{"a", "b", "c", "d", "e"}, "a")
	st.votes["b"], st.votes["c"], st.votes["d"] = "c", "c", "a"

	next, effects := leaveOK(t, st, "c")

	vp := findVotePhase(t, effects)
	if contains(vp.GetCandidateIds(), "c") {
		t.Errorf("candidates = %v, want c gone", vp.GetCandidateIds())
	}
	if _, ok := next.votes["b"]; ok {
		t.Error("b's vote for the departed player was kept")
	}
	if next.votes["d"] != "a" {
		t.Errorf("d's vote = %q, want it preserved as a", next.votes["d"])
	}
	if next.phase != phaseVote {
		t.Errorf("phase = %s, want vote", next.phase)
	}
}

func TestLeaveDuringVoteAlwaysReopensTheBallot(t *testing.T) {
	// Nobody voted for e, so no vote is void — but e is still on everyone's
	// ballot, built from the VotePhase they were handed. Without a fresh one,
	// e stays tappable, and the vote timer auto-submitting a selected e would
	// be rejected as naming someone who isn't in the room, stalling the round
	// on a player who can never vote successfully.
	st := mkState(phaseVote, []string{"a", "b", "c", "d", "e"}, "a")
	st.votes["b"] = "a"

	next, effects := leaveOK(t, st, "e")

	vp := findVotePhase(t, effects)
	if contains(vp.GetCandidateIds(), "e") {
		t.Errorf("candidates = %v, want e gone", vp.GetCandidateIds())
	}
	if len(vp.GetClues()) != len(st.clues) {
		t.Errorf("clue recap has %d entries, want the same %d as before", len(vp.GetClues()), len(st.clues))
	}

	// The new ballot carries the honest count: b's vote for a is still good.
	prog := broadcastMsg(t, effects).GetVoteProgress()
	if prog == nil {
		t.Fatal("no VoteProgress alongside the reopened ballot")
	}
	if prog.GetTotal() != 4 {
		t.Errorf("total = %d, want 4", prog.GetTotal())
	}
	if len(prog.GetVotedPlayerIds()) != 1 {
		t.Errorf("voted = %v, want just b", prog.GetVotedPlayerIds())
	}
	if next.votes["b"] != "a" {
		t.Errorf("b's vote = %q, want it preserved as a", next.votes["b"])
	}
	if next.phase != phaseVote {
		t.Errorf("phase = %s, want vote", next.phase)
	}
}

// ─── steal phase ────────────────────────────────────────────────────────────

func TestLeaveDuringStealByCrewChangesNothing(t *testing.T) {
	st := mkState(phaseSteal, []string{"a", "b", "c", "d"}, "a")
	next, effects := leaveOK(t, st, "d")

	if len(effects) != 0 {
		t.Errorf("got %d effects, want 0 — everyone is waiting on the imposter", len(effects))
	}
	if next.phase != phaseSteal {
		t.Errorf("phase = %s, want steal", next.phase)
	}
	if len(next.order) != 3 {
		t.Errorf("order = %v, want 3 players", next.order)
	}
}

// ─── end to end over a real round ───────────────────────────────────────────

func TestLeaveMidRoundLetsTheRoundFinish(t *testing.T) {
	// Drives a real Init — random order, random imposter — through to an
	// Outcome with one crew member walking out during the clue phase.
	st, _, err := (Game{}).Init(mkPlayers(5, "en"), nil)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	imposter := st.(*state).imposterID
	st, _ = readyAll(t, st, st.(*state).order)

	// A crew member gives their clue, then another one quits. The imposter is
	// kept in deliberately: their leaving would void the round instead.
	up := crewIn(t, st.(*state))
	for st.(*state).order[st.(*state).turn] != up {
		cur := st.(*state)
		st, _, err = (Game{}).Advance(st, clueEvent(cur.order[cur.turn], "clue"))
		if err != nil {
			t.Fatalf("Advance(clue %s): %v", cur.order[cur.turn], err)
		}
	}
	st, _, err = (Game{}).Advance(st, clueEvent(up, "first"))
	if err != nil {
		t.Fatalf("Advance(clue %s): %v", up, err)
	}

	quitter := crewIn(t, st.(*state), up)
	st, _ = leaveOK(t, st, quitter)
	if contains(st.(*state).order, quitter) {
		t.Fatalf("order %v still has the quitter %s", st.(*state).order, quitter)
	}

	// Everyone still here gives a clue, from whoever is up now.
	for st.(*state).phase == phaseClues {
		cur := st.(*state)
		st, _, err = (Game{}).Advance(st, clueEvent(cur.order[cur.turn], "clue"))
		if err != nil {
			t.Fatalf("Advance(clue %s): %v", cur.order[cur.turn], err)
		}
	}
	if st.(*state).phase != phaseVote {
		t.Fatalf("phase = %s, want vote", st.(*state).phase)
	}

	// Everyone left votes for the imposter, who then guesses wrong.
	var effects []game.Effect
	for _, id := range st.(*state).order {
		st, effects, err = (Game{}).Advance(st, voteEvent(id, imposter))
		if err != nil {
			t.Fatalf("Advance(vote %s): %v", id, err)
		}
	}
	if findStealPrompt(effects) == nil {
		t.Fatal("no StealPrompt; the vote should have caught the imposter")
	}
	st, effects, err = (Game{}).Advance(st, guessEvent(imposter, "definitely-not-the-word"))
	if err != nil {
		t.Fatalf("Advance(steal guess): %v", err)
	}

	outcomes := collectOutcomes(t, effects)
	if len(outcomes) != 4 {
		t.Fatalf("got %d private outcomes, want 4 — one per remaining player", len(outcomes))
	}
	if _, ok := outcomes[quitter]; ok {
		t.Error("the quitter was sent an Outcome")
	}
	for id, o := range outcomes {
		if !o.GetCrewWon() {
			t.Errorf("%s's outcome says the crew lost, want a crew win", id)
		}
	}
}
