package wavelength

import (
	"errors"
	"fmt"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/wavelength/pb"
)

// players makes a table of ids p1, p2, ... in join order.
func players(n int) []game.Player {
	out := make([]game.Player, n)
	for i := range out {
		out[i] = game.Player{ID: fmt.Sprintf("p%d", i+1), Locale: "en"}
	}
	return out
}

// start begins a match of n players with these options (nil for defaults) and
// fails the test on error.
func start(t *testing.T, n int, opts *pb.StartOptions) (*state, []game.Effect) {
	t.Helper()
	var raw []byte
	if opts != nil {
		var err error
		raw, err = protojson.Marshal(opts)
		if err != nil {
			t.Fatalf("marshal options: %v", err)
		}
	}
	st, effects, err := Game{}.Init(players(n), raw)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	return st.(*state), effects
}

// act sends one client message from playerID and returns what came back,
// without failing on error, so tests can check refusals too.
func act(t *testing.T, st *state, playerID string, msg *pb.WavelengthClientMessage) (*state, []game.Effect, error) {
	t.Helper()
	raw, err := protojson.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal message: %v", err)
	}
	next, effects, err := Game{}.Advance(st, game.Event{PlayerID: playerID, Data: raw})
	return next.(*state), effects, err
}

// must is act for a message the test expects to be accepted.
func must(t *testing.T, st *state, playerID string, msg *pb.WavelengthClientMessage) (*state, []game.Effect) {
	t.Helper()
	next, effects, err := act(t, st, playerID, msg)
	if err != nil {
		t.Fatalf("%s sending %v: %v", playerID, msg, err)
	}
	return next, effects
}

// leave applies a departure and fails the test on error.
func leave(t *testing.T, st *state, playerID string) (*state, []game.Effect) {
	t.Helper()
	next, effects, err := Game{}.Leave(st, playerID)
	if err != nil {
		t.Fatalf("Leave(%s): %v", playerID, err)
	}
	return next.(*state), effects
}

// Client message constructors, so a test reads as what the player did.

func chooseMsg(v int32) *pb.WavelengthClientMessage {
	return &pb.WavelengthClientMessage{Body: &pb.WavelengthClientMessage_ChooseSecret{ChooseSecret: &pb.ChooseSecret{Value: v}}}
}

func categoryMsg(text string) *pb.WavelengthClientMessage {
	return &pb.WavelengthClientMessage{Body: &pb.WavelengthClientMessage_SetCategory{SetCategory: &pb.SetCategory{Text: text}}}
}

func answerMsg(text string) *pb.WavelengthClientMessage {
	return &pb.WavelengthClientMessage{Body: &pb.WavelengthClientMessage_SubmitAnswer{SubmitAnswer: &pb.SubmitAnswer{Text: text}}}
}

func readyMsg() *pb.WavelengthClientMessage {
	return &pb.WavelengthClientMessage{Body: &pb.WavelengthClientMessage_ReadyToGuess{ReadyToGuess: &pb.ReadyToGuess{}}}
}

func guessMsg(v int32) *pb.WavelengthClientMessage {
	return &pb.WavelengthClientMessage{Body: &pb.WavelengthClientMessage_MakeGuess{MakeGuess: &pb.MakeGuess{Value: v}}}
}

func playAgainMsg() *pb.WavelengthClientMessage {
	return &pb.WavelengthClientMessage{Body: &pb.WavelengthClientMessage_PlayAgain{PlayAgain: &pb.PlayAgain{}}}
}

// answerAll has every Clue Giver answer the open category with "<id>:<category>".
func answerAll(t *testing.T, st *state) (*state, []game.Effect) {
	t.Helper()
	open := st.categories[len(st.categories)-1].name
	var effects []game.Effect
	for _, id := range st.givers {
		st, effects = must(t, st, id, answerMsg(id+":"+open))
	}
	return st, effects
}

// throughCategories plays a typed round from its first category to the guess.
func throughCategories(t *testing.T, st *state) *state {
	t.Helper()
	for _, name := range []string{"Animals", "Food", "Films"} {
		st, _ = must(t, st, st.psychicID, categoryMsg(name))
		st, _ = answerAll(t, st)
	}
	if st.phase != phaseGuess {
		t.Fatalf("after three categories phase = %s, want guess", st.phase)
	}
	return st
}

// sent is one game.Send, unwrapped: who it went to (nil means everyone) and
// the Wavelength message inside.
type sent struct {
	to  []string
	msg *pb.WavelengthServerMessage
}

// sends unwraps every Send among effects, in order. A test then asks each
// message what it holds with the generated getters: msg.GetResult() is nil
// unless the message is a Result.
func sends(effects []game.Effect) []sent {
	var out []sent
	for _, e := range effects {
		// A type assertion with ", ok": "is this Effect a game.Send?" ok is
		// false for any other effect, instead of a panic.
		s, ok := e.(game.Send)
		if !ok {
			continue
		}
		if m, ok := s.Msg.(*pb.WavelengthServerMessage); ok {
			out = append(out, sent{to: s.To, msg: m})
		}
	}
	return out
}

// endReason returns the reason of an EndGame among effects, or "".
func endReason(effects []game.Effect) string {
	for _, e := range effects {
		if end, ok := e.(game.EndGame); ok {
			return end.Reason
		}
	}
	return ""
}

// rejectCode returns err's game.Rejected code, or "" for any other error.
func rejectCode(err error) string {
	var rej *game.Rejected
	if errors.As(err, &rej) {
		return rej.Code
	}
	return ""
}

// wrongGuess is a guess guaranteed to miss st's secret.
func wrongGuess(st *state) int32 {
	if st.secret == highest {
		return lowest
	}
	return int32(st.secret + 1)
}
