package room

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/mintthiha/party-games/server/internal/game"
)

// ─── test doubles ───────────────────────────────────────────────────────────

// fakeClock hands out timers that fire only when a test says so. Its mutex is
// not decoration: AfterFunc is called from a room goroutine while the test
// goroutine reads and fires, so this is genuinely shared state and `go test
// -race` would say so otherwise.
type fakeClock struct {
	mu     sync.Mutex
	timers []*fakeTimer
}

type fakeTimer struct {
	d       time.Duration
	f       func()
	mu      sync.Mutex
	stopped bool
}

func (c *fakeClock) AfterFunc(d time.Duration, f func()) stopper {
	c.mu.Lock()
	defer c.mu.Unlock()
	ft := &fakeTimer{d: d, f: f}
	c.timers = append(c.timers, ft)
	return ft
}

// armed is how many timers have been handed out over the room's lifetime,
// fired or not.
func (c *fakeClock) armed() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.timers)
}

// nth returns a timer by arming order, so a test can hold on to an old one and
// fire it after the room has moved on.
func (c *fakeClock) nth(t *testing.T, i int) *fakeTimer {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	if i >= len(c.timers) {
		t.Fatalf("timer %d was never armed (only %d were)", i, len(c.timers))
	}
	return c.timers[i]
}

func (ft *fakeTimer) Stop() bool {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	already := ft.stopped
	ft.stopped = true
	return !already
}

// fire runs the timer's function, exactly as time.AfterFunc would — including
// for a timer that has already been stopped, which is the race the generation
// counter exists to survive.
func (ft *fakeTimer) fire() {
	ft.mu.Lock()
	f := ft.f
	ft.mu.Unlock()
	f()
}

// timedGame is a fake game that asks for a clock and announces every event it
// is handed on a channel, so a test can wait for the room to have processed
// one instead of guessing how long that takes.
type timedGame struct {
	// effectsFor decides what the game does with each event. Nil means the
	// default: re-arm the clock and say nothing.
	effectsFor func(ev game.Event) ([]game.Effect, error)

	seen chan game.Event
}

func newTimedGame() *timedGame {
	return &timedGame{seen: make(chan game.Event, 32)}
}

func (g *timedGame) Init([]game.Player, []byte) (game.State, []game.Effect, error) {
	return "state", []game.Effect{game.Timer{After: 30 * time.Second, Tag: "clue-turn"}}, nil
}

func (g *timedGame) Advance(s game.State, ev game.Event) (game.State, []game.Effect, error) {
	g.seen <- ev
	if g.effectsFor != nil {
		eff, err := g.effectsFor(ev)
		return s, eff, err
	}
	return s, []game.Effect{game.Timer{After: 30 * time.Second, Tag: "clue-turn"}}, nil
}

// nextEvent returns the next event the game was handed. The timeout is a
// stuck-test guard, not synchronisation: in a correct run the value is
// produced by a channel handoff and is already waiting.
func (g *timedGame) nextEvent(t *testing.T) game.Event {
	t.Helper()
	select {
	case ev := <-g.seen:
		return ev
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the game to be given an event")
		return game.Event{}
	}
}

// expectNoTimerEvent asserts the game has not been handed an expiry. Call it
// only after something else has been driven through the room, so that a
// timeout which was going to arrive already has.
func (g *timedGame) expectNoTimerEvent(t *testing.T) {
	t.Helper()
	for {
		select {
		case ev := <-g.seen:
			if ev.IsTimer() {
				t.Fatalf("the game was handed a timer event (tag %q) it should never have seen", ev.Timer.Tag)
			}
		default:
			return
		}
	}
}

// startTimedGame creates a one-player room running g, with a clock the test
// controls. StartGame is synchronous, so by the time it returns the room has
// already applied Init's effects and armed the first timer.
func startTimedGame(t *testing.T, g *timedGame) (*Manager, *fakeClock, JoinResult, *capture) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	reg := game.NewRegistry()
	reg.Register("timed", g)
	m := NewManager(ctx, reg)
	clk := &fakeClock{}
	m.clock = clk

	host := newCapture()
	created, err := m.Create(context.Background(), "Ana", "en", host)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "timed", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}
	expectGameStarted(t, host, "timed")
	return m, clk, created, host
}

// act sends one player action and fails on an unexpected refusal.
func act(t *testing.T, m *Manager, j JoinResult) {
	t.Helper()
	if err := m.GameAction(context.Background(), j.RoomCode, j.Self.ID, "timed", []byte(`{}`)); err != nil {
		t.Fatalf("GameAction: %v", err)
	}
}

