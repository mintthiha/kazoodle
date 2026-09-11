package imposter

import (
	"fmt"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

// ─── test helpers ───────────────────────────────────────────────────────────

func mkPlayers(n int, locale string) []game.Player {
	ps := make([]game.Player, n)
	for i := range ps {
		ps[i] = game.Player{ID: string(rune('a' + i)), Locale: locale}
	}
	return ps
}

func clientMsg(body *pb.ImposterClientMessage) []byte {
	raw, err := protojson.Marshal(body)
	if err != nil {
		panic(err)
	}
	return raw
}

func readyEvent(id string) game.Event {
	return game.Event{
		PlayerID: id,
		Data:     clientMsg(&pb.ImposterClientMessage{Body: &pb.ImposterClientMessage_MarkReady{MarkReady: &pb.MarkReady{}}}),
	}
}

func clueEvent(id, text string) game.Event {
	return game.Event{
		PlayerID: id,
		Data:     clientMsg(&pb.ImposterClientMessage{Body: &pb.ImposterClientMessage_SubmitClue{SubmitClue: &pb.SubmitClue{Text: text}}}),
	}
}

func voteEvent(voterID, suspectID string) game.Event {
	return game.Event{
		PlayerID: voterID,
		Data:     clientMsg(&pb.ImposterClientMessage{Body: &pb.ImposterClientMessage_CastVote{CastVote: &pb.CastVote{SuspectId: suspectID}}}),
	}
}

// readyAll drives every player's MarkReady, in order. Fails the test on error.
func readyAll(t *testing.T, st game.State, order []string) (game.State, []game.Effect) {
	t.Helper()
	var effects []game.Effect
	var err error
	for _, id := range order {
		st, effects, err = (Game{}).Advance(st, readyEvent(id))
		if err != nil {
			t.Fatalf("Advance(ready %s): %v", id, err)
		}
	}
	return st, effects
}

// giveAllClues drives every player's SubmitClue, in turn order.
func giveAllClues(t *testing.T, st game.State, order []string) (game.State, []game.Effect) {
	t.Helper()
	var effects []game.Effect
	var err error
	for i, id := range order {
		st, effects, err = (Game{}).Advance(st, clueEvent(id, fmt.Sprintf("clue-%d", i)))
		if err != nil {
			t.Fatalf("Advance(clue %d, %s): %v", i, id, err)
		}
	}
	return st, effects
}

func collectRoles(t *testing.T, effects []game.Effect) map[string]*pb.RoleAssignment {
	t.Helper()
	out := map[string]*pb.RoleAssignment{}
	for _, e := range effects {
		s, ok := e.(game.Send)
		if !ok || len(s.To) == 0 {
			continue
		}
		m, ok := s.Msg.(*pb.ImposterServerMessage)
		if !ok {
			t.Fatalf("effect message is %T, want *pb.ImposterServerMessage", s.Msg)
		}
		if ra := m.GetRoleAssignment(); ra != nil {
			out[s.To[0]] = ra
		}
	}
	return out
}

// broadcastMsg returns the last broadcast (To == nil) ImposterServerMessage in
// effects, or fails the test if there isn't one.
func broadcastMsg(t *testing.T, effects []game.Effect) *pb.ImposterServerMessage {
	t.Helper()
	var got *pb.ImposterServerMessage
	for _, e := range effects {
		if s, ok := e.(game.Send); ok && len(s.To) == 0 {
			if m, ok := s.Msg.(*pb.ImposterServerMessage); ok {
				got = m
			}
		}
	}
	if got == nil {
		t.Fatal("no broadcast ImposterServerMessage in effects")
	}
	return got
}

func collectOutcomes(t *testing.T, effects []game.Effect) map[string]*pb.Outcome {
	t.Helper()
	out := map[string]*pb.Outcome{}
	for _, e := range effects {
		s, ok := e.(game.Send)
		if !ok || len(s.To) == 0 {
			continue
		}
		if m, ok := s.Msg.(*pb.ImposterServerMessage); ok {
			if o := m.GetOutcome(); o != nil {
				out[s.To[0]] = o
			}
		}
	}
	return out
}

// ─── reveal phase ───────────────────────────────────────────────────────────

func TestInitRejectsTooFewPlayers(t *testing.T) {
	if _, _, err := (Game{}).Init(mkPlayers(2, "en")); err == nil {
		t.Fatal("expected an error for 2 players")
	}
}

func TestInitAssignsExactlyOneImposterWithNoWord(t *testing.T) {
	st, effects, err := (Game{}).Init(mkPlayers(5, "en"))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	roles := collectRoles(t, effects)
	if len(roles) != 5 {
		t.Fatalf("got %d role assignments, want 5", len(roles))
	}

	var imposters int
	var crewWord string
	for id, r := range roles {
		if r.GetIsImposter() {
			imposters++
			if r.GetWord() != "" || r.GetCategory() != "" {
				t.Errorf("imposter %s got word %q / category %q", id, r.GetWord(), r.GetCategory())
			}
			continue
		}
		if r.GetWord() == "" {
			t.Errorf("crew member %s got no word", id)
		}
		if crewWord == "" {
			crewWord = r.GetWord()
		} else if r.GetWord() != crewWord {
			t.Errorf("crew words disagree: %q vs %q", r.GetWord(), crewWord)
		}
	}
	if imposters != 1 {
		t.Errorf("imposter count = %d, want 1", imposters)
	}

	s := st.(*state)
	if r := roles[s.imposterID]; r == nil || !r.GetIsImposter() {
		t.Errorf("state.imposterID %q is not the imposter in the effects", s.imposterID)
	}
}

func TestInitBroadcastsRevealProgress(t *testing.T) {
	_, effects, _ := (Game{}).Init(mkPlayers(4, "en"))
	rp := broadcastMsg(t, effects).GetRevealProgress()
	if rp == nil {
		t.Fatal("no RevealProgress broadcast")
	}
	if rp.GetTotal() != 4 {
		t.Errorf("total = %d, want 4", rp.GetTotal())
	}
	if len(rp.GetReadyPlayerIds()) != 0 {
		t.Errorf("ready = %v, want empty", rp.GetReadyPlayerIds())
	}
}

func TestInitLocalizesWordPerPlayerLocale(t *testing.T) {
	players := []game.Player{
		{ID: "a", Locale: "en"},
		{ID: "b", Locale: "fr"},
		{ID: "c", Locale: "en"},
		{ID: "d", Locale: "fr"},
	}
	st, effects, err := (Game{}).Init(players)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	entry := st.(*state).entry
	roles := collectRoles(t, effects)

	for _, p := range players {
		r := roles[p.ID]
		if r.GetIsImposter() {
			continue
		}
		want := entry.word.forLocale(p.Locale)
		if r.GetWord() != want {
			t.Errorf("player %s (%s) word = %q, want %q", p.ID, p.Locale, r.GetWord(), want)
		}
	}
}

func TestMarkReadyAccumulatesInTurnOrder(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	order := st.(*state).order

	var effects []game.Effect
	for i, id := range order {
		var err error
		st, effects, err = (Game{}).Advance(st, readyEvent(id))
		if err != nil {
			t.Fatalf("Advance(%s): %v", id, err)
		}
		if i < len(order)-1 {
			rp := broadcastMsg(t, effects).GetRevealProgress()
			if rp == nil || len(rp.GetReadyPlayerIds()) != i+1 {
				t.Fatalf("after %d readies, progress = %v", i+1, rp)
			}
		}
	}
	if st.(*state).phase != phaseClues {
		t.Errorf("phase = %s, want clues once everyone is ready", st.(*state).phase)
	}
}

func TestAdvanceDoesNotMutateInputState(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	before := st.(*state)
	_, _, err := (Game{}).Advance(st, readyEvent(before.order[0]))
	if err != nil {
		t.Fatalf("Advance: %v", err)
	}
	if len(before.ready) != 0 {
		t.Errorf("Advance mutated the input: ready = %v", before.ready)
	}
}

func TestMarkReadyIsIdempotent(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	id := st.(*state).order[0]
	st, _, _ = (Game{}).Advance(st, readyEvent(id))
	_, effects, err := (Game{}).Advance(st, readyEvent(id))
	if err != nil {
		t.Fatalf("Advance: %v", err)
	}
	if got := broadcastMsg(t, effects).GetRevealProgress().GetReadyPlayerIds(); len(got) != 1 {
		t.Errorf("ready = %v, want one entry", got)
	}
}

func TestAdvanceRejectsBadInput(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))

	if _, _, err := (Game{}).Advance(st, game.Event{PlayerID: "a", Data: []byte("{")}); err == nil {
		t.Error("malformed JSON: expected an error")
	}
	if _, _, err := (Game{}).Advance(st, game.Event{PlayerID: "a", Data: []byte("{}")}); err == nil {
		t.Error("empty message: expected an error")
	}
	if _, _, err := (Game{}).Advance("not-a-state", readyEvent("a")); err == nil {
		t.Error("wrong state type: expected an error")
	}
}

