package wavelength

import (
	"reflect"
	"testing"

	"github.com/mintthiha/party-games/server/internal/games/wavelength/pb"
)

func TestLeaveEndsTheMatch(t *testing.T) {
	lastRound := func() *state {
		st, _ := start(t, 4, nil)
		for range 3 { // `range 3` loops three times (Go 1.22+)
			st = throughCategories(t, st)
			st, _ = must(t, st, st.psychicID, guessMsg(5))
			st, _ = must(t, st, "p1", playAgainMsg())
		}
		return st // round 4 of 4, p4 is the Psychic
	}()
	threeLeft, _ := start(t, 3, nil)

	tests := []struct {
		name string
		st   *state
		who  string
		want string
	}{
		{"too few players remain", threeLeft, "p2", "player_left"},
		{"the last Psychic leaves mid-round", lastRound, "p4", "psychic_left"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, effects := leave(t, tt.st, tt.who)
			if got := endReason(effects); got != tt.want {
				t.Errorf("end reason = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPsychicLeavingDealsTheNextRound(t *testing.T) {
	st, _ := start(t, 4, nil)
	st, _ = must(t, st, "p1", categoryMsg("Animals"))

	st, effects := leave(t, st, "p1")

	if st.round != 2 || st.psychicID != "p2" || st.phase != phaseCategory {
		t.Fatalf("round=%d Psychic=%s phase=%s; want round 2, p2, category", st.round, st.psychicID, st.phase)
	}
	if want := []string{"p3", "p4"}; !reflect.DeepEqual(st.givers, want) {
		t.Errorf("givers = %v, want %v", st.givers, want)
	}
	if len(st.scores) != 0 {
		t.Errorf("an abandoned round scored %v", st.scores)
	}
	starts := 0
	for _, s := range sends(effects) {
		if s.msg.GetRoundStart() != nil {
			starts++
		}
	}
	if starts != 3 {
		t.Errorf("RoundStart count = %d, want one for each of the 3 still here", starts)
	}
}

func TestGiverLeavingWhileAnswering(t *testing.T) {
	tests := []struct {
		name         string
		answeredBy   []string
		wantClosed   bool
		wantProgress []string
	}{
		{"the others had answered: the category closes", []string{"p2", "p3", "p4"}, true, nil},
		{"someone still to answer: progress shrinks", []string{"p2"}, false, []string{"p2"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st, _ := start(t, 5, nil)
			st, _ = must(t, st, "p1", categoryMsg("Animals"))
			for _, id := range tt.answeredBy {
				st, _ = must(t, st, id, answerMsg("x"))
			}

			st, effects := leave(t, st, "p5")
			msg := sends(effects)[0].msg

			if tt.wantClosed {
				ct := msg.GetCategoryTurn()
				if ct == nil {
					t.Fatalf("got %v, want CategoryTurn", msg)
				}
				if n := len(ct.GetCategories()[0].GetAnswers()); n != 3 {
					t.Errorf("closed with %d answers, want 3 (p5 dropped)", n)
				}
				return
			}
			prog := msg.GetAnswerProgress()
			if prog == nil || !reflect.DeepEqual(prog.GetAnsweredIds(), tt.wantProgress) || prog.GetTotal() != 3 {
				t.Errorf("got %v, want progress %v of 3", msg, tt.wantProgress)
			}
			if st.phase != phaseAnswer {
				t.Errorf("phase = %s, want still answer", st.phase)
			}
		})
	}
}

func TestChooserLeaving(t *testing.T) {
	st, _ := start(t, 4, &pb.StartOptions{ChosenSecret: true})
	st, effects := leave(t, st, "p2")

	if st.chooserID() != "p3" {
		t.Errorf("chooser = %s, want p3, the next Clue Giver", st.chooserID())
	}
	rs := sends(effects)[0].msg.GetRoundStart()
	if rs == nil || rs.GetChooserId() != "p3" {
		t.Errorf("got %v, want a RoundStart naming p3 as chooser", sends(effects)[0].msg)
	}
	if _, _, err := act(t, st, "p3", chooseMsg(2)); err != nil {
		t.Errorf("the new chooser was refused: %v", err)
	}
}

func TestLeavingDuringTheResult(t *testing.T) {
	st, _ := start(t, 4, nil)
	st = throughCategories(t, st)
	st, _ = must(t, st, "p1", guessMsg(5))

	// p2 was next up as the Psychic; leaving hands that to p3.
	st, effects := leave(t, st, "p2")
	res := sends(effects)[0].msg.GetResult()
	if res == nil || res.GetNextPsychicId() != "p3" || res.GetTotalRounds() != 3 {
		t.Fatalf("got %v, want a fresh Result with p3 next, 3 rounds", sends(effects)[0].msg)
	}

	st, effects = must(t, st, "p1", playAgainMsg())
	if rs := sends(effects)[0].msg.GetRoundStart(); rs.GetPsychicId() != "p3" {
		t.Errorf("next round's Psychic = %s, want p3", rs.GetPsychicId())
	}
	if st.round != 2 {
		t.Errorf("round = %d, want 2", st.round)
	}
}

func TestBystanderLeaving(t *testing.T) {
	st, _ := start(t, 3, nil)
	next, effects := leave(t, st, "someone-else")
	if next != st || len(effects) != 0 {
		t.Error("a player not in the match changed it by leaving")
	}
}