// ─── tests ──────────────────────────────────────────────────────────────────

func TestAGameAsksForATimerAndTheRoomArmsIt(t *testing.T) {
	_, clk, _, _ := startTimedGame(t, newTimedGame())

	if clk.armed() != 1 {
		t.Fatalf("armed %d timers after Init, want 1", clk.armed())
	}
	if d := clk.nth(t, 0).d; d != 30*time.Second {
		t.Errorf("armed for %v, want 30s", d)
	}
}

func TestAnExpiredTimerReachesTheGameAsAnEvent(t *testing.T) {
	g := newTimedGame()
	_, clk, _, host := startTimedGame(t, g)

	clk.nth(t, 0).fire()

	ev := g.nextEvent(t)
	if !ev.IsTimer() {
		t.Fatalf("the game was handed a player event %+v, want a timer", ev)
	}
	if ev.Timer.Tag != "clue-turn" {
		t.Errorf("tag = %q, want clue-turn", ev.Timer.Tag)
	}
	if ev.PlayerID != "" {
		t.Errorf("PlayerID = %q on a timer event, want empty", ev.PlayerID)
	}
	host.expectSilent(t)
}

func TestTheExpiryRearmsAndTheNewTimerAlsoFires(t *testing.T) {
	g := newTimedGame()
	_, clk, _, _ := startTimedGame(t, g)

	clk.nth(t, 0).fire()
	_ = g.nextEvent(t) // the room has now processed the expiry and re-armed

	if clk.armed() != 2 {
		t.Fatalf("armed %d timers, want 2 — the expiry should have re-armed", clk.armed())
	}
	clk.nth(t, 1).fire()
	if ev := g.nextEvent(t); !ev.IsTimer() {
		t.Fatalf("second event is %+v, want a timer", ev)
	}
}

func TestAStaleExpiryIsDropped(t *testing.T) {
	g := newTimedGame()
	m, clk, created, host := startTimedGame(t, g)

	// A player acts, which re-arms: the first timer is now the previous
	// generation. Stop() cannot be trusted to have won that race, so the test
	// fires the old timer anyway — which is exactly what a real timer does
	// when it expires a moment before the action lands.
	act(t, m, created)
	ev := g.nextEvent(t)
	if ev.IsTimer() {
		t.Fatal("expected the player action, got a timer")
	}

	clk.nth(t, 0).fire()

	// Drive another real action. Commands are handled one at a time on one
	// goroutine, so once the game has been handed this one, any effect of the
	// stale expiry would already have happened.
	act(t, m, created)
	if ev := g.nextEvent(t); ev.IsTimer() {
		t.Fatal("a stale expiry got through to the game")
	}
	g.expectNoTimerEvent(t)
	host.expectSilent(t)
}

func TestATimerDiesWhenTheGameStopsAskingForOne(t *testing.T) {
	g := newTimedGame()
	// A phase change: the game sends something and asks for no clock.
	g.effectsFor = func(game.Event) ([]game.Effect, error) {
		return []game.Effect{gameMsg("vote-phase")}, nil
	}
	m, clk, created, host := startTimedGame(t, g)

	act(t, m, created)
	_ = g.nextEvent(t)
	if _, text := gameEventPayload(t, host); text != "vote-phase" {
		t.Fatalf("got %q, want vote-phase", text)
	}
	if clk.armed() != 1 {
		t.Errorf("armed %d timers, want 1 — a phase change with no Timer must not arm one", clk.armed())
	}

	// The clue clock must not fire into the phase that replaced it.
	clk.nth(t, 0).fire()
	act(t, m, created)
	_ = g.nextEvent(t)
	g.expectNoTimerEvent(t)
}

func TestARefusedActionDoesNotBuyTime(t *testing.T) {
	g := newTimedGame()
	g.effectsFor = func(ev game.Event) ([]game.Effect, error) {
		if ev.IsTimer() {
			return []game.Effect{gameMsg("timed-out")}, nil
		}
		// Every player action is refused, as a clue breaking the rules is.
		return nil, errors.New("not allowed")
	}
	m, clk, created, host := startTimedGame(t, g)

	err := m.GameAction(context.Background(), created.RoomCode, created.Self.ID, "timed", []byte(`{}`))
	if err == nil {
		t.Fatal("the fake game was supposed to refuse the action")
	}
	_ = g.nextEvent(t)
	if clk.armed() != 1 {
		t.Errorf("armed %d timers, want 1 — a refused action must not re-arm", clk.armed())
	}

	// The original clock is still live, so the player gained nothing.
	clk.nth(t, 0).fire()
	if ev := g.nextEvent(t); !ev.IsTimer() {
		t.Fatalf("event is %+v, want the timer — the clock stopped on a refused action", ev)
	}
	if _, text := gameEventPayload(t, host); text != "timed-out" {
		t.Fatalf("got %q, want timed-out", text)
	}
}

