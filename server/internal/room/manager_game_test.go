package room

import (
	"context"
	"errors"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/protocol"
)

// fakeGame is a stand-in Game for testing the room<->game seam without pulling
// in a real game. It records its Init input and lets a test script Advance.
type fakeGame struct {
	initErr     error
	initEffects []game.Effect
	advance     func(state game.State, ev game.Event) (game.State, []game.Effect, error)

	lastInitPlayers []game.Player
}

func (f *fakeGame) Init(players []game.Player, options []byte) (game.State, []game.Effect, error) {
	f.lastInitPlayers = players
	if f.initErr != nil {
		return nil, nil, f.initErr
	}
	return "state-0", f.initEffects, nil
}

func (f *fakeGame) Advance(s game.State, ev game.Event) (game.State, []game.Effect, error) {
	if f.advance != nil {
		return f.advance(s, ev)
	}
	return s, nil, nil
}

// gameEventPayload reads a GameEvent off a capture and returns (game_id, the
// decoded stand-in message text). The fake game always sends EchoResult as its
// game message, so we can inspect it without a real game proto.
func gameEventPayload(t *testing.T, c *capture) (string, string) {
	t.Helper()
	ge := c.next(t).GetGameEvent()
	if ge == nil {
		t.Fatal("expected a GameEvent")
	}
	var er protocol.EchoResult
	if err := protojson.Unmarshal([]byte(ge.GetPayload()), &er); err != nil {
		t.Fatalf("GameEvent payload not decodable: %v", err)
	}
	return ge.GetGameId(), er.GetText()
}

func expectGameStarted(t *testing.T, c *capture, gameID string) {
	t.Helper()
	gs := c.next(t).GetGameStarted()
	if gs == nil || gs.GetGameId() != gameID {
		t.Fatalf("expected GameStarted{%s}, got %v", gameID, gs)
	}
}

// registryWith registers one fake game under "fake".
func registryWith(f *fakeGame) *game.Registry {
	r := game.NewRegistry()
	r.Register("fake", f)
	return r
}

func gameMsg(text string) game.Send {
	return game.Send{Msg: &protocol.EchoResult{Text: text}}
}

// ─── host ───────────────────────────────────────────────────────────────────

func TestHostIsCreatorAndReassignsOnLeave(t *testing.T) {
	m := newTestManager(t)
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	if created.HostID != created.Self.ID {
		t.Fatalf("creator %s is not host %s", created.Self.ID, created.HostID)
	}

	ben := newCapture()
	benRes, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	if benRes.HostID != created.Self.ID {
		t.Errorf("host changed on a plain join: %s", benRes.HostID)
	}
	_ = host.next(t) // PlayerJoined

	if err := m.Leave(context.Background(), created.RoomCode, created.Self.ID, LeaveExplicit); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	_ = ben.next(t) // PlayerLeft
	hc := ben.next(t).GetHostChanged()
	if hc == nil || hc.GetHostId() != benRes.Self.ID {
		t.Fatalf("expected HostChanged{%s}, got %v", benRes.Self.ID, hc)
	}

	// A later joiner sees the new host.
	carl := newCapture()
	carlRes, _ := m.Join(context.Background(), created.RoomCode, "Carl", "en", carl)
	if carlRes.HostID != benRes.Self.ID {
		t.Errorf("new joiner sees host %s, want %s", carlRes.HostID, benRes.Self.ID)
	}
}

// ─── start game ─────────────────────────────────────────────────────────────

func TestStartGameOnlyByHost(t *testing.T) {
	f := &fakeGame{}
	m := newTestManagerWithGames(t, registryWith(f))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	ben := newCapture()
	benRes, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t)

	if err := m.StartGame(context.Background(), created.RoomCode, benRes.Self.ID, "fake", nil); !errors.Is(err, ErrNotHost) {
		t.Fatalf("non-host StartGame err = %v, want ErrNotHost", err)
	}
}

