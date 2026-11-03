package room

import (
	"context"
	"errors"
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
)

// seatedRoom builds a room of n players with a clock the test controls, each with
// their own capture Sender, and discards the join chatter.
func seatedRoom(t *testing.T, g game.Game, n int) (*Manager, *fakeClock, []JoinResult, []*capture) {
	t.Helper()
	games := game.NewRegistry()
	if g != nil {
		games.Register("g", g)
	}
	m := newTestManagerWithGames(t, games)
	clk := &fakeClock{}
	m.clock = clk

	ctx := context.Background()
	results := make([]JoinResult, 0, n)
	senders := make([]*capture, 0, n)
	for i := 0; i < n; i++ {
		s := newCapture()
		var res JoinResult
		var err error
		if i == 0 {
			res, err = m.Create(ctx, "p0", "en", s)
		} else {
			res, err = m.Join(ctx, results[0].RoomCode, "p", "en", s)
		}
		if err != nil {
			t.Fatalf("seating player %d: %v", i, err)
		}
		results = append(results, res)
		senders = append(senders, s)
	}
	// Each player has been told about everyone who joined after them.
	for i, s := range senders {
		for j := i + 1; j < n; j++ {
			s.next(t)
		}
	}
	return m, clk, results, senders
}

func wantPresence(t *testing.T, s *capture, playerID string, connected bool) {
	t.Helper()
	got := s.next(t).GetPlayerPresence()
	if got == nil || got.GetPlayerId() != playerID || got.GetConnected() != connected {
		t.Fatalf("got presence %v, want %s connected=%v", got, playerID, connected)
	}
}

func TestDisconnectHoldsTheSeat(t *testing.T) {
	m, _, res, s := seatedRoom(t, nil, 3)
	ctx := context.Background()
	code := res[0].RoomCode

	if err := m.Disconnect(ctx, code, res[2].Self.ID, s[2]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}

	// They are reported as offline, not as gone.
	wantPresence(t, s[0], res[2].Self.ID, false)
	wantPresence(t, s[1], res[2].Self.ID, false)
	s[2].expectSilent(t)

	// And the roster a newcomer receives still has them.
	joined, err := m.Join(ctx, code, "late", "en", newCapture())
	if err != nil {
		t.Fatalf("Join: %v", err)
	}
	if len(joined.Players) != 4 {
		t.Errorf("roster has %d players, want 4 including the offline one", len(joined.Players))
	}
	if len(joined.Offline) != 1 || joined.Offline[0] != res[2].Self.ID {
		t.Errorf("Offline = %v, want [%s]", joined.Offline, res[2].Self.ID)
	}
}

