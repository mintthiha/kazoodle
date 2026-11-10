package room

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
)

// A main screen is on the roster and hosts, but it is never a player.

// screenRoom opens a room from a main screen and seats n phones in it. The join
// chatter is drained, so each capture starts empty.
func screenRoom(t *testing.T, g game.Game, n int) (*Manager, JoinResult, *capture, []JoinResult, []*capture) {
	t.Helper()
	games := game.NewRegistry()
	if g != nil {
		games.Register("g", g)
	}
	m := newTestManagerWithGames(t, games)
	ctx := context.Background()

	tv := newCapture()
	screen, err := m.CreateScreen(ctx, "en", tv)
	if err != nil {
		t.Fatalf("CreateScreen: %v", err)
	}
	var phones []JoinResult
	var senders []*capture
	for i := 0; i < n; i++ {
		s := newCapture()
		res, err := m.Join(ctx, screen.RoomCode, "", "en", s)
		if err != nil {
			t.Fatalf("Join: %v", err)
		}
		phones = append(phones, res)
		senders = append(senders, s)
	}
	for i := 0; i < n; i++ {
		tv.next(t) // PlayerJoined for each phone
	}
	for i, s := range senders {
		for j := i + 1; j < n; j++ {
			s.next(t)
		}
	}
	return m, screen, tv, phones, senders
}

func TestAScreenHostsTheRoomItCreates(t *testing.T) {
	_, screen, _, phones, _ := screenRoom(t, nil, 1)

	if !screen.Self.Screen {
		t.Error("the creator was not marked as a screen")
	}
	if screen.HostID != screen.Self.ID {
		t.Errorf("host = %q, want the screen %q", screen.HostID, screen.Self.ID)
	}
	// A screen has no name of its own: each phone shows it as "Main screen" in
	// its own language. A nameless phone still gets a guest name.
	if screen.Self.DisplayName != "" {
		t.Errorf("screen name = %q, want empty", screen.Self.DisplayName)
	}
	if got := phones[0].Self.DisplayName; !strings.HasPrefix(got, "Guest-") {
		t.Errorf("first phone = %q, want a guest name", got)
	}
	// The phone's roster carries the flag, so a lobby can leave the screen out
	// of the player count.
	if !phones[0].Players[0].Screen || phones[0].Players[1].Screen {
		t.Errorf("roster screen flags = %v / %v, want true / false",
			phones[0].Players[0].Screen, phones[0].Players[1].Screen)
	}
}

func TestAScreenIsNotDealtIntoAGameButSeesItsBroadcasts(t *testing.T) {
	f := &fakeGame{initEffects: []game.Effect{gameMsg("for everyone")}}
	m, screen, tv, phones, senders := screenRoom(t, f, 3)

	if err := m.StartGame(context.Background(), screen.RoomCode, screen.Self.ID, "g", nil); err != nil {
		t.Fatalf("StartGame from the screen: %v", err)
	}

	if len(f.lastInitPlayers) != len(phones) {
		t.Fatalf("game was dealt %d players, want the %d phones", len(f.lastInitPlayers), len(phones))
	}
	for _, p := range f.lastInitPlayers {
		if p.ID == screen.Self.ID {
			t.Error("the screen was dealt in as a player")
		}
	}

	// The screen hears the broadcast like everyone else.
	expectGameStarted(t, tv, "g")
	if _, text := gameEventPayload(t, tv); text != "for everyone" {
		t.Errorf("screen got %q", text)
	}
	expectGameStarted(t, senders[0], "g")
	gameEventPayload(t, senders[0])
}

func TestEventsCarryWhetherTheHostSentThem(t *testing.T) {
	got := make(chan bool, 2)
	f := &fakeGame{advance: func(s game.State, ev game.Event) (game.State, []game.Effect, error) {
		got <- ev.FromHost
		return s, nil, nil
	}}
	m, screen, _, phones, _ := screenRoom(t, f, 3)
	ctx := context.Background()
	code := screen.RoomCode
	if err := m.StartGame(ctx, code, screen.Self.ID, "g", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}

	tests := []struct {
		name     string
		playerID string
		want     bool
	}{
		{name: "the host screen", playerID: screen.Self.ID, want: true},
		{name: "a phone", playerID: phones[0].Self.ID, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := m.GameAction(ctx, code, tt.playerID, "g", []byte(`{}`)); err != nil {
				t.Fatalf("GameAction: %v", err)
			}
			if fromHost := <-got; fromHost != tt.want {
				t.Errorf("FromHost = %v, want %v", fromHost, tt.want)
			}
		})
	}
}

