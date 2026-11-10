package fibblash

import (
	"errors"
	"fmt"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

// A tiny bank, one question of each kind, so a test knows exactly what it is
// playing.
var (
	testReal = question{
		id: "t-real", kind: kindReal, category: "everyday", difficulty: easy,
		prompt: l("The first webcam watched a ____.", "La première webcam filmait une ____."),
		answer: l("coffee pot", "cafetière"), explanation: l("why", "pourquoi"), source: "test",
	}
	testHybrid = question{
		id: "t-hybrid", kind: kindHybrid, category: "animals", difficulty: easy,
		prompt: l("Wombat poop is shaped like ____.", "Les crottes de wombat ont la forme de ____."),
		answer: l("cubes", "cubes"), explanation: l("why", "pourquoi"), source: "test",
	}
	testCreative = question{
		id: "t-creative", kind: kindCreative, category: "ridiculous",
		prompt: l("The worst name for a boat", "Le pire nom de bateau"),
	}
)

// newTestGame is a Game over just these questions, with a fixed seed.
func newTestGame(bank ...question) *Game {
	return &Game{bank: bank, seed: func() uint64 { return 42 }, times: defaultTimings}
}

func players(n int) []game.Player {
	out := make([]game.Player, n)
	for i := range out {
		out[i] = game.Player{ID: fmt.Sprintf("p%d", i+1), Locale: "en"}
	}
	return out
}

// start begins a match of n players that plays bank in exactly the order
// given, rather than in the planner's random order, and returns its first
// state. The planner has tests of its own (plan_test.go).
func start(t *testing.T, n int, bank ...question) (*Game, *state) {
	t.Helper()
	g := newTestGame(bank...)
	st, _, err := g.Init(players(n), nil)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	seedState := st.(*state)
	seedState.questions = bank
	return g, seedState.startQuestion(0)
}

// encode builds a client message's JSON.
func encode(t *testing.T, msg *pb.FibblashClientMessage) []byte {
	t.Helper()
	b, err := protojson.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

func answerMsg(text string) *pb.FibblashClientMessage {
	return &pb.FibblashClientMessage{Body: &pb.FibblashClientMessage_SubmitAnswer{SubmitAnswer: &pb.SubmitAnswer{Text: text}}}
}

func voteMsg(id string) *pb.FibblashClientMessage {
	return &pb.FibblashClientMessage{Body: &pb.FibblashClientMessage_CastVote{CastVote: &pb.CastVote{ChoiceId: id}}}
}

var (
	nextMsg   = &pb.FibblashClientMessage{Body: &pb.FibblashClientMessage_HostNext{HostNext: &pb.HostNext{}}}
	skipMsg   = &pb.FibblashClientMessage{Body: &pb.FibblashClientMessage_HostSkip{HostSkip: &pb.HostSkip{}}}
	endMsg    = &pb.FibblashClientMessage{Body: &pb.FibblashClientMessage_HostEnd{HostEnd: &pb.HostEnd{}}}
	finishMsg = &pb.FibblashClientMessage{Body: &pb.FibblashClientMessage_Finish{Finish: &pb.Finish{}}}
)

// act has a player send msg and requires it to be accepted.
func act(t *testing.T, g *Game, st *state, playerID string, msg *pb.FibblashClientMessage) (*state, []game.Effect) {
	t.Helper()
	next, effects, err := g.Advance(st, game.Event{PlayerID: playerID, Data: encode(t, msg)})
	if err != nil {
		t.Fatalf("%s: %v", playerID, err)
	}
	return next.(*state), effects
}

// host has the host send msg.
func host(t *testing.T, g *Game, st *state, msg *pb.FibblashClientMessage) (*state, []game.Effect) {
	t.Helper()
	next, effects, err := g.Advance(st, game.Event{PlayerID: "screen", Data: encode(t, msg), FromHost: true})
	if err != nil {
		t.Fatalf("host: %v", err)
	}
	return next.(*state), effects
}

// refused has a player send msg and requires it to be refused with code.
func refused(t *testing.T, g *Game, st *state, playerID string, msg *pb.FibblashClientMessage, code string) {
	t.Helper()
	next, effects, err := g.Advance(st, game.Event{PlayerID: playerID, Data: encode(t, msg)})
	var rej *game.Rejected
	if !errors.As(err, &rej) || rej.Code != code {
		t.Fatalf("%s: got err %v, want rejection %s", playerID, err, code)
	}
	if next != st || effects != nil {
		t.Errorf("a refused action changed something")
	}
}

// fire runs the current phase's clock out.
func fire(t *testing.T, g *Game, st *state) (*state, []game.Effect) {
	t.Helper()
	next, effects, err := g.Advance(st, game.Event{Timer: &game.TimerFired{Tag: st.tag()}})
	if err != nil {
		t.Fatalf("timer: %v", err)
	}
	return next.(*state), effects
}

// fireUntil runs clocks out until the match reaches phase p.
func fireUntil(t *testing.T, g *Game, st *state, p phase) *state {
	t.Helper()
	for i := 0; st.phase != p; i++ {
		if i > 50 {
			t.Fatalf("never reached %s; stuck at %s", p, st.phase)
		}
		st, _ = fire(t, g, st)
	}
	return st
}

// sent is one Send effect, decoded.
type sent struct {
	to  []string
	msg *pb.FibblashServerMessage
}

func sends(effects []game.Effect) []sent {
	var out []sent
	for _, e := range effects {
		if s, ok := e.(game.Send); ok {
			out = append(out, sent{to: s.To, msg: s.Msg.(*pb.FibblashServerMessage)})
		}
	}
	return out
}

// broadcast returns the first broadcast whose body matches pick.
func broadcast[T any](t *testing.T, effects []game.Effect, pick func(*pb.FibblashServerMessage) T) T {
	t.Helper()
	var zero T
	for _, s := range sends(effects) {
		if len(s.to) != 0 {
			continue
		}
		if v := pick(s.msg); !isZero(v) {
			return v
		}
	}
	t.Fatalf("no such broadcast among %d effects", len(effects))
	return zero
}

// private returns the first message sent only to playerID whose body matches pick.
func private[T any](t *testing.T, effects []game.Effect, playerID string, pick func(*pb.FibblashServerMessage) T) T {
	t.Helper()
	var zero T
	for _, s := range sends(effects) {
		if len(s.to) == 1 && s.to[0] == playerID {
			if v := pick(s.msg); !isZero(v) {
				return v
			}
		}
	}
	t.Fatalf("nothing private to %s", playerID)
	return zero
}

func isZero[T any](v T) bool {
	m, ok := any(v).(proto.Message)
	return !ok || m == nil || !m.ProtoReflect().IsValid()
}

// clockOf returns the Timer among effects, and whether there was one.
func clockOf(effects []game.Effect) (game.Timer, bool) {
	for _, e := range effects {
		if tm, ok := e.(game.Timer); ok {
			return tm, true
		}
	}
	return game.Timer{}, false
}

func keepsClock(effects []game.Effect) bool {
	for _, e := range effects {
		if _, ok := e.(game.KeepTimer); ok {
			return true
		}
	}
	return false
}

// choiceByText finds a ballot choice by its text.
func choiceByText(t *testing.T, vp *pb.VotePhase, text string) string {
	t.Helper()
	for _, c := range vp.GetChoices() {
		if c.GetText() == text {
			return c.GetId()
		}
	}
	t.Fatalf("no choice %q on the ballot", text)
	return ""
}