func TestGraceExpiryIsARealDeparture(t *testing.T) {
	m, clk, res, s := seatedRoom(t, nil, 3)
	ctx := context.Background()

	if err := m.Disconnect(ctx, res[0].RoomCode, res[2].Self.ID, s[2]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	wantPresence(t, s[0], res[2].Self.ID, false)

	if got := clk.nth(t, 0).d; got != lobbyGrace {
		t.Errorf("a lobby seat is held for %v, want %v", got, lobbyGrace)
	}
	clk.nth(t, 0).fire()

	if got := s[0].next(t).GetPlayerLeft(); got == nil || got.GetPlayerId() != res[2].Self.ID {
		t.Fatalf("got %v, want PlayerLeft for %s", got, res[2].Self.ID)
	}

	// The seat is gone, so the token no longer buys anything.
	if _, err := m.Resume(ctx, res[0].RoomCode, res[2].SessionToken, newCapture()); !errors.Is(err, ErrSessionExpired) {
		t.Errorf("Resume after expiry = %v, want ErrSessionExpired", err)
	}
}

func TestLastHeldSeatExpiringClosesTheRoom(t *testing.T) {
	m, clk, res, s := seatedRoom(t, nil, 1)
	ctx := context.Background()

	if err := m.Disconnect(ctx, res[0].RoomCode, res[0].Self.ID, s[0]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	if got := m.RoomCount(); got != 1 {
		t.Fatalf("RoomCount = %d while the seat is held, want 1", got)
	}

	clk.nth(t, 0).fire()

	// fire returns once run has taken the expiry, and a command sent after that can
	// only be answered by the room closing. So this is synchronised, not a guess.
	if _, err := m.Resume(ctx, res[0].RoomCode, "nope", newCapture()); !errors.Is(err, ErrRoomNotFound) {
		t.Fatalf("Resume = %v, want ErrRoomNotFound from a closed room", err)
	}
	if got := m.RoomCount(); got != 0 {
		t.Errorf("RoomCount = %d, want 0", got)
	}
}

func TestResumeRestoresTheSameSeat(t *testing.T) {
	m, clk, res, s := seatedRoom(t, nil, 3)
	ctx := context.Background()
	code, self := res[0].RoomCode, res[2].Self

	if err := m.Disconnect(ctx, code, self.ID, s[2]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	wantPresence(t, s[0], self.ID, false)
	wantPresence(t, s[1], self.ID, false)

	fresh := newCapture()
	id, err := m.Resume(ctx, code, res[2].SessionToken, fresh)
	if err != nil {
		t.Fatalf("Resume: %v", err)
	}
	if id != self.ID {
		t.Errorf("Resume gave id %q, want the same %q", id, self.ID)
	}

	joined := fresh.next(t).GetRoomJoined()
	if joined == nil || !joined.GetResumed() || joined.GetSelfPlayerId() != self.ID {
		t.Fatalf("got %v, want a resumed RoomJoined for %s", joined, self.ID)
	}
	if joined.GetSessionToken() != res[2].SessionToken {
		t.Error("the resumed RoomJoined did not carry the session token")
	}
	if len(joined.GetOfflinePlayerIds()) != 0 {
		t.Errorf("offline = %v, want nobody", joined.GetOfflinePlayerIds())
	}

	wantPresence(t, s[0], self.ID, true)
	wantPresence(t, s[1], self.ID, true)

	// The clock is void, even if it had already fired and its command was queued.
	clk.nth(t, 0).fire()
	if err := m.Echo(ctx, code, self.ID, "still here"); err != nil {
		t.Fatalf("Echo: %v", err)
	}
	if got := s[0].next(t).GetEchoResult(); got == nil {
		t.Errorf("got %v, want the echo and no PlayerLeft before it", got)
	}
}

func TestResumeRefusesABadToken(t *testing.T) {
	m, _, res, _ := seatedRoom(t, nil, 2)
	ctx := context.Background()

	tests := []struct {
		name    string
		code    string
		token   string
		wantErr error
	}{
		{"an unknown token", res[0].RoomCode, "not-a-token", ErrSessionExpired},
		{"an empty token", res[0].RoomCode, "", ErrSessionExpired},
		{"a room that does not exist", "ZZZZ", res[1].SessionToken, ErrRoomNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := m.Resume(ctx, tt.code, tt.token, newCapture()); !errors.Is(err, tt.wantErr) {
				t.Errorf("Resume = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestLateDisconnectFromAReplacedConnectionIsIgnored(t *testing.T) {
	// The phone reconnects before the server has noticed its old socket died.
	m, clk, res, s := seatedRoom(t, nil, 2)
	ctx := context.Background()
	code, self := res[0].RoomCode, res[1].Self

	fresh := newCapture()
	if _, err := m.Resume(ctx, code, res[1].SessionToken, fresh); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	fresh.next(t) // RoomJoined

	if got := s[1].next(t).GetError(); got == nil || got.GetCode() != "session_replaced" {
		t.Errorf("the old connection got %v, want session_replaced", got)
	}
	s[0].expectSilent(t) // from everyone else's side, nothing happened

	// Now the old socket finally dies.
	if err := m.Disconnect(ctx, code, self.ID, s[1]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	if err := m.Echo(ctx, code, self.ID, "hello"); err != nil {
		t.Fatalf("Echo: %v", err)
	}
	if got := fresh.next(t).GetEchoResult(); got == nil {
		t.Errorf("the new connection got %v, want the echo", got)
	}
	if got := clk.armed(); got != 0 {
		t.Errorf("%d clocks armed, want none: the seat was never empty", got)
	}
}

func TestExplicitLeaveGivesUpTheSeatAtOnce(t *testing.T) {
	m, clk, res, s := seatedRoom(t, nil, 2)
	ctx := context.Background()

	if err := m.Leave(ctx, res[0].RoomCode, res[1].Self.ID, LeaveExplicit); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	if got := s[0].next(t).GetPlayerLeft(); got == nil {
		t.Fatalf("got %v, want PlayerLeft", got)
	}
	if got := clk.armed(); got != 0 {
		t.Errorf("%d clocks armed, want none for a deliberate leave", got)
	}
	if _, err := m.Resume(ctx, res[0].RoomCode, res[1].SessionToken, newCapture()); !errors.Is(err, ErrSessionExpired) {
		t.Errorf("Resume after leaving = %v, want ErrSessionExpired", err)
	}
}

func TestHostRoleMovesWhenTheHostDrops(t *testing.T) {
	m, _, res, s := seatedRoom(t, nil, 3)
	ctx := context.Background()
	code := res[0].RoomCode

	if err := m.Disconnect(ctx, code, res[0].Self.ID, s[0]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	wantPresence(t, s[1], res[0].Self.ID, false)
	if got := s[1].next(t).GetHostChanged(); got == nil || got.GetHostId() != res[1].Self.ID {
		t.Fatalf("got %v, want the host role to move to %s", got, res[1].Self.ID)
	}

	// Coming back keeps the seat but not the role.
	fresh := newCapture()
	if _, err := m.Resume(ctx, code, res[0].SessionToken, fresh); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	if got := fresh.next(t).GetRoomJoined(); got.GetHostId() != res[1].Self.ID {
		t.Errorf("host after resume = %q, want %q", got.GetHostId(), res[1].Self.ID)
	}
}

func TestFirstPlayerBackBecomesHostWhenEveryoneDropped(t *testing.T) {
	m, _, res, s := seatedRoom(t, nil, 2)
	ctx := context.Background()
	code := res[0].RoomCode

	for i := range res {
		if err := m.Disconnect(ctx, code, res[i].Self.ID, s[i]); err != nil {
			t.Fatalf("Disconnect: %v", err)
		}
	}

	fresh := newCapture()
	if _, err := m.Resume(ctx, code, res[1].SessionToken, fresh); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	if got := fresh.next(t).GetRoomJoined().GetHostId(); got != res[1].Self.ID {
		t.Errorf("host = %q, want the only connected player %q", got, res[1].Self.ID)
	}
}

// ─── resuming into a running game ───────────────────────────────────────────

// eventGame sends one numbered event to everyone per action, and a private one at
// the start, so a test can tell exactly what a player was sent.
type eventGame struct{ players chan []game.Player }

func (g *eventGame) Init(players []game.Player, _ []byte) (game.State, []game.Effect, error) {
	if g.players != nil {
		g.players <- players
	}
	private := gameMsg("private")
	private.To = []string{players[0].ID}
	return 0, []game.Effect{private}, nil
}

func (g *eventGame) Advance(s game.State, _ game.Event) (game.State, []game.Effect, error) {
	return s, []game.Effect{gameMsg("broadcast")}, nil
}

func TestResumeReplaysTheGameIncludingWhatWasMissed(t *testing.T) {
	m, clk, res, s := seatedRoom(t, &eventGame{}, 2)
	ctx := context.Background()
	code, first, second := res[0].RoomCode, res[0].Self.ID, res[1].Self.ID

	if err := m.StartGame(ctx, code, first, "g", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}
	s[0].next(t) // GameStarted
	s[0].next(t) // the private event
	s[1].next(t) // GameStarted

	// One event while they are here, one while they are gone.
	if err := m.GameAction(ctx, code, second, "g", nil); err != nil {
		t.Fatalf("GameAction: %v", err)
	}
	s[0].next(t)
	s[1].next(t)

	if err := m.Disconnect(ctx, code, first, s[0]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	s[1].next(t) // presence
	s[1].next(t) // host change

	if got := clk.nth(t, 0).d; got != gameGrace {
		t.Errorf("a seat in a game is held for %v, want %v", got, gameGrace)
	}

	if err := m.GameAction(ctx, code, second, "g", nil); err != nil {
		t.Fatalf("GameAction: %v", err)
	}
	s[1].next(t)
	s[0].expectSilent(t)

	fresh := newCapture()
	if _, err := m.Resume(ctx, code, res[0].SessionToken, fresh); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	joined := fresh.next(t).GetRoomJoined()
	if joined.GetActiveGameId() != "g" {
		t.Errorf("ActiveGameId = %q, want g", joined.GetActiveGameId())
	}
	if got := len(joined.GetGameEvents()); got != 3 {
		t.Errorf("replayed %d events, want 3: private, one before the drop, one after", got)
	}

	// New events go to the new connection.
	if err := m.GameAction(ctx, code, second, "g", nil); err != nil {
		t.Fatalf("GameAction: %v", err)
	}
	if got := fresh.next(t).GetGameEvent(); got == nil {
		t.Errorf("got %v, want the next game event on the new connection", got)
	}
}

func TestPrivateEventsAreNotReplayedToOtherPlayers(t *testing.T) {
	m, _, res, s := seatedRoom(t, &eventGame{}, 2)
	ctx := context.Background()
	code, first, second := res[0].RoomCode, res[0].Self.ID, res[1].Self.ID

	if err := m.StartGame(ctx, code, first, "g", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}
	s[1].next(t) // GameStarted
	if err := m.Disconnect(ctx, code, second, s[1]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}

	fresh := newCapture()
	if _, err := m.Resume(ctx, code, res[1].SessionToken, fresh); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	if got := fresh.next(t).GetRoomJoined().GetGameEvents(); len(got) != 0 {
		t.Errorf("replayed %v to a player the private event was never for", got)
	}
}

func TestOfflinePlayerIsNotDealtIntoANewGame(t *testing.T) {
	g := &eventGame{players: make(chan []game.Player, 1)}
	m, _, res, s := seatedRoom(t, g, 3)
	ctx := context.Background()
	code, host, gone := res[0].RoomCode, res[0].Self.ID, res[2].Self.ID

	if err := m.Disconnect(ctx, code, gone, s[2]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	if err := m.StartGame(ctx, code, host, "g", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}
	dealt := <-g.players
	if len(dealt) != 2 {
		t.Fatalf("dealt %v, want only the two connected players", dealt)
	}

	// They come back to the lobby, with no game to rejoin.
	fresh := newCapture()
	if _, err := m.Resume(ctx, code, res[2].SessionToken, fresh); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	joined := fresh.next(t).GetRoomJoined()
	if joined.GetActiveGameId() != "" || len(joined.GetGameEvents()) != 0 {
		t.Errorf("got game %q with %d events, want neither", joined.GetActiveGameId(), len(joined.GetGameEvents()))
	}
}

func TestAGameThatEndedWhileAwayIsNotResumed(t *testing.T) {
	m, _, res, s := seatedRoom(t, &endingGame{}, 2)
	ctx := context.Background()
	code, first, second := res[0].RoomCode, res[0].Self.ID, res[1].Self.ID

	if err := m.StartGame(ctx, code, first, "g", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}
	if err := m.Disconnect(ctx, code, second, s[1]); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	if err := m.GameAction(ctx, code, first, "g", nil); err != nil {
		t.Fatalf("GameAction: %v", err)
	}

	fresh := newCapture()
	if _, err := m.Resume(ctx, code, res[1].SessionToken, fresh); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	joined := fresh.next(t).GetRoomJoined()
	if joined.GetActiveGameId() != "" || len(joined.GetGameEvents()) != 0 {
		t.Errorf("got game %q with %d events, want neither", joined.GetActiveGameId(), len(joined.GetGameEvents()))
	}
}

// endingGame ends on the first action.
type endingGame struct{}

func (endingGame) Init([]game.Player, []byte) (game.State, []game.Effect, error) {
	return 0, nil, nil
}

func (endingGame) Advance(s game.State, _ game.Event) (game.State, []game.Effect, error) {
	return s, []game.Effect{game.EndGame{Reason: "finished"}}, nil
}
