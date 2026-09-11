package room

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/protocol"
)

// ─── test doubles ───────────────────────────────────────────────────────────

// capture is a test Sender that records every message sent to one player. Real
// senders never block, so this one does not either: the channel is generously
// buffered and an overflow means the test expected fewer messages than the room
// produced.
type capture struct {
	ch chan *protocol.ServerMessage
}

func newCapture() *capture {
	return &capture{ch: make(chan *protocol.ServerMessage, 128)}
}

func (c *capture) Send(m *protocol.ServerMessage) {
	select {
	case c.ch <- m:
	default:
		panic("capture overflow: room produced more messages than the test drained")
	}
}

// next returns the next message sent to this player, failing the test if none
// arrives promptly. The timeout is only a stuck-test guard: every value we wait
// for is produced by a channel handoff, so in a correct run it is already here.
// This is not time.Sleep-style synchronisation.
func (c *capture) next(t *testing.T) *protocol.ServerMessage {
	t.Helper()
	select {
	case m := <-c.ch:
		return m
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for a server message")
		return nil
	}
}

// expectSilent asserts nothing has been sent to this player.
func (c *capture) expectSilent(t *testing.T) {
	t.Helper()
	select {
	case m := <-c.ch:
		t.Fatalf("expected no message, got %T", m.GetPayload())
	default:
	}
}

// discard is a Sender that counts messages and keeps none. Used where a test
// creates churn it does not need to inspect.
type discard struct{ n atomic.Int64 }

func (d *discard) Send(*protocol.ServerMessage) { d.n.Add(1) }

func newTestManager(t *testing.T) *Manager {
	t.Helper()
	return newTestManagerWithGames(t, game.NewRegistry())
}

func newTestManagerWithGames(t *testing.T, games *game.Registry) *Manager {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel) // bring down any room goroutines still running
	return NewManager(ctx, games)
}

// ─── tests ──────────────────────────────────────────────────────────────────

func TestCreateAddsCreatorAndRoom(t *testing.T) {
	m := newTestManager(t)
	host := newCapture()

	res, err := m.Create(context.Background(), "Ana", "en", host)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if res.RoomCode == "" {
		t.Error("expected a non-empty room code")
	}
	if len(res.Players) != 1 || res.Players[0].DisplayName != "Ana" {
		t.Errorf("roster = %+v, want just Ana", res.Players)
	}
	if res.Self.ID == "" || res.Players[0].ID != res.Self.ID {
		t.Errorf("Self %+v not consistent with roster %+v", res.Self, res.Players)
	}
	if got := m.RoomCount(); got != 1 {
		t.Errorf("RoomCount = %d, want 1", got)
	}
	// The creator learns the roster from the return value, not from a message.
	host.expectSilent(t)
}

func TestJoinNotifiesExistingPlayers(t *testing.T) {
	m := newTestManager(t)
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)

	guest := newCapture()
	joined, err := m.Join(context.Background(), created.RoomCode, "Ben", "en", guest)
	if err != nil {
		t.Fatalf("Join: %v", err)
	}
	if len(joined.Players) != 2 {
		t.Fatalf("newcomer roster has %d players, want 2", len(joined.Players))
	}
	if joined.Players[0].DisplayName != "Ana" || joined.Players[1].DisplayName != "Ben" {
		t.Errorf("roster order = %+v, want [Ana Ben]", joined.Players)
	}

	got := host.next(t).GetPlayerJoined()
	if got == nil || got.GetPlayer().GetDisplayName() != "Ben" {
		t.Errorf("host received %v, want PlayerJoined{Ben}", host.ch)
	}
	// The newcomer is not told about their own join.
	guest.expectSilent(t)
}

func TestJoinUnknownRoom(t *testing.T) {
	m := newTestManager(t)

	_, err := m.Join(context.Background(), "ZZZZ", "Ana", "en", newCapture())
	if !errors.Is(err, ErrRoomNotFound) {
		t.Fatalf("err = %v, want ErrRoomNotFound", err)
	}
	if m.RoomCount() != 0 {
		t.Errorf("RoomCount = %d, want 0", m.RoomCount())
	}
}

func TestLeaveNotifiesRemaining(t *testing.T) {
	m := newTestManager(t)
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	guest := newCapture()
	joined, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", guest)
	_ = host.next(t) // consume the PlayerJoined from Ben joining

	if err := m.Leave(context.Background(), created.RoomCode, joined.Self.ID, LeaveExplicit); err != nil {
		t.Fatalf("Leave: %v", err)
	}

	got := host.next(t).GetPlayerLeft()
	if got == nil || got.GetPlayerId() != joined.Self.ID {
		t.Errorf("host received %v, want PlayerLeft{%s}", host.ch, joined.Self.ID)
	}
	if m.RoomCount() != 1 {
		t.Errorf("RoomCount = %d, want 1 (host is still in the room)", m.RoomCount())
	}
}

