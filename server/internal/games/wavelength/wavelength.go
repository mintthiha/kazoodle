package wavelength

import (
	"fmt"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/wavelength/pb"
)

var unmarshal = protojson.UnmarshalOptions{DiscardUnknown: true}

// Game is the Wavelength game. It holds no state of its own: a match lives in
// the game.State the room carries between calls.
type Game struct{}

// New returns a Wavelength game ready to register.
func New() *Game { return &Game{} }

// Init starts a match with these players, in this order, and deals the first
// round. options is the proto3-JSON of a StartOptions; empty means defaults
// (typed answers, a drawn number).
func (Game) Init(players []game.Player, options []byte) (game.State, []game.Effect, error) {
	if len(players) < minPlayers {
		return nil, nil, fmt.Errorf("wavelength needs at least %d players, got %d", minPlayers, len(players))
	}

	var opts pb.StartOptions
	if len(options) > 0 {
		if err := unmarshal.Unmarshal(options, &opts); err != nil {
			return nil, nil, fmt.Errorf("wavelength: bad start options: %w", err)
		}
	}

	roster := make([]string, len(players))
	for i, p := range players {
		roster[i] = p.ID
	}

	// A round-zero seed with only the match-level fields. beginRound does the
	// rest, so the first round is set up exactly like every later one.
	seed := &state{
		roster:  roster,
		present: roster,
		queue:   roster, // everyone is the Psychic once, in join order
		scores:  make(map[string]int32),
		spoken:  opts.GetSpokenAnswers(),
		chosen:  opts.GetChosenSecret(),
	}
	st := seed.beginRound()
	return st, roundStart(st), nil
}

// Advance applies one player's message.
func (Game) Advance(current game.State, ev game.Event) (game.State, []game.Effect, error) {
	st, ok := current.(*state)
	if !ok {
		// The room only ever hands a game its own state; a mismatch is a bug.
		return current, nil, fmt.Errorf("wavelength: unexpected state type %T", current)
	}
	if ev.IsTimer() {
		// This game arms no clocks, so an expiry can only be a stray.
		return st, nil, nil
	}

	var msg pb.WavelengthClientMessage
	if err := unmarshal.Unmarshal(ev.Data, &msg); err != nil {
		return current, nil, fmt.Errorf("wavelength: bad client message: %w", err)
	}

	// A type switch: msg.GetBody() returns an interface, and each case both
	// checks which concrete message it holds and gives it to us as `body`
	// with that type. The TypeScript equivalent is narrowing on body.case.
	switch body := msg.GetBody().(type) {
	case *pb.WavelengthClientMessage_ChooseSecret:
		return advanceChoose(st, ev.PlayerID, body.ChooseSecret.GetValue())
	case *pb.WavelengthClientMessage_SetCategory:
		return advanceCategory(st, ev.PlayerID, body.SetCategory.GetText())
	case *pb.WavelengthClientMessage_SubmitAnswer:
		return advanceAnswer(st, ev.PlayerID, body.SubmitAnswer.GetText())
	case *pb.WavelengthClientMessage_ReadyToGuess:
		return advanceReady(st, ev.PlayerID)
	case *pb.WavelengthClientMessage_MakeGuess:
		return advanceGuess(st, ev.PlayerID, body.MakeGuess.GetValue())
	case *pb.WavelengthClientMessage_PlayAgain:
		return advancePlayAgain(st)
	default:
		return st, nil, fmt.Errorf("wavelength: unsupported message in phase %s", st.phase)
	}
}

