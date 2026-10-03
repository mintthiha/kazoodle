package imposter

import (
	"fmt"
	"strings"
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

// startOpts marshals StartOptions the way the room hands them to Init: raw
// proto3-JSON bytes.
func startOpts(o *pb.StartOptions) []byte {
	raw, err := protojson.Marshal(o)
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

func abstainEvent(voterID string) game.Event {
	return game.Event{
		PlayerID: voterID,
		Data:     clientMsg(&pb.ImposterClientMessage{Body: &pb.ImposterClientMessage_CastVote{CastVote: &pb.CastVote{Abstain: true}}}),
	}
}

func guessEvent(id, text string) game.Event {
	return game.Event{
		PlayerID: id,
		Data:     clientMsg(&pb.ImposterClientMessage{Body: &pb.ImposterClientMessage_GuessWord{GuessWord: &pb.GuessWord{Text: text}}}),
	}
}

func playAgainEvent(id string) game.Event {
	return game.Event{
		PlayerID: id,
		Data:     clientMsg(&pb.ImposterClientMessage{Body: &pb.ImposterClientMessage_PlayAgain{PlayAgain: &pb.PlayAgain{}}}),
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

// broadcasts returns every broadcast (To == nil) ImposterServerMessage in
// effects, in order. A vote that catches the imposter emits two — VoteTally
// then StealPrompt — so callers that care about one specific kind should
// search this list rather than assume it's the last one.
func broadcasts(t *testing.T, effects []game.Effect) []*pb.ImposterServerMessage {
	t.Helper()
	var got []*pb.ImposterServerMessage
	for _, e := range effects {
		if s, ok := e.(game.Send); ok && len(s.To) == 0 {
			if m, ok := s.Msg.(*pb.ImposterServerMessage); ok {
				got = append(got, m)
			}
		}
	}
	return got
}

func findVoteTally(t *testing.T, effects []game.Effect) *pb.VoteTally {
	t.Helper()
	for _, m := range broadcasts(t, effects) {
		if tally := m.GetVoteTally(); tally != nil {
			return tally
		}
	}
	t.Fatal("no VoteTally broadcast in effects")
	return nil
}

func findStealPrompt(effects []game.Effect) *pb.StealPrompt {
	for _, e := range effects {
		if s, ok := e.(game.Send); ok && len(s.To) == 0 {
			if m, ok := s.Msg.(*pb.ImposterServerMessage); ok {
				if sp := m.GetStealPrompt(); sp != nil {
					return sp
				}
			}
		}
	}
	return nil
}

func hasEndGame(effects []game.Effect) bool {
	for _, e := range effects {
		if _, ok := e.(game.EndGame); ok {
			return true
		}
	}
	return false
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
	if _, _, err := (Game{}).Init(mkPlayers(2, "en"), nil); err == nil {
		t.Fatal("expected an error for 2 players")
	}
}

func TestInitAssignsExactlyOneImposterWithNoWord(t *testing.T) {
	st, effects, err := (Game{}).Init(mkPlayers(5, "en"), nil)
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
			if r.GetWord() != "" || r.GetHint() != "" {
				t.Errorf("imposter %s got word %q / hint %q", id, r.GetWord(), r.GetHint())
			}
			if r.GetCategory() == "" {
				t.Errorf("imposter %s got no category; category is public and always set", id)
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

func TestInitHintsEnabledGivesImposterHintButNotWord(t *testing.T) {
	opts := startOpts(&pb.StartOptions{HintsEnabled: true})
	st, effects, err := (Game{}).Init(mkPlayers(5, "en"), opts)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	s := st.(*state)
	roles := collectRoles(t, effects)

	r := roles[s.imposterID]
	if r == nil || !r.GetIsImposter() {
		t.Fatalf("roles[%s] = %v, want the imposter's own role", s.imposterID, r)
	}
	if r.GetWord() != "" {
		t.Errorf("imposter got word %q, want empty even with hints on", r.GetWord())
	}
	wantHint := s.entry.hint.forLocale("en")
	if r.GetHint() != wantHint {
		t.Errorf("imposter hint = %q, want %q", r.GetHint(), wantHint)
	}
	wantCategory := s.entry.category.forLocale("en")
	if r.GetCategory() != wantCategory {
		t.Errorf("imposter category = %q, want %q", r.GetCategory(), wantCategory)
	}
}

func TestInitHintsDisabledByDefault(t *testing.T) {
	// No options at all (nil) — same as StartOptions{} — must leave the
	// imposter with no hint, but category is public regardless, same as
	// TestInitAssignsExactlyOneImposterWithNoWord.
	opts := startOpts(&pb.StartOptions{HintsEnabled: false})
	st, effects, err := (Game{}).Init(mkPlayers(5, "en"), opts)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	s := st.(*state)
	roles := collectRoles(t, effects)
	r := roles[s.imposterID]
	if r.GetHint() != "" {
		t.Errorf("imposter hint = %q, want empty with hints off", r.GetHint())
	}
	if r.GetCategory() == "" {
		t.Error("imposter category is empty, want it set regardless of hints")
	}
}

func TestInitBroadcastsRevealProgress(t *testing.T) {
	_, effects, _ := (Game{}).Init(mkPlayers(4, "en"), nil)
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
	st, effects, err := (Game{}).Init(players, nil)
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
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
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
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
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
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
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
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)

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
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
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
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
	order := st.(*state).order
	st, _ = readyAll(t, st, order)

	if _, _, err := (Game{}).Advance(st, clueEvent(order[0], "   ")); err == nil {
		t.Fatal("expected an error for a blank clue")
	}
}

func TestCluePhaseProgressesAndTransitionsToVote(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(4, "en"), nil)
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

func TestVoteCatchingImposterOpensStealPhaseInsteadOfOutcome(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
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

	tally := findVoteTally(t, effects)
	if tally.GetVotedOutId() != imposter {
		t.Errorf("voted out = %s, want the imposter %s", tally.GetVotedOutId(), imposter)
	}
	if sp := findStealPrompt(effects); sp == nil || sp.GetImposterId() != imposter {
		t.Fatalf("StealPrompt = %v, want one naming the imposter %s", sp, imposter)
	}
	// No Outcome yet — the imposter's steal guess still decides it.
	if outcomes := collectOutcomes(t, effects); len(outcomes) != 0 {
		t.Errorf("got %d private outcomes before the steal guess, want 0", len(outcomes))
	}
	if st.(*state).phase != phaseSteal {
		t.Errorf("phase = %s, want steal", st.(*state).phase)
	}
}

func TestVoteTieMeansImposterEscapes(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
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
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
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
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
	order := st.(*state).order
	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st, order)

	if _, _, err := (Game{}).Advance(st, voteEvent(order[0], "not-a-player")); err == nil {
		t.Fatal("expected an error for an unknown suspect")
	}
}

func TestCastVoteRejectsEmptySuspectWithoutAbstain(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
	order := st.(*state).order
	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st, order)

	if _, _, err := (Game{}).Advance(st, voteEvent(order[0], "")); err == nil {
		t.Fatal("expected an error for an empty suspect id with abstain not set")
	}
}

func TestAbstainDoesNotCountTowardAnySuspect(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
	order := st.(*state).order
	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st, order)

	// Everyone abstains. Nobody is removed and no suspect gets any votes.
	var effects []game.Effect
	var err error
	for _, id := range order {
		st, effects, err = (Game{}).Advance(st, abstainEvent(id))
		if err != nil {
			t.Fatalf("Advance(abstain %s): %v", id, err)
		}
	}

	tally := findVoteTally(t, effects)
	if tally.GetVotedOutId() != "" {
		t.Errorf("voted out = %q, want empty when everyone abstains", tally.GetVotedOutId())
	}
	if tally.GetAbstainCount() != int32(len(order)) {
		t.Errorf("abstain count = %d, want %d", tally.GetAbstainCount(), len(order))
	}
	if len(tally.GetCounts()) != 0 {
		t.Errorf("counts = %v, want none — every vote was an abstain", tally.GetCounts())
	}
}

func TestVotePhaseAdvertisesVoteSeconds(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
	order := st.(*state).order
	st, _ = readyAll(t, st, order)
	_, effects := giveAllClues(t, st, order)

	vp := broadcastMsg(t, effects).GetVotePhase()
	if vp.GetVoteSeconds() != voteSeconds {
		t.Errorf("voteSeconds = %d, want %d", vp.GetVoteSeconds(), voteSeconds)
	}
}

func TestCastVoteRejectedOutsideVotePhase(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
	order := st.(*state).order // still in the reveal phase

	if _, _, err := (Game{}).Advance(st, voteEvent(order[0], order[1])); err == nil {
		t.Fatal("expected an error when voting before the vote phase")
	}
}

// ─── steal phase ────────────────────────────────────────────────────────────

// reachStealPhase drives a fresh 3-player round through reveal, clues, and a
// unanimous vote for the imposter, landing on the steal phase.
func reachStealPhase(t *testing.T) (st game.State, order []string, imposter string) {
	t.Helper()
	st, _, _ = (Game{}).Init(mkPlayers(3, "en"), nil)
	s := st.(*state)
	order, imposter = s.order, s.imposterID

	st, _ = readyAll(t, st, order)
	st, _ = giveAllClues(t, st, order)

	var err error
	for _, id := range order {
		st, _, err = (Game{}).Advance(st, voteEvent(id, imposter))
		if err != nil {
			t.Fatalf("Advance(vote %s): %v", id, err)
		}
	}
	if st.(*state).phase != phaseSteal {
		t.Fatalf("setup: phase = %s, want steal", st.(*state).phase)
	}
	return st, order, imposter
}

func TestStealGuessCorrectStealsTheWinForTheImposter(t *testing.T) {
	st, order, imposter := reachStealPhase(t)
	word := st.(*state).entry.word.forLocale("en")

	// Mixed case and surrounding whitespace still count as correct.
	st, effects, err := (Game{}).Advance(st, guessEvent(imposter, "  "+strings.ToUpper(word)+"  "))
	if err != nil {
		t.Fatalf("Advance(guess): %v", err)
	}

	outcomes := collectOutcomes(t, effects)
	if len(outcomes) != len(order) {
		t.Fatalf("got %d private outcomes, want %d", len(outcomes), len(order))
	}
	for id, o := range outcomes {
		if o.GetCrewWon() {
			t.Errorf("player %s: crewWon = true, want false — the imposter stole it", id)
		}
		if !o.GetStealAttempted() || !o.GetStealCorrect() {
			t.Errorf("player %s: stealAttempted=%v stealCorrect=%v, want true/true", id, o.GetStealAttempted(), o.GetStealCorrect())
		}
		if o.GetStealGuess() != strings.ToUpper(word) {
			t.Errorf("player %s: stealGuess = %q, want the trimmed guess text echoed back", id, o.GetStealGuess())
		}
	}
	if st.(*state).phase != phaseOutcome {
		t.Errorf("phase = %s, want outcome", st.(*state).phase)
	}
}

func TestStealGuessWrongLeavesCrewWinStanding(t *testing.T) {
	st, _, imposter := reachStealPhase(t)

	_, effects, err := (Game{}).Advance(st, guessEvent(imposter, "definitely not the word"))
	if err != nil {
		t.Fatalf("Advance(guess): %v", err)
	}

	for id, o := range collectOutcomes(t, effects) {
		if !o.GetCrewWon() {
			t.Errorf("player %s: crewWon = false, want true — the steal missed", id)
		}
		if !o.GetStealAttempted() || o.GetStealCorrect() {
			t.Errorf("player %s: stealAttempted=%v stealCorrect=%v, want true/false", id, o.GetStealAttempted(), o.GetStealCorrect())
		}
	}
}

func TestStealGuessRejectsNonImposter(t *testing.T) {
	st, order, imposter := reachStealPhase(t)
	var crew string
	for _, id := range order {
		if id != imposter {
			crew = id
			break
		}
	}
	if _, _, err := (Game{}).Advance(st, guessEvent(crew, "anything")); err == nil {
		t.Fatal("expected an error when a non-imposter tries to steal")
	}
}

func TestStealGuessRejectsEmptyText(t *testing.T) {
	st, _, imposter := reachStealPhase(t)
	if _, _, err := (Game{}).Advance(st, guessEvent(imposter, "   ")); err == nil {
		t.Fatal("expected an error for a blank guess")
	}
}

func TestStealGuessRejectedOutsideStealPhase(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
	order := st.(*state).order // still in the reveal phase
	if _, _, err := (Game{}).Advance(st, guessEvent(order[0], "beach")); err == nil {
		t.Fatal("expected an error when guessing outside the steal phase")
	}
}

// ─── play again ─────────────────────────────────────────────────────────────

func TestPlayAgainEndsTheGameOnceTheRoundIsOver(t *testing.T) {
	st, order, imposter := reachStealPhase(t)
	st, _, err := (Game{}).Advance(st, guessEvent(imposter, "wrong on purpose"))
	if err != nil {
		t.Fatalf("Advance(guess): %v", err)
	}
	if st.(*state).phase != phaseOutcome {
		t.Fatalf("setup: phase = %s, want outcome", st.(*state).phase)
	}

	_, effects, err := (Game{}).Advance(st, playAgainEvent(order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}
	if !hasEndGame(effects) {
		t.Error("PlayAgain from the outcome phase should emit game.EndGame")
	}
}

func TestInitRestrictsWordToChosenCategory(t *testing.T) {
	opts := startOpts(&pb.StartOptions{Category: "animals"})
	for i := 0; i < 20; i++ { // pickWord is random; make sure the filter actually holds
		st, _, err := (Game{}).Init(mkPlayers(5, "en"), opts)
		if err != nil {
			t.Fatalf("Init: %v", err)
		}
		if got := st.(*state).entry.categoryKey; got != "animals" {
			t.Fatalf("entry.categoryKey = %q, want %q", got, "animals")
		}
	}
}

func TestInitUnknownCategoryFallsBackToAny(t *testing.T) {
	opts := startOpts(&pb.StartOptions{Category: "not-a-real-category"})
	st, _, err := (Game{}).Init(mkPlayers(5, "en"), opts)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	if st.(*state).entry.categoryKey == "" {
		t.Fatal("entry.categoryKey is empty; pickWord should still have picked a real word")
	}
}

func TestPlayAgainRejectedBeforeOutcome(t *testing.T) {
	st, _, _ := (Game{}).Init(mkPlayers(3, "en"), nil)
	order := st.(*state).order
	if _, _, err := (Game{}).Advance(st, playAgainEvent(order[0])); err == nil {
		t.Fatal("expected an error when the round hasn't reached its outcome yet")
	}
}