func TestStartGameUnknownGame(t *testing.T) {
	m := newTestManagerWithGames(t, registryWith(&fakeGame{}))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)

	if err := m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "nope", nil); !errors.Is(err, ErrUnknownGame) {
		t.Fatalf("err = %v, want ErrUnknownGame", err)
	}
}

func TestStartGameInitsAndBroadcasts(t *testing.T) {
	f := &fakeGame{initEffects: []game.Effect{gameMsg("boot")}}
	m := newTestManagerWithGames(t, registryWith(f))

	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "fr", host)
	ben := newCapture()
	_, _ = m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t) // PlayerJoined

	if err := m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}

	// Init saw both players with their locales, in join order.
	if len(f.lastInitPlayers) != 2 ||
		f.lastInitPlayers[0].Locale != "fr" || f.lastInitPlayers[1].Locale != "en" {
		t.Fatalf("Init players = %+v", f.lastInitPlayers)
	}

	for _, c := range []*capture{host, ben} {
		expectGameStarted(t, c, "fake")
		id, text := gameEventPayload(t, c)
		if id != "fake" || text != "boot" {
			t.Errorf("game event = (%s, %q), want (fake, boot)", id, text)
		}
	}
}

func TestStartGamePrivateEffectTargetsOnePlayer(t *testing.T) {
	f := &fakeGame{}
	m := newTestManagerWithGames(t, registryWith(f))

	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	ben := newCapture()
	benRes, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t)

	// Configure a private effect now that we know Ben's id.
	f.initEffects = []game.Effect{
		game.Send{To: []string{benRes.Self.ID}, Msg: &protocol.EchoResult{Text: "psst"}},
	}

	if err := m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil); err != nil {
		t.Fatalf("StartGame: %v", err)
	}

	expectGameStarted(t, host, "fake")
	expectGameStarted(t, ben, "fake")

	id, text := gameEventPayload(t, ben)
	if id != "fake" || text != "psst" {
		t.Errorf("Ben got (%s, %q), want (fake, psst)", id, text)
	}
	host.expectSilent(t) // the host was not a recipient
}

func TestStartGameRejectsSecondStart(t *testing.T) {
	m := newTestManagerWithGames(t, registryWith(&fakeGame{}))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	_ = m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil)
	expectGameStarted(t, host, "fake")

	if err := m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil); !errors.Is(err, ErrGameInProgress) {
		t.Fatalf("err = %v, want ErrGameInProgress", err)
	}
}

// ─── set game options ───────────────────────────────────────────────────────

func TestSetGameOptionsOnlyByHost(t *testing.T) {
	m := newTestManagerWithGames(t, registryWith(&fakeGame{}))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	ben := newCapture()
	benRes, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t)

	err := m.SetGameOptions(context.Background(), created.RoomCode, benRes.Self.ID, "fake", []byte(`{"x":1}`))
	if !errors.Is(err, ErrNotHost) {
		t.Fatalf("non-host SetGameOptions err = %v, want ErrNotHost", err)
	}
}

func TestSetGameOptionsUnknownGame(t *testing.T) {
	m := newTestManagerWithGames(t, registryWith(&fakeGame{}))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)

	err := m.SetGameOptions(context.Background(), created.RoomCode, created.Self.ID, "nope", nil)
	if !errors.Is(err, ErrUnknownGame) {
		t.Fatalf("err = %v, want ErrUnknownGame", err)
	}
}

func TestSetGameOptionsBroadcastsToEveryoneIncludingHost(t *testing.T) {
	m := newTestManagerWithGames(t, registryWith(&fakeGame{}))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	ben := newCapture()
	_, _ = m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t) // PlayerJoined

	err := m.SetGameOptions(context.Background(), created.RoomCode, created.Self.ID, "fake", []byte(`{"category":"food"}`))
	if err != nil {
		t.Fatalf("SetGameOptions: %v", err)
	}

	for _, c := range []*capture{host, ben} {
		oc := c.next(t).GetGameOptionsChanged()
		if oc == nil || oc.GetGameId() != "fake" || oc.GetOptions() != `{"category":"food"}` {
			t.Fatalf("GameOptionsChanged = %v", oc)
		}
	}
}