// advanceChoose takes the agreed number from the chooser. Everyone learns it
// has been set; only the Clue Givers learn what it is.
func advanceChoose(st *state, playerID string, value int32) (game.State, []game.Effect, error) {
	if st.phase != phaseChoose {
		return st, nil, fmt.Errorf("wavelength: the number is not being chosen right now")
	}
	if playerID != st.chooserID() {
		return st, nil, fmt.Errorf("wavelength: %s is not the one entering the number", playerID)
	}
	if err := checkNumber(value); err != nil {
		return st, nil, err
	}

	next := st.clone()
	next.secret = int(value)
	next.phase = afterSecret(next)

	effects := make([]game.Effect, 0, len(next.present)+1)
	for _, id := range next.present {
		effects = append(effects, game.Send{To: []string{id}, Msg: secretSetFor(next, id)})
	}
	return next, append(effects, phaseOpening(next)...), nil
}

// advanceCategory takes the Psychic's next category and opens it for answers.
func advanceCategory(st *state, playerID, text string) (game.State, []game.Effect, error) {
	if st.phase != phaseCategory {
		return st, nil, fmt.Errorf("wavelength: no category is wanted right now")
	}
	if playerID != st.psychicID {
		return st, nil, fmt.Errorf("wavelength: only the Psychic names categories")
	}
	name := strings.TrimSpace(text)
	if err := checkCategory(st.categories, name); err != nil {
		return st, nil, err
	}

	next := st.clone()
	next.categories = append(next.categories, category{name: name})
	next.phase = phaseAnswer
	return next, phaseOpening(next), nil
}

// advanceAnswer records one Clue Giver's answer. A second answer from the same
// player replaces the first, until the last one arrives and the category
// closes.
func advanceAnswer(st *state, playerID, text string) (game.State, []game.Effect, error) {
	if st.phase != phaseAnswer {
		return st, nil, fmt.Errorf("wavelength: no category is open for answers")
	}
	if !st.isGiver(playerID) {
		return st, nil, fmt.Errorf("wavelength: only Clue Givers answer")
	}
	text = strings.TrimSpace(text)
	if err := checkAnswer(text); err != nil {
		return st, nil, err
	}

	next := st.clone()
	next.pending[playerID] = text
	if next.allAnswered() {
		return next, closeCategory(next), nil
	}
	return next, []game.Effect{game.Send{Msg: answerProgress(next)}}, nil
}

// advanceReady ends the talking in a spoken round.
func advanceReady(st *state, playerID string) (game.State, []game.Effect, error) {
	if st.phase != phaseTalk {
		return st, nil, fmt.Errorf("wavelength: there is no talking to finish")
	}
	if playerID != st.psychicID {
		return st, nil, fmt.Errorf("wavelength: only the Psychic says when to guess")
	}
	next := st.clone()
	next.phase = phaseGuess
	return next, phaseOpening(next), nil
}

// advanceGuess scores the Psychic's guess and shows everyone the result.
func advanceGuess(st *state, playerID string, value int32) (game.State, []game.Effect, error) {
	if st.phase != phaseGuess {
		return st, nil, fmt.Errorf("wavelength: no guess is wanted right now")
	}
	if playerID != st.psychicID {
		return st, nil, fmt.Errorf("wavelength: only the Psychic guesses")
	}
	if err := checkNumber(value); err != nil {
		return st, nil, err
	}

	next := st.clone()
	next.guess = int(value)
	next.phase = phaseResult
	next.deltas = award(next.psychicID, next.givers, next.guess == next.secret)
	for id, pts := range next.deltas {
		next.scores[id] += pts
	}
	return next, []game.Effect{game.Send{Msg: result(next)}}, nil
}

// advancePlayAgain deals the next round, or ends the match after the last one.
// It is refused outside the result, so two quick presses cannot burn two rounds:
// the second one arrives after the first has already dealt.
func advancePlayAgain(st *state) (game.State, []game.Effect, error) {
	if st.phase != phaseResult {
		return st, nil, fmt.Errorf("wavelength: the round isn't over yet")
	}
	if st.matchOver() {
		return st, []game.Effect{game.EndGame{Reason: "finished"}}, nil
	}
	next := st.beginRound()
	return next, roundStart(next), nil
}
