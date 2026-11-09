package wavelength

import "github.com/mintthiha/party-games/server/internal/games/wavelength/pb"

// The builders below turn state into wire messages. Nothing here is localized:
// every string the server sends was typed by a player, so the same message
// suits every reader.

// roundStartFor is one player's private view of a new round. Only a Clue
// Giver's copy carries the number.
func roundStartFor(s *state, playerID string) *pb.WavelengthServerMessage {
	rs := &pb.RoundStart{
		Round:         int32(s.round),
		TotalRounds:   int32(s.totalRounds()),
		PsychicId:     s.psychicID,
		GiverIds:      append([]string(nil), s.givers...),
		SpokenAnswers: s.spoken,
		ChosenSecret:  s.chosen,
		ChooserId:     s.chooserID(),
	}
	if s.isGiver(playerID) {
		rs.Secret = int32(s.secret)
	}
	return &pb.WavelengthServerMessage{Body: &pb.WavelengthServerMessage_RoundStart{RoundStart: rs}}
}

// secretSetFor tells one player a chosen number has been entered, and what it
// is if they are allowed to know.
func secretSetFor(s *state, playerID string) *pb.WavelengthServerMessage {
	var secret int32
	if s.isGiver(playerID) {
		secret = int32(s.secret)
	}
	return &pb.WavelengthServerMessage{
		Body: &pb.WavelengthServerMessage_SecretSet{SecretSet: &pb.SecretSet{Secret: secret}},
	}
}

func categoryTurn(s *state) *pb.WavelengthServerMessage {
	return &pb.WavelengthServerMessage{
		Body: &pb.WavelengthServerMessage_CategoryTurn{CategoryTurn: &pb.CategoryTurn{
			Number:     int32(len(s.categories) + 1),
			Total:      categoriesPerRound,
			Categories: closedCategories(s),
		}},
	}
}

func answerPhase(s *state) *pb.WavelengthServerMessage {
	open := s.categories[len(s.categories)-1]
	return &pb.WavelengthServerMessage{
		Body: &pb.WavelengthServerMessage_AnswerPhase{AnswerPhase: &pb.AnswerPhase{
			Category:   open.name,
			Number:     int32(len(s.categories)),
			Total:      categoriesPerRound,
			Categories: closedCategories(s),
		}},
	}
}

// answerProgress says who has answered the open category, never what.
func answerProgress(s *state) *pb.WavelengthServerMessage {
	answered := make([]string, 0, len(s.pending))
	for _, id := range s.givers { // giver order, not map order, so it is stable
		if _, ok := s.pending[id]; ok {
			answered = append(answered, id)
		}
	}
	return &pb.WavelengthServerMessage{
		Body: &pb.WavelengthServerMessage_AnswerProgress{AnswerProgress: &pb.AnswerProgress{
			AnsweredIds: answered,
			Total:       int32(len(s.givers)),
		}},
	}
}

func talkPhase() *pb.WavelengthServerMessage {
	return &pb.WavelengthServerMessage{
		Body: &pb.WavelengthServerMessage_TalkPhase{TalkPhase: &pb.TalkPhase{}},
	}
}

func guessTurn(s *state) *pb.WavelengthServerMessage {
	return &pb.WavelengthServerMessage{
		Body: &pb.WavelengthServerMessage_GuessTurn{GuessTurn: &pb.GuessTurn{Categories: closedCategories(s)}},
	}
}

// result is the scored round, the same for everyone.
func result(s *state) *pb.WavelengthServerMessage {
	over := s.matchOver()
	r := &pb.Result{
		PsychicId:   s.psychicID,
		Secret:      int32(s.secret),
		Guess:       int32(s.guess),
		PsychicWon:  s.guess == s.secret,
		GiverIds:    append([]string(nil), s.givers...),
		Round:       int32(s.round),
		TotalRounds: int32(s.totalRounds()),
		MatchOver:   over,
		Categories:  closedCategories(s),
	}
	for _, row := range standings(s) {
		r.Scores = append(r.Scores, &pb.ScoreEntry{PlayerId: row.playerID, Score: row.score, Delta: row.delta})
	}
	if over {
		r.WinnerIds = leaders(s)
	} else {
		r.NextPsychicId = s.queue[0]
	}
	return &pb.WavelengthServerMessage{Body: &pb.WavelengthServerMessage_Result{Result: r}}
}

// closedCategories is every category whose answers are all in, for the wire.
// The open one, during phaseAnswer, is left out: its answers are still secret.
func closedCategories(s *state) []*pb.Category {
	out := make([]*pb.Category, 0, len(s.categories))
	for _, c := range s.categories {
		if c.answers == nil {
			continue // still open
		}
		pc := &pb.Category{Name: c.name}
		for _, a := range c.answers {
			pc.Answers = append(pc.Answers, &pb.Answer{PlayerId: a.playerID, Text: a.text})
		}
		out = append(out, pc)
	}
	return out
}