func TestSetGameOptionsRejectedOnceGameIsRunning(t *testing.T) {
	m := newTestManagerWithGames(t, registryWith(&fakeGame{}))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	_ = m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil)
	expectGameStarted(t, host, "fake")

	err := m.SetGameOptions(context.Background(), created.RoomCode, created.Self.ID, "fake", nil)
	if !errors.Is(err, ErrGameInProgress) {
		t.Fatalf("err = %v, want ErrGameInProgress", err)
	}
}

// ─── game actions ───────────────────────────────────────────────────────────

func TestGameActionRoutesToAdvance(t *testing.T) {
	f := &fakeGame{
		advance: func(s game.State, ev game.Event) (game.State, []game.Effect, error) {
			return s, []game.Effect{gameMsg("got:" + string(ev.Data))}, nil
		},
	}
	m := newTestManagerWithGames(t, registryWith(f))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	_ = m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil)
	expectGameStarted(t, host, "fake")

	if err := m.GameAction(context.Background(), created.RoomCode, created.Self.ID, "fake", []byte("ping")); err != nil {
		t.Fatalf("GameAction: %v", err)
	}
	id, text := gameEventPayload(t, host)
	if id != "fake" || text != "got:ping" {
		t.Errorf("game event = (%s, %q)", id, text)
	}
}

func TestGameActionWithoutRunningGame(t *testing.T) {
	m := newTestManagerWithGames(t, registryWith(&fakeGame{}))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)

	if err := m.GameAction(context.Background(), created.RoomCode, created.Self.ID, "fake", []byte("x")); !errors.Is(err, ErrNoActiveGame) {
		t.Fatalf("err = %v, want ErrNoActiveGame", err)
	}
}

func TestGameAbortsWhenPlayerLeaves(t *testing.T) {
	m := newTestManagerWithGames(t, registryWith(&fakeGame{}))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	ben := newCapture()
	benRes, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t)

	_ = m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil)
	expectGameStarted(t, host, "fake")
	expectGameStarted(t, ben, "fake")

	if err := m.Leave(context.Background(), created.RoomCode, benRes.Self.ID, LeaveDisconnect); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	_ = host.next(t) // PlayerLeft
	ge := host.next(t).GetGameEnded()
	if ge == nil || ge.GetGameId() != "fake" || ge.GetReason() != "player_left" {
		t.Fatalf("expected GameEnded{fake, player_left}, got %v", ge)
	}

	if err := m.GameAction(context.Background(), created.RoomCode, created.Self.ID, "fake", []byte("x")); !errors.Is(err, ErrNoActiveGame) {
		t.Errorf("action after abort err = %v, want ErrNoActiveGame", err)
	}
}

// ─── mid-game departures ────────────────────────────────────────────────────

// fakeLeaver is a fakeGame that also implements game.Leaver, so the room hands
// it departures instead of ending the round itself.
type fakeLeaver struct {
	*fakeGame
	leave func(s game.State, playerID string) (game.State, []game.Effect, error)
	left  []string // every playerID Leave was called with, in order
}

func (f *fakeLeaver) Leave(s game.State, playerID string) (game.State, []game.Effect, error) {
	f.left = append(f.left, playerID)
	return f.leave(s, playerID)
}

func registryOf(g game.Game) *game.Registry {
	r := game.NewRegistry()
	r.Register("fake", g)
	return r
}