// ─── clue phase ─────────────────────────────────────────────────────────────

func TestClueTurnEnforcesOrder(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	order := st.(*state).order
	st, _ = readyAll(t, st, order)

	if _, _, err := (Game{}).Advance(st, clueEvent(order[1], "out of turn")); err == nil {
		t.Fatal("expected an error when it is not this player's turn")
	}
	if _, _, err := (Game{}).Advance(st, clueEvent(order[0], "in turn")); err != nil {
		t.Fatalf("Advance: %v", err)
	}
}

func TestSubmitClueRejectsEmptyText(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	order := st.(*state).order
	st, _ = readyAll(t, st, order)

	if _, _, err := (Game{}).Advance(st, clueEvent(order[0], "   ")); err == nil {
		t.Fatal("expected an error for a blank clue")
	}
}

func TestCluePhaseProgressesAndTransitionsToVote(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(4, "en"))
	order := st.(*state).order
	st, _ = readyAll(t, st, order)

	var lastEffects []game.Effect
	for i, id := range order {
		var err error
		st, lastEffects, err = (Game{}).Advance(st, clueEvent(id, fmt.Sprintf("word%d", i)))
		if err != nil {
			t.Fatalf("Advance(clue %d): %v", i, err)
		}
		if i < len(order)-1 {
			ct := broadcastMsg(t, lastEffects).GetClueTurn()
			if ct == nil {
				t.Fatalf("clue %d: no ClueTurn broadcast", i)
			}
			if ct.GetPlayerId() != order[i+1] {
				t.Errorf("after clue %d, turn = %s, want %s", i, ct.GetPlayerId(), order[i+1])
			}
			if len(ct.GetCluesSoFar()) != i+1 {
				t.Errorf("cluesSoFar length = %d, want %d", len(ct.GetCluesSoFar()), i+1)
			}
		}
	}

	vp := broadcastMsg(t, lastEffects).GetVotePhase()
	if vp == nil {
		t.Fatal("no VotePhase broadcast after the last clue")
	}
	if len(vp.GetClues()) != len(order) {
		t.Errorf("vote phase clue recap has %d entries, want %d", len(vp.GetClues()), len(order))
	}
	if len(vp.GetCandidateIds()) != len(order) {
		t.Errorf("candidates = %v, want all %d players", vp.GetCandidateIds(), len(order))
	}
	if st.(*state).phase != phaseVote {
		t.Fatalf("phase = %s, want vote", st.(*state).phase)
	}
}