func TestAReloadedScreenTakesTheHostRoleBack(t *testing.T) {
	m, screen, tv, phones, senders := screenRoom(t, nil, 2)
	ctx := context.Background()
	code := screen.RoomCode

	if err := m.Disconnect(ctx, code, screen.Self.ID, tv); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	wantPresence(t, senders[0], screen.Self.ID, false)
	if got := senders[0].next(t).GetHostChanged().GetHostId(); got != phones[0].Self.ID {
		t.Fatalf("host while the screen is away = %q, want the first phone", got)
	}

	fresh := newCapture()
	if _, err := m.Resume(ctx, code, screen.SessionToken, fresh); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	if got := fresh.next(t).GetRoomJoined().GetHostId(); got != screen.Self.ID {
		t.Errorf("host after the screen is back = %q, want the screen", got)
	}
	if got := senders[0].next(t).GetHostChanged().GetHostId(); got != screen.Self.ID {
		t.Errorf("phones were told host = %q, want the screen", got)
	}
}

// ─── kick ───────────────────────────────────────────────────────────────────

func TestKick(t *testing.T) {
	tests := []struct {
		name    string
		by      int // index into the phones; -1 for the host screen
		target  int // index into the phones; -1 for the host screen; 99 for nobody
		wantErr error
	}{
		{name: "host removes a phone", by: -1, target: 1},
		{name: "a phone that is not host", by: 0, target: 1, wantErr: ErrNotHost},
		{name: "host removes themselves", by: -1, target: -1, wantErr: ErrKickSelf},
		{name: "nobody by that id", by: -1, target: 99, wantErr: ErrPlayerNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, screen, tv, phones, senders := screenRoom(t, nil, 2)
			idOf := func(i int) string {
				switch i {
				case -1:
					return screen.Self.ID
				case 99:
					return "no-such-player"
				default:
					return phones[i].Self.ID
				}
			}

			err := m.Kick(context.Background(), screen.RoomCode, idOf(tt.by), idOf(tt.target))
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Kick err = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr != nil {
				tv.expectSilent(t)
				return
			}

			// The removed phone is told why, then everyone else sees them leave.
			if got := senders[tt.target].next(t).GetError().GetCode(); got != "kicked" {
				t.Errorf("removed phone got %q, want kicked", got)
			}
			if got := tv.next(t).GetPlayerLeft().GetPlayerId(); got != idOf(tt.target) {
				t.Errorf("screen saw %q leave, want %q", got, idOf(tt.target))
			}
			if got := senders[0].next(t).GetPlayerLeft().GetPlayerId(); got != idOf(tt.target) {
				t.Errorf("other phone saw %q leave", got)
			}
		})
	}
}

func TestKickedPlayerLeavesTheRunningGame(t *testing.T) {
	left := make(chan string, 1)
	g := &leaverGame{left: left}
	m, screen, _, phones, _ := screenRoom(t, g, 3)
	ctx := context.Background()
	if err := m.StartGame(ctx, screen.RoomCode, screen.Self.ID, "g", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}
	if err := m.Kick(ctx, screen.RoomCode, screen.Self.ID, phones[2].Self.ID); err != nil {
		t.Fatalf("Kick: %v", err)
	}
	if got := <-left; got != phones[2].Self.ID {
		t.Errorf("game was told %q left, want %q", got, phones[2].Self.ID)
	}
}

// leaverGame reports every departure on a channel.
type leaverGame struct{ left chan string }

func (g *leaverGame) Init([]game.Player, []byte) (game.State, []game.Effect, error) {
	return "s", nil, nil
}

func (g *leaverGame) Advance(s game.State, _ game.Event) (game.State, []game.Effect, error) {
	return s, nil, nil
}

func (g *leaverGame) Leave(s game.State, id string) (game.State, []game.Effect, error) {
	g.left <- id
	return s, nil, nil
}
