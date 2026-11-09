package wavelength

import (
	"reflect"
	"testing"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/wavelength/pb"
)

func TestInitRefuses(t *testing.T) {
	tests := []struct {
		name    string
		players int
		options []byte
	}{
		{"two players", 2, nil},
		{"malformed options", 3, []byte("{not json")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, _, err := (Game{}).Init(players(tt.players), tt.options); err == nil {
				t.Error("Init succeeded, want an error")
			}
		})
	}
}

func TestInitDealsTheFirstRound(t *testing.T) {
	tests := []struct {
		name        string
		opts        *pb.StartOptions
		wantPhase   phase
		wantSecret  bool   // whether the number is drawn already
		wantChooser string // who enters a chosen number
	}{
		{"typed, drawn number", nil, phaseCategory, true, ""},
		{"spoken", &pb.StartOptions{SpokenAnswers: true}, phaseTalk, true, ""},
		{"chosen number", &pb.StartOptions{ChosenSecret: true}, phaseChoose, false, "p2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st, effects := start(t, 4, tt.opts)

			if st.phase != tt.wantPhase {
				t.Errorf("phase = %s, want %s", st.phase, tt.wantPhase)
			}
			if st.psychicID != "p1" {
				t.Errorf("first Psychic = %s, want p1 (first to join)", st.psychicID)
			}
			if got := st.totalRounds(); got != 4 {
				t.Errorf("totalRounds = %d, want one per player (4)", got)
			}
			if drawn := st.secret != 0; drawn != tt.wantSecret {
				t.Errorf("secret drawn = %v, want %v", drawn, tt.wantSecret)
			}
			if tt.wantSecret && checkNumber(int32(st.secret)) != nil {
				t.Errorf("secret %d is out of range", st.secret)
			}

			// One private RoundStart each. Only Clue Givers see the number.
			starts := 0
			for _, s := range sends(effects) {
				rs := s.msg.GetRoundStart()
				if rs == nil {
					continue
				}
				starts++
				if len(s.to) != 1 {
					t.Fatalf("RoundStart addressed to %v, want one player", s.to)
				}
				to := s.to[0]
				wantSecret := int32(0)
				if to != "p1" {
					wantSecret = int32(st.secret)
				}
				if rs.GetSecret() != wantSecret {
					t.Errorf("%s's RoundStart secret = %d, want %d", to, rs.GetSecret(), wantSecret)
				}
				if rs.GetChooserId() != tt.wantChooser {
					t.Errorf("chooser = %q, want %q", rs.GetChooserId(), tt.wantChooser)
				}
				if want := []string{"p2", "p3", "p4"}; !reflect.DeepEqual(rs.GetGiverIds(), want) {
					t.Errorf("givers = %v, want %v", rs.GetGiverIds(), want)
				}
			}
			if starts != 4 {
				t.Errorf("RoundStart count = %d, want 4", starts)
			}
		})
	}
}

func TestTypedRound(t *testing.T) {
	st, _ := start(t, 3, nil)
	before := st

	st, effects := must(t, st, "p1", categoryMsg("  Animals  "))
	if st.phase != phaseAnswer {
		t.Fatalf("phase = %s, want answer", st.phase)
	}
	if ap := sends(effects)[0].msg.GetAnswerPhase(); ap.GetCategory() != "Animals" || ap.GetNumber() != 1 {
		t.Errorf("AnswerPhase = %v, want Animals as category 1 (trimmed)", ap)
	}
	if len(before.categories) != 0 {
		t.Error("Advance changed the state it was given")
	}

	// The first answer only reports progress, and never what was said.
	st, effects = must(t, st, "p2", answerMsg("Cats"))
	prog := sends(effects)[0].msg.GetAnswerProgress()
	if prog == nil || !reflect.DeepEqual(prog.GetAnsweredIds(), []string{"p2"}) || prog.GetTotal() != 2 {
		t.Fatalf("after one answer got %v, want AnswerProgress [p2] of 2", sends(effects)[0].msg)
	}

	// Changing your mind before the last answer is fine.
	st, _ = must(t, st, "p2", answerMsg("Dogs"))

	// The last answer closes the category and shows everyone both answers.
	st, effects = must(t, st, "p3", answerMsg("Snakes"))
	ct := sends(effects)[0].msg.GetCategoryTurn()
	if ct == nil || ct.GetNumber() != 2 {
		t.Fatalf("after the last answer got %v, want CategoryTurn number 2", sends(effects)[0].msg)
	}
	got := ct.GetCategories()[0].GetAnswers()
	if len(got) != 2 || got[0].GetText() != "Dogs" || got[1].GetText() != "Snakes" {
		t.Errorf("revealed answers = %v, want Dogs then Snakes", got)
	}

	// Two more categories and it is time to guess.
	for _, name := range []string{"Food", "Films"} {
		st, _ = must(t, st, "p1", categoryMsg(name))
		st, effects = answerAll(t, st)
	}
	if gt := sends(effects)[0].msg.GetGuessTurn(); gt == nil || len(gt.GetCategories()) != 3 {
		t.Fatalf("after three categories got %v, want GuessTurn with all three", sends(effects)[0].msg)
	}
}

