package imposter

import (
	"testing"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

func mkPlayers(n int, locale string) []game.Player {
	ps := make([]game.Player, n)
	for i := range ps {
		ps[i] = game.Player{ID: string(rune('a' + i)), Locale: locale}
	}
	return ps
}

func readyEvent(id string) game.Event {
	raw, err := protojson.Marshal(&pb.ImposterClientMessage{
		Body: &pb.ImposterClientMessage_MarkReady{MarkReady: &pb.MarkReady{}},
	})
	if err != nil {
		panic(err)
	}
	return game.Event{PlayerID: id, Data: raw}
}

// collectRoles pulls the private RoleAssignment sent to each player.
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

// lastRevealProgress returns the last broadcast RevealProgress in effects.
func lastRevealProgress(t *testing.T, effects []game.Effect) *pb.RevealProgress {
	t.Helper()
	var got *pb.RevealProgress
	for _, e := range effects {
		s, ok := e.(game.Send)
		if !ok || len(s.To) != 0 {
			continue
		}
		if m, ok := s.Msg.(*pb.ImposterServerMessage); ok {
			if rp := m.GetRevealProgress(); rp != nil {
				got = rp
			}
		}
	}
	if got == nil {
		t.Fatal("no RevealProgress broadcast in effects")
	}
	return got
}

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
	rp := lastRevealProgress(t, effects)
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
		rp := lastRevealProgress(t, effects)
		if got := rp.GetReadyPlayerIds(); len(got) != i+1 {
			t.Fatalf("after %d readies, progress lists %v", i+1, got)
		}
		// ready list follows turn order
		for j := 0; j <= i; j++ {
			if rp.GetReadyPlayerIds()[j] != order[j] {
				t.Errorf("ready[%d] = %q, want %q", j, rp.GetReadyPlayerIds()[j], order[j])
			}
		}
		if rp.GetTotal() != 3 {
			t.Errorf("total = %d, want 3", rp.GetTotal())
		}
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
	if got := lastRevealProgress(t, effects).GetReadyPlayerIds(); len(got) != 1 {
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
