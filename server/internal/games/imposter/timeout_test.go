package imposter

import (
	"testing"
	"time"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter/pb"
)

func TestClueSecondsFromOption(t *testing.T) {
	tests := []struct {
		name      string
		requested int32
		want      int
	}{
		// Unlike rounds and clue passes, zero is a real answer here: off.
		{name: "unset means no clock", requested: 0, want: 0},
		{name: "negative means no clock", requested: -5, want: 0},
		{name: "a normal choice is kept", requested: 30, want: 30},
		{name: "one second is allowed, however unwise", requested: 1, want: 1},
		{name: "the cap is applied", requested: maxClueSeconds, want: maxClueSeconds},
		{name: "an absurd request is clamped, not refused", requested: 99999, want: maxClueSeconds},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clueSecondsFromOption(tt.requested); got != tt.want {
				t.Errorf("clueSecondsFromOption(%d) = %d, want %d", tt.requested, got, tt.want)
			}
		})
	}
}

// timerIn returns the single game.Timer among effects, or nil if there is
// none. Nil is the meaningful case as often as not: no Timer is how the game
// tells the room to drop the clock.
func timerIn(effects []game.Effect) *game.Timer {
	for _, e := range effects {
		if tm, ok := e.(game.Timer); ok {
			return &tm
		}
	}
	return nil
}

func TestAnUntimedRoundArmsNoClock(t *testing.T) {
	// No clue_seconds in the options: exactly how every round worked before
	// the clock existed, and still the default.
	st, effects, err := (Game{}).Init(mkPlayers(3, "en"), nil)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	if tm := timerIn(effects); tm != nil {
		t.Errorf("the reveal armed a %v clock, want none", tm.After)
	}

	st, effects = readyAll(t, st, st.(*state).order)
	if tm := timerIn(effects); tm != nil {
		t.Errorf("an untimed clue phase armed a %v clock, want none", tm.After)
	}
	if secs := anyClueTurn(t, effects).GetClueSeconds(); secs != 0 {
		t.Errorf("ClueTurn advertises %ds, want 0 on an untimed round", secs)
	}
}

func TestATimedRoundArmsAClockOnEveryTurn(t *testing.T) {
	st := startTimed(t, 3, 30)

	st, effects := readyAll(t, st, st.(*state).order)
	tm := timerIn(effects)
	if tm == nil {
		t.Fatal("the first clue turn armed no clock")
	}
	if tm.After != 30*time.Second {
		t.Errorf("armed for %v, want 30s", tm.After)
	}
	if tm.Tag != tagClueTurn {
		t.Errorf("tag = %q, want %q", tm.Tag, tagClueTurn)
	}
	if secs := anyClueTurn(t, effects).GetClueSeconds(); secs != 30 {
		t.Errorf("ClueTurn advertises %ds, want 30", secs)
	}

	// And again for the next player: the clock is per turn, so every turn has
	// to bring its own.
	cur := st.(*state)
	next, effects, err := (Game{}).Advance(st, clueEvent(cur.order[cur.turn], "sand"))
	if err != nil {
		t.Fatalf("Advance(clue): %v", err)
	}
	if tm := timerIn(effects); tm == nil || tm.After != 30*time.Second {
		t.Fatalf("the second turn armed %v, want a 30s clock", tm)
	}
	_ = next
}

func TestTheVoteDropsTheClueClock(t *testing.T) {
	st := startTimed(t, 3, 30)
	st, _ = readyAll(t, st, st.(*state).order)

	// Drive the whole clue phase. The last clue opens the vote, and those
	// effects must carry no Timer — that absence is what stops the clue clock
	// firing into the vote.
	var effects []game.Effect
	for st.(*state).phase == phaseClues {
		cur := st.(*state)
		var err error
		st, effects, err = (Game{}).Advance(st, clueEvent(cur.order[cur.turn], clueFor(cur)))
		if err != nil {
			t.Fatalf("Advance(clue): %v", err)
		}
	}
	if st.(*state).phase != phaseVote {
		t.Fatalf("phase = %s, want vote", st.(*state).phase)
	}
	if tm := timerIn(effects); tm != nil {
		t.Errorf("opening the vote armed a %v clock; the clue clock should simply end", tm.After)
	}
}

func TestATimeoutRecordsAMissedTurnAndMovesOn(t *testing.T) {
	st := startTimed(t, 4, 30)
	st, _ = readyAll(t, st, st.(*state).order)

	cur := st.(*state)
	stalled := cur.order[0]

	st, effects, err := (Game{}).Advance(st, timerEvent(tagClueTurn))
	if err != nil {
		t.Fatalf("Advance(timer): %v", err)
	}
	got := st.(*state)

	if got.turn != 1 {
		t.Errorf("turn = %d after a timeout, want 1 — the turn must not be retried forever", got.turn)
	}
	if len(got.clues) != 1 {
		t.Fatalf("clues = %v, want one recorded missed turn", got.clues)
	}
	if got.clues[0].playerID != stalled {
		t.Errorf("the missed turn is attributed to %s, want %s", got.clues[0].playerID, stalled)
	}
	if got.clues[0].text != missedClue {
		t.Errorf("missed clue text = %q, want empty", got.clues[0].text)
	}
	// The next player gets their own clock.
	if tm := timerIn(effects); tm == nil || tm.After != 30*time.Second {
		t.Errorf("the turn after a timeout armed %v, want a 30s clock", tm)
	}
	if turn := anyClueTurn(t, effects); turn.GetPlayerId() != got.order[1] {
		t.Errorf("ClueTurn names %s, want %s", turn.GetPlayerId(), got.order[1])
	}
}