func TestGuessScores(t *testing.T) {
	tests := []struct {
		name  string
		right bool
		want  map[string]int32
	}{
		{"right", true, map[string]int32{"p1": 3}},
		{"wrong", false, map[string]int32{"p2": 1, "p3": 1, "p4": 1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st, _ := start(t, 4, nil)
			st = throughCategories(t, st)

			guess := wrongGuess(st)
			if tt.right {
				guess = int32(st.secret)
			}
			st, effects := must(t, st, "p1", guessMsg(guess))

			if !reflect.DeepEqual(st.scores, tt.want) {
				t.Errorf("scores = %v, want %v", st.scores, tt.want)
			}
			res := sends(effects)[0].msg.GetResult()
			if res == nil {
				t.Fatal("no Result sent")
			}
			if res.GetPsychicWon() != tt.right || res.GetSecret() != int32(st.secret) || res.GetGuess() != guess {
				t.Errorf("Result = %v", res)
			}
			if res.GetMatchOver() || res.GetNextPsychicId() != "p2" {
				t.Errorf("after round 1, match_over=%v next=%q; want false, p2", res.GetMatchOver(), res.GetNextPsychicId())
			}
		})
	}
}

func TestRefusals(t *testing.T) {
	typed, _ := start(t, 3, nil)
	chosen, _ := start(t, 3, &pb.StartOptions{ChosenSecret: true})
	spoken, _ := start(t, 3, &pb.StartOptions{SpokenAnswers: true})
	answering, _ := must(t, typed, "p1", categoryMsg("Animals"))
	guessing := throughCategories(t, typed)

	tests := []struct {
		name     string
		st       *state
		from     string
		msg      *pb.WavelengthClientMessage
		wantCode string // a coded rejection, or "" for a plain error
	}{
		{"a Clue Giver names a category", typed, "p2", categoryMsg("Food"), ""},
		{"an empty category", typed, "p1", categoryMsg("   "), codeCategoryEmpty},
		{"a repeated category", func() *state {
			st, _ := must(t, typed, "p1", categoryMsg("Animals"))
			st, _ = answerAll(t, st)
			return st
		}(), "p1", categoryMsg("animals"), codeCategoryRepeated},
		{"the Psychic answers", answering, "p1", answerMsg("Cats"), ""},
		{"an empty answer", answering, "p2", answerMsg(""), codeAnswerEmpty},
		{"an answer with no category open", typed, "p2", answerMsg("Cats"), ""},
		{"a non-chooser enters the number", chosen, "p3", chooseMsg(4), ""},
		{"the Psychic enters the number", chosen, "p1", chooseMsg(4), ""},
		{"the chooser enters 11", chosen, "p2", chooseMsg(11), codeNumberOutOfRange},
		{"a category before the number is set", chosen, "p1", categoryMsg("Food"), ""},
		{"a Clue Giver ends the talking", spoken, "p2", readyMsg(), ""},
		{"ready in a typed round", typed, "p1", readyMsg(), ""},
		{"a Clue Giver guesses", guessing, "p2", guessMsg(5), ""},
		{"a guess of 0", guessing, "p1", guessMsg(0), codeNumberOutOfRange},
		{"a guess too early", typed, "p1", guessMsg(5), ""},
		{"play again mid-round", typed, "p1", playAgainMsg(), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			next, effects, err := act(t, tt.st, tt.from, tt.msg)
			if err == nil {
				t.Fatal("accepted, want refused")
			}
			if got := rejectCode(err); got != tt.wantCode {
				t.Errorf("code = %q, want %q (err: %v)", got, tt.wantCode, err)
			}
			// A refusal changes nothing and says nothing.
			if next != tt.st || len(effects) != 0 {
				t.Errorf("refusal returned a new state or %d effects", len(effects))
			}
		})
	}
}