// ─── vote phase ─────────────────────────────────────────────────────────────

func TestVoteTallyDeclaresCrewWinnerWhenImposterCaught(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	s := st.(*state)
	order, imposter := s.order, s.imposterID

	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st, order)

	var effects []game.Effect
	var err error
	for _, id := range order {
		st, effects, err = (Game{}).Advance(st, voteEvent(id, imposter))
		if err != nil {
			t.Fatalf("Advance(vote %s): %v", id, err)
		}
	}

	tally := broadcastMsg(t, effects).GetVoteTally()
	if tally == nil {
		t.Fatal("no VoteTally broadcast")
	}
	if tally.GetVotedOutId() != imposter {
		t.Errorf("voted out = %s, want the imposter %s", tally.GetVotedOutId(), imposter)
	}

	outcomes := collectOutcomes(t, effects)
	if len(outcomes) != len(order) {
		t.Fatalf("got %d private outcomes, want %d", len(outcomes), len(order))
	}
	for id, o := range outcomes {
		if !o.GetCrewWon() {
			t.Errorf("player %s: crewWon = false, want true", id)
		}
		if o.GetImposterId() != imposter {
			t.Errorf("player %s: imposterId = %s, want %s", id, o.GetImposterId(), imposter)
		}
	}
	if st.(*state).phase != phaseOutcome {
		t.Errorf("phase = %s, want outcome", st.(*state).phase)
	}
	for _, e := range effects {
		if _, ok := e.(game.EndGame); ok {
			t.Error("Advance emitted EndGame; the round should stay visible until a later slice adds play-again")
		}
	}
}