func TestLeaveIsHandedToAGameThatImplementsLeaver(t *testing.T) {
	inner := &fakeGame{}
	lv := &fakeLeaver{
		fakeGame: inner,
		leave: func(s game.State, playerID string) (game.State, []game.Effect, error) {
			return "state-after-leave", []game.Effect{gameMsg("carry-on")}, nil
		},
	}
	// Whatever Advance sees afterwards must be the state Leave returned, not
	// the one from Init.
	var sawState game.State
	inner.advance = func(s game.State, ev game.Event) (game.State, []game.Effect, error) {
		sawState = s
		return s, nil, nil
	}

	m := newTestManagerWithGames(t, registryOf(lv))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	ben := newCapture()
	benRes, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t) // PlayerJoined

	_ = m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil)
	expectGameStarted(t, host, "fake")
	expectGameStarted(t, ben, "fake")

	if err := m.Leave(context.Background(), created.RoomCode, benRes.Self.ID, LeaveDisconnect); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	if len(lv.left) != 1 || lv.left[0] != benRes.Self.ID {
		t.Fatalf("game was told about %v, want just %s", lv.left, benRes.Self.ID)
	}

	_ = host.next(t) // PlayerLeft
	gameID, text := gameEventPayload(t, host)
	if gameID != "fake" || text != "carry-on" {
		t.Errorf("got GameEvent{%s, %q}, want {fake, carry-on}", gameID, text)
	}
	host.expectSilent(t) // in particular, no GameEnded

	// The round is still live, and running on the state Leave returned.
	if err := m.GameAction(context.Background(), created.RoomCode, created.Self.ID, "fake", []byte("x")); err != nil {
		t.Fatalf("GameAction after a handled leave: %v", err)
	}
	if sawState != "state-after-leave" {
		t.Errorf("Advance saw state %v, want state-after-leave", sawState)
	}
}

func TestLeaverCanEndTheRoundItself(t *testing.T) {
	lv := &fakeLeaver{
		fakeGame: &fakeGame{},
		leave: func(s game.State, playerID string) (game.State, []game.Effect, error) {
			return s, []game.Effect{game.EndGame{Reason: "too_few_players"}}, nil
		},
	}
	m := newTestManagerWithGames(t, registryOf(lv))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	ben := newCapture()
	benRes, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t)

	_ = m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil)
	expectGameStarted(t, host, "fake")
	expectGameStarted(t, ben, "fake")

	if err := m.Leave(context.Background(), created.RoomCode, benRes.Self.ID, LeaveDisconnect); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	_ = host.next(t) // PlayerLeft
	ge := host.next(t).GetGameEnded()
	if ge == nil || ge.GetReason() != "too_few_players" {
		t.Fatalf("expected GameEnded{too_few_players}, got %v", ge)
	}
	if err := m.GameAction(context.Background(), created.RoomCode, created.Self.ID, "fake", []byte("x")); !errors.Is(err, ErrNoActiveGame) {
		t.Errorf("action after the game ended itself: err = %v, want ErrNoActiveGame", err)
	}
}

func TestLeaveThatErrorsEndsTheRound(t *testing.T) {
	// A Leave that fails is a bug in the game, and the player who triggered it
	// is already gone, so there is nobody to report it to. The room logs it and
	// falls back to ending the round rather than carrying on with state it
	// can't trust.
	lv := &fakeLeaver{
		fakeGame: &fakeGame{},
		leave: func(s game.State, playerID string) (game.State, []game.Effect, error) {
			return nil, nil, errors.New("boom")
		},
	}
	m := newTestManagerWithGames(t, registryOf(lv))
	host := newCapture()
	created, _ := m.Create(context.Background(), "Ana", "en", host)
	ben := newCapture()
	benRes, _ := m.Join(context.Background(), created.RoomCode, "Ben", "en", ben)
	_ = host.next(t)

	_ = m.StartGame(context.Background(), created.RoomCode, created.Self.ID, "fake", nil)
	expectGameStarted(t, host, "fake")
	expectGameStarted(t, ben, "fake")

	if err := m.Leave(context.Background(), created.RoomCode, benRes.Self.ID, LeaveDisconnect); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	_ = host.next(t) // PlayerLeft
	ge := host.next(t).GetGameEnded()
	if ge == nil || ge.GetReason() != "player_left" {
		t.Fatalf("expected GameEnded{player_left}, got %v", ge)
	}
	if err := m.GameAction(context.Background(), created.RoomCode, created.Self.ID, "fake", []byte("x")); !errors.Is(err, ErrNoActiveGame) {
		t.Errorf("action after a failed leave: err = %v, want ErrNoActiveGame", err)
	}
}