func TestDisconnectRemovesPlayer(t *testing.T) {
	m := newTestManager(t)
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	guest := newCapture()
	joined, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", guest)
	_ = host.next(t)

	// A dropped connection is a Leave with a different reason; behaviour is the
	// same as an explicit leave.
	if err := m.Leave(context.Background(), created.RoomCode, joined.Self.ID, LeaveDisconnect); err != nil {
		t.Fatalf("Leave(disconnect): %v", err)
	}
	if got := host.next(t).GetPlayerLeft(); got == nil || got.GetPlayerId() != joined.Self.ID {
		t.Errorf("want PlayerLeft{%s}", joined.Self.ID)
	}
	if m.RoomCount() != 1 {
		t.Errorf("RoomCount = %d, want 1", m.RoomCount())
	}
}

func TestLastPlayerLeavingClosesRoom(t *testing.T) {
	m := newTestManager(t)
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)

	if err := m.Leave(context.Background(), created.RoomCode, created.Self.ID, LeaveExplicit); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	// Leave returns only after the room goroutine has removed itself, so this
	// is deterministic with no wait.
	if m.RoomCount() != 0 {
		t.Errorf("RoomCount = %d, want 0 after the last player left", m.RoomCount())
	}
	// The code now behaves like any unknown room.
	if _, err := m.Join(context.Background(), created.RoomCode, "Ben", "en", newCapture()); !errors.Is(err, ErrRoomNotFound) {
		t.Errorf("re-join err = %v, want ErrRoomNotFound", err)
	}
}

func TestEchoReachesEveryone(t *testing.T) {
	m := newTestManager(t)
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	guest := newCapture()
	_, _ = m.Join(context.Background(), created.RoomCode, "Ben", "en", guest)
	_ = host.next(t) // PlayerJoined

	if err := m.Echo(context.Background(), created.RoomCode, created.Self.ID, "marco"); err != nil {
		t.Fatalf("Echo: %v", err)
	}

	for name, c := range map[string]*capture{"host": host, "guest": guest} {
		got := c.next(t).GetEchoResult()
		if got == nil || got.GetText() != "marco" || got.GetFromPlayerId() != created.Self.ID {
			t.Errorf("%s received %+v, want EchoResult{marco, %s}", name, got, created.Self.ID)
		}
	}
}

func TestDoubleLeaveIsHarmless(t *testing.T) {
	m := newTestManager(t)
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	guest := newCapture()
	joined, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", guest)
	_ = host.next(t) // PlayerJoined
	_ = m.Leave(context.Background(), created.RoomCode, joined.Self.ID, LeaveExplicit)
	_ = host.next(t) // PlayerLeft

	// The socket for the same player now closes: a second Leave arrives.
	if err := m.Leave(context.Background(), created.RoomCode, joined.Self.ID, LeaveDisconnect); err != nil {
		t.Fatalf("second Leave: %v", err)
	}
	host.expectSilent(t) // no duplicate PlayerLeft
	if m.RoomCount() != 1 {
		t.Errorf("RoomCount = %d, want 1", m.RoomCount())
	}
}

// TestConcurrentJoinsAndLeaves hammers one room from many goroutines. It exists
// mainly to be run under `go test -race`: the room goroutine serialises all of
// this, and the manager lock only guards the room map.
func TestConcurrentJoinsAndLeaves(t *testing.T) {
	m := newTestManager(t)
	host := &discard{}
	created, err := m.Create(context.Background(), "host", "en", host)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	const n = 30
	ids := make(chan string, n)

	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := m.Join(context.Background(), created.RoomCode, "p", "en", &discard{})
			if err != nil {
				t.Errorf("Join: %v", err)
				return
			}
			ids <- res.Self.ID
		}()
	}
	wg.Wait()
	close(ids)

	for id := range ids {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			if err := m.Leave(context.Background(), created.RoomCode, id, LeaveDisconnect); err != nil {
				t.Errorf("Leave: %v", err)
			}
		}(id)
	}
	wg.Wait()

	if got := m.RoomCount(); got != 1 {
		t.Fatalf("RoomCount = %d, want 1 (only the host remains)", got)
	}
	if err := m.Leave(context.Background(), created.RoomCode, created.Self.ID, LeaveExplicit); err != nil {
		t.Fatalf("host Leave: %v", err)
	}
	if got := m.RoomCount(); got != 0 {
		t.Errorf("RoomCount = %d, want 0", got)
	}
}