func TestChosenSecret(t *testing.T) {
	st, _ := start(t, 3, &pb.StartOptions{ChosenSecret: true})

	st, effects := must(t, st, "p2", chooseMsg(7))
	if st.secret != 7 || st.phase != phaseCategory {
		t.Fatalf("secret=%d phase=%s, want 7 and category", st.secret, st.phase)
	}

	// Everyone hears the number is set; only Clue Givers hear what it is.
	got := map[string]int32{}
	for _, s := range sends(effects) {
		if ss := s.msg.GetSecretSet(); ss != nil {
			got[s.to[0]] = ss.GetSecret()
		}
	}
	if want := map[string]int32{"p1": 0, "p2": 7, "p3": 7}; !reflect.DeepEqual(got, want) {
		t.Errorf("SecretSet = %v, want %v", got, want)
	}
	if last := sends(effects)[len(effects)-1].msg; last.GetCategoryTurn() == nil {
		t.Errorf("last effect = %v, want the CategoryTurn that opens the round", last)
	}
}

func TestSpokenRound(t *testing.T) {
	st, _ := start(t, 3, &pb.StartOptions{SpokenAnswers: true})

	st, effects := must(t, st, "p1", readyMsg())
	if st.phase != phaseGuess || sends(effects)[0].msg.GetGuessTurn() == nil {
		t.Fatalf("phase = %s, want guess with a GuessTurn", st.phase)
	}
	st, _ = must(t, st, "p1", guessMsg(int32(st.secret)))
	if st.scores["p1"] != 2 {
		t.Errorf("Psychic score = %d, want 2", st.scores["p1"])
	}
}

func TestMatch(t *testing.T) {
	st, _ := start(t, 3, nil)

	for round := 1; round <= 3; round++ {
		wantPsychic := players(3)[round-1].ID
		if st.round != round || st.psychicID != wantPsychic {
			t.Fatalf("round %d: got round %d Psychic %s, want Psychic %s", round, st.round, st.psychicID, wantPsychic)
		}
		st = throughCategories(t, st)
		var effects []game.Effect
		st, effects = must(t, st, st.psychicID, guessMsg(wrongGuess(st)))
		res := sends(effects)[0].msg.GetResult()

		if round < 3 {
			if res.GetMatchOver() {
				t.Fatalf("round %d: match over too early", round)
			}
			st, effects = must(t, st, "p3", playAgainMsg())
			if rs := sends(effects)[0].msg.GetRoundStart(); rs.GetRound() != int32(round+1) {
				t.Fatalf("PlayAgain sent %v, want RoundStart for round %d", rs, round+1)
			}
			// A second press lands on the new round and is refused.
			if _, _, err := act(t, st, "p2", playAgainMsg()); err == nil {
				t.Fatal("a second PlayAgain dealt another round")
			}
			continue
		}

		// Every round was a miss, so each player scored 1 point in each of the
		// two rounds they were a Clue Giver: a three-way tie.
		if !res.GetMatchOver() || !reflect.DeepEqual(res.GetWinnerIds(), []string{"p1", "p2", "p3"}) {
			t.Errorf("final Result over=%v winners=%v; want over, all three tied", res.GetMatchOver(), res.GetWinnerIds())
		}
	}

	_, effects := must(t, st, "p1", playAgainMsg())
	if got := endReason(effects); got != "finished" {
		t.Errorf("PlayAgain after the last round ended with %q, want finished", got)
	}
}

func TestStrayTimerIsIgnored(t *testing.T) {
	st, _ := start(t, 3, nil)
	next, effects, err := Game{}.Advance(st, game.Event{Timer: &game.TimerFired{Tag: "anything"}})
	if err != nil || next != game.State(st) || len(effects) != 0 {
		t.Errorf("timer: state changed=%v effects=%d err=%v; want nothing to happen", next != game.State(st), len(effects), err)
	}
}