func TestVoteTieMeansImposterEscapes(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	order := st.(*state).order

	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st, order)

	// A three-way tie: each player votes for the next one, round-robin.
	var effects []game.Effect
	var err error
	for i, id := range order {
		suspect := order[(i+1)%len(order)]
		st, effects, err = (Game{}).Advance(st, voteEvent(id, suspect))
		if err != nil {
			t.Fatalf("Advance(vote %s): %v", id, err)
		}
	}

	tally := broadcastMsg(t, effects).GetVoteTally()
	if tally == nil {
		t.Fatal("no VoteTally broadcast")
	}
	if tally.GetVotedOutId() != "" {
		t.Errorf("voted out = %q, want empty (tie)", tally.GetVotedOutId())
	}
	for id, o := range collectOutcomes(t, effects) {
		if o.GetCrewWon() {
			t.Errorf("player %s: crewWon = true, want false on a tie", id)
		}
	}
}

func TestVoteChangeBeforeEveryoneHasVoted(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	order := st.(*state).order
	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st, order)

	st, effects, err := (Game{}).Advance(st, voteEvent(order[0], order[1]))
	if err != nil {
		t.Fatalf("Advance: %v", err)
	}
	if vp := broadcastMsg(t, effects).GetVoteProgress(); vp == nil || len(vp.GetVotedPlayerIds()) != 1 {
		t.Fatalf("vote progress = %v, want one voter", vp)
	}

	// Changing a vote before the round completes must not double count.
	_, effects, err = (Game{}).Advance(st, voteEvent(order[0], order[2]))
	if err != nil {
		t.Fatalf("Advance (changed vote): %v", err)
	}
	if vp := broadcastMsg(t, effects).GetVoteProgress(); vp == nil || len(vp.GetVotedPlayerIds()) != 1 {
		t.Fatalf("vote progress after change = %v, want still one voter", vp)
	}
}

func TestCastVoteRejectsUnknownSuspect(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	order := st.(*state).order
	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st, order)

	if _, _, err := (Game{}).Advance(st, voteEvent(order[0], "not-a-player")); err == nil {
		t.Fatal("expected an error for an unknown suspect")
	}
}

func TestCastVoteRejectedOutsideVotePhase(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"))
	order := st.(*state).order // still in the reveal phase

	if _, _, err := (Game{}).Advance(st, voteEvent(order[0], order[1])); err == nil {
		t.Fatal("expected an error when voting before the vote phase")
	}
}