func TestAZeroTimerArmsNothing(t *testing.T) {
	g := newTimedGame()
	g.effectsFor = func(game.Event) ([]game.Effect, error) {
		// How a game turns its clock off: the effect is still returned, with
		// no duration on it.
		return []game.Effect{game.Timer{}}, nil
	}
	m, clk, created, _ := startTimedGame(t, g)

	act(t, m, created)
	_ = g.nextEvent(t)
	if clk.armed() != 1 {
		t.Errorf("armed %d timers, want 1 — a zero Timer should arm nothing", clk.armed())
	}
}

func TestAnExpiryAfterTheRoomIsGoneDoesNotBlock(t *testing.T) {
	g := newTimedGame()
	m, clk, created, _ := startTimedGame(t, g)

	// Last player out: the room tears down and its goroutine returns.
	if err := m.Leave(context.Background(), created.RoomCode, created.Self.ID, LeaveExplicit); err != nil {
		t.Fatalf("Leave: %v", err)
	}

	// A timer's goroutine would park forever on an unbuffered send if it did
	// not also select on the room's closed channel. fire() performs that same
	// send, so without the second case this test hangs rather than failing —
	// which is precisely the leak worth catching.
	done := make(chan struct{})
	go func() {
		clk.nth(t, 0).fire()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("an expiry after room teardown blocked instead of giving up")
	}
}

func TestAGameRefusingItsOwnTimerIsSurvivable(t *testing.T) {
	g := newTimedGame()
	g.effectsFor = func(ev game.Event) ([]game.Effect, error) {
		if ev.IsTimer() {
			return nil, errors.New("bug in the game")
		}
		return []game.Effect{gameMsg("still here")}, nil
	}
	m, clk, created, host := startTimedGame(t, g)

	clk.nth(t, 0).fire()
	_ = g.nextEvent(t)

	// Nobody to report it to, so the round carries on and still takes actions.
	act(t, m, created)
	_ = g.nextEvent(t)
	if _, text := gameEventPayload(t, host); text != "still here" {
		t.Fatalf("got %q, want still here", text)
	}
}

func TestKeepTimerLeavesTheClockRunning(t *testing.T) {
	g := newTimedGame()
	// A phase-wide deadline: the game says something on each event but does
	// not want the clock restarted — a vote, in Imposter's case.
	g.effectsFor = func(ev game.Event) ([]game.Effect, error) {
		if ev.IsTimer() {
			return []game.Effect{gameMsg("deadline")}, nil
		}
		return []game.Effect{gameMsg("progress"), game.KeepTimer{}}, nil
	}
	m, clk, created, host := startTimedGame(t, g)

	// Three events arrive before the deadline. None of them may re-arm, and
	// none of them may cancel.
	for i := 0; i < 3; i++ {
		act(t, m, created)
		_ = g.nextEvent(t)
		if _, text := gameEventPayload(t, host); text != "progress" {
			t.Fatalf("got %q, want progress", text)
		}
	}
	if clk.armed() != 1 {
		t.Fatalf("armed %d timers, want 1 — KeepTimer must not re-arm", clk.armed())
	}

	// The original clock is still the one that fires.
	clk.nth(t, 0).fire()
	if ev := g.nextEvent(t); !ev.IsTimer() {
		t.Fatalf("event is %+v, want the deadline", ev)
	}
	if _, text := gameEventPayload(t, host); text != "deadline" {
		t.Fatalf("got %q, want deadline", text)
	}
}

func TestKeepTimerOnAnEventWithNoClockIsHarmless(t *testing.T) {
	g := newTimedGame()
	g.effectsFor = func(game.Event) ([]game.Effect, error) {
		return []game.Effect{game.KeepTimer{}}, nil
	}
	m, clk, created, host := startTimedGame(t, g)

	// Cancel the Init clock by firing it, then ask to keep a clock that is no
	// longer there.
	clk.nth(t, 0).fire()
	_ = g.nextEvent(t)

	act(t, m, created)
	_ = g.nextEvent(t)
	if clk.armed() != 1 {
		t.Errorf("armed %d timers, want 1 — KeepTimer must not arm one of its own", clk.armed())
	}
	host.expectSilent(t)
}
