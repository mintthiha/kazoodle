package game

import (
	"testing"
	"time"
)

// Timer must satisfy Effect, or a game returning one would not compile at the
// call site rather than here. The effect set is closed on purpose — only this
// package can define one — so this assertion is what keeps a new effect
// honest.
var _ Effect = Timer{}

func TestTimerIsAValueNotAWait(t *testing.T) {
	// The point of the type: asking for a clock is returning a struct. There
	// is nothing to start, nothing to stop, and no goroutine involved, which
	// is what lets a game stay a pure function.
	effects := []Effect{Timer{After: 30 * time.Second, Tag: "clue-turn"}}

	tm, ok := effects[0].(Timer)
	if !ok {
		t.Fatalf("effect is %T, want game.Timer", effects[0])
	}
	if tm.After != 30*time.Second || tm.Tag != "clue-turn" {
		t.Errorf("timer = %+v, want 30s/clue-turn", tm)
	}
}

func TestEventTellsATimerApartFromAPlayer(t *testing.T) {
	tests := []struct {
		name        string
		ev          Event
		wantIsTimer bool
	}{
		{
			name:        "a player action",
			ev:          Event{PlayerID: "p1", Data: []byte(`{"submitClue":{}}`)},
			wantIsTimer: false,
		},
		{
			name:        "an expired timer",
			ev:          Event{Timer: &TimerFired{Tag: "clue-turn"}},
			wantIsTimer: true,
		},
		{
			// The zero Event must not read as a timer: every game written
			// before timers existed treats what it is given as a player
			// acting.
			name:        "the zero event",
			ev:          Event{},
			wantIsTimer: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.ev.IsTimer(); got != tt.wantIsTimer {
				t.Errorf("IsTimer() = %v, want %v", got, tt.wantIsTimer)
			}
		})
	}
}

func TestATimerEventNamesNoPlayer(t *testing.T) {
	ev := Event{Timer: &TimerFired{Tag: "clue-turn"}}
	if ev.PlayerID != "" {
		t.Errorf("PlayerID = %q on a timer event, want empty", ev.PlayerID)
	}
	if ev.Timer.Tag != "clue-turn" {
		t.Errorf("tag = %q, want clue-turn", ev.Timer.Tag)
	}
}