func TestEveryPlayerTimingOutStillReachesTheVote(t *testing.T) {
	// The worst case: nobody says anything all round. It has to end in a vote
	// rather than stall, and the recap has to show that nobody spoke.
	st := startTimed(t, 3, 30)
	st, _ = readyAll(t, st, st.(*state).order)

	for i := 0; st.(*state).phase == phaseClues; i++ {
		if i > 20 {
			t.Fatal("the clue phase never ended on repeated timeouts")
		}
		var err error
		st, _, err = (Game{}).Advance(st, timerEvent(tagClueTurn))
		if err != nil {
			t.Fatalf("Advance(timer): %v", err)
		}
	}

	got := st.(*state)
	if got.phase != phaseVote {
		t.Fatalf("phase = %s, want vote", got.phase)
	}
	// Three players, two passes by default: six missed turns.
	if len(got.clues) != 6 {
		t.Errorf("recorded %d missed turns, want 6", len(got.clues))
	}
	for _, c := range got.clues {
		if c.text != missedClue {
			t.Errorf("clue %+v should have been a missed turn", c)
		}
	}
}

func TestATimeoutOutsideTheCluePhaseChangesNothing(t *testing.T) {
	st := startTimed(t, 3, 30)
	// Still in the reveal: no clue clock can legitimately be running.
	next, effects, err := (Game{}).Advance(st, timerEvent(tagClueTurn))
	if err != nil {
		t.Fatalf("Advance(timer) in the reveal: %v, want it ignored", err)
	}
	if effects != nil {
		t.Errorf("an out-of-phase expiry produced %d effects, want none", len(effects))
	}
	if next.(*state).phase != phaseReveal {
		t.Errorf("phase = %s, want it untouched", next.(*state).phase)
	}
}

func TestAnUnknownTimerTagIsIgnored(t *testing.T) {
	st := startTimed(t, 3, 30)
	st, _ = readyAll(t, st, st.(*state).order)
	before := st.(*state)

	next, effects, err := (Game{}).Advance(st, timerEvent("vote-turn"))
	if err != nil {
		t.Fatalf("Advance(unknown tag): %v, want it ignored", err)
	}
	if effects != nil {
		t.Errorf("an unknown tag produced %d effects, want none", len(effects))
	}
	if got := next.(*state); got.turn != before.turn || len(got.clues) != len(before.clues) {
		t.Error("an unknown tag changed the round")
	}
}

func TestTheClockSurvivesIntoTheNextRound(t *testing.T) {
	// clue_seconds is a match-level option, so beginRound has to carry it.
	st := startTimed(t, 3, 15)
	st, _ = playRound(t, st, "escape", "")

	// PlayAgain is what starts round 2 of a match.
	st, _, err := (Game{}).Advance(st, playAgainEvent(st.(*state).order[0]))
	if err != nil {
		t.Fatalf("Advance(play again): %v", err)
	}
	if secs := st.(*state).clueSeconds; secs != 15 {
		t.Fatalf("clueSeconds = %d in round 2, want 15", secs)
	}
	st, effects := readyAll(t, st, st.(*state).order)
	if tm := timerIn(effects); tm == nil || tm.After != 15*time.Second {
		t.Errorf("round 2 armed %v, want a 15s clock", tm)
	}
	_ = st
}

// ─── helpers ────────────────────────────────────────────────────────────────

// startTimed starts a round of n players with a clue clock of secs seconds.
func startTimed(t *testing.T, n, secs int) game.State {
	t.Helper()
	st, _, err := (Game{}).Init(mkPlayers(n, "en"), startOpts(&pb.StartOptions{ClueSeconds: int32(secs)}))
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	return st
}

// timerEvent is what the room hands a game when one of its clocks runs out.
func timerEvent(tag string) game.Event {
	return game.Event{Timer: &game.TimerFired{Tag: tag}}
}

// clueFor returns a clue that passes validation in the given state: distinct
// from every clue already given, and never the secret word.
func clueFor(st *state) string {
	return "clue-" + string(rune('a'+len(st.clues)))
}

// anyClueTurn returns the ClueTurn message among effects, failing if there
// isn't exactly one to look at.
func anyClueTurn(t *testing.T, effects []game.Effect) *pb.ClueTurn {
	t.Helper()
	for _, e := range effects {
		send, ok := e.(game.Send)
		if !ok {
			continue
		}
		if msg, ok := send.Msg.(*pb.ImposterServerMessage); ok {
			if turn := msg.GetClueTurn(); turn != nil {
				return turn
			}
		}
	}
	t.Fatal("no ClueTurn among the effects")
	return nil
}
