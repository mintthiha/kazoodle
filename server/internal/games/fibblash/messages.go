package fibblash

import (
	"sort"

	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

// The builders below turn state into wire messages. Two rules hold for all of
// them, and they are why each one only reads the fields it does:
//
//   - A broadcast never says who wrote an answer, or which answer is true,
//     until the votes that depend on it are closed.
//   - A private message only tells a player about themselves.

func seconds(s *state) int32 {
	return int32(s.times.of(s.phase).Seconds())
}

func questionIntro(s *state) *pb.FibblashServerMessage {
	q := s.q()
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_QuestionIntro{QuestionIntro: &pb.QuestionIntro{
		Number:    int32(s.index + 1),
		Total:     int32(len(s.questions)),
		Kind:      q.kind,
		Category:  q.category,
		Prompt:    q.prompt.in(s.locale),
		Seconds:   seconds(s),
		PlayerIds: append([]string(nil), s.present...),
	}}}
}

func answerPhase(s *state) *pb.FibblashServerMessage {
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_AnswerPhase{AnswerPhase: &pb.AnswerPhase{
		Seconds:   seconds(s),
		MaxLength: maxAnswerLength,
	}}}
}

// answerProgress says who has answered, never what. Join order, not map order,
// so it reads the same on every screen.
func answerProgress(s *state) *pb.FibblashServerMessage {
	var answered []string
	for _, id := range s.present {
		if _, ok := s.answers[id]; ok {
			answered = append(answered, id)
		}
	}
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_AnswerProgress{AnswerProgress: &pb.AnswerProgress{
		AnsweredIds: answered,
		Total:       int32(len(s.present)),
	}}}
}

func yourAnswer(text string) *pb.FibblashServerMessage {
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_YourAnswer{YourAnswer: &pb.YourAnswer{Text: text}}}
}

// votePhase opens the current vote. Choices go out as id and text only.
func votePhase(s *state) *pb.FibblashServerMessage {
	b := s.ballot()
	vp := &pb.VotePhase{Vote: b.kind, Seconds: seconds(s)}
	for _, c := range b.choices {
		vp.Choices = append(vp.Choices, &pb.Choice{Id: c.id, Text: c.text})
	}
	if b.kind == pb.VoteKind_VOTE_KIND_MATCHUP {
		vp.Matchup = int32(s.current + 1)
		vp.Matchups = int32(len(s.matchups))
	}
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_VotePhase{VotePhase: vp}}
}

// yourBallot tells one player what they may do in the open vote.
func yourBallot(s *state, playerID string) *pb.FibblashServerMessage {
	b := s.ballot()
	yb := &pb.YourBallot{CanVote: indexOf(b.voters, playerID) >= 0}
	for _, c := range b.choices {
		if c.wrote(playerID) {
			yb.OwnChoiceIds = append(yb.OwnChoiceIds, c.id)
		}
	}
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_YourBallot{YourBallot: yb}}
}

// voteProgress is counts only. In a matchup, the list of who has voted would
// show who has not, and in a pair that is the two authors.
func voteProgress(s *state) *pb.FibblashServerMessage {
	b := s.ballot()
	voted, total := b.progress(s)
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_VoteProgress{VoteProgress: &pb.VoteProgress{
		Voted: int32(voted),
		Total: int32(total),
	}}}
}

func yourVote(choiceID string) *pb.FibblashServerMessage {
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_YourVote{YourVote: &pb.YourVote{ChoiceId: choiceID}}}
}

// revealed is a ballot's choices with their authors and votes, now that the
// votes are closed.
func revealed(choices []choice, votes, funny map[string]string) []*pb.RevealedChoice {
	out := make([]*pb.RevealedChoice, 0, len(choices))
	for _, c := range choices {
		out = append(out, &pb.RevealedChoice{
			Id:            c.id,
			Text:          c.text,
			AuthorIds:     append([]string(nil), c.authors...),
			Truth:         c.truth,
			VoterIds:      votersFor(votes, c.id),
			FunnyVoterIds: votersFor(funny, c.id),
		})
	}
	return out
}

// votersFor is who voted for choiceID, sorted so the order is stable.
func votersFor(votes map[string]string, choiceID string) []string {
	var out []string
	for voter, id := range votes {
		if id == choiceID {
			out = append(out, voter)
		}
	}
	sort.Strings(out)
	return out
}

func wireAwards(awards []award) []*pb.Award {
	out := make([]*pb.Award, 0, len(awards))
	for _, a := range awards {
		out = append(out, &pb.Award{
			PlayerId: a.playerID,
			Points:   int32(a.points),
			Reason:   a.reason,
			Count:    int32(a.count),
		})
	}
	return out
}

func matchupResult(s *state) *pb.FibblashServerMessage {
	m := s.matchups[s.current]
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_MatchupResult{MatchupResult: &pb.MatchupResult{
		Matchup:   int32(s.current + 1),
		Matchups:  int32(len(s.matchups)),
		Choices:   revealed(m.choices, m.votes, nil),
		WinnerIds: winners(m.choices, m.votes),
		Awards:    wireAwards(s.awards),
		Seconds:   seconds(s),
	}}}
}

// questionResult reveals a REAL or HYBRID question: the truth, who wrote each
// lie, who fell for it, and the points.
func questionResult(s *state) *pb.FibblashServerMessage {
	q := s.q()
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_QuestionResult{QuestionResult: &pb.QuestionResult{
		Kind:        q.kind,
		Answer:      q.answer.in(s.locale),
		Explanation: q.explanation.in(s.locale),
		Source:      q.source,
		Choices:     revealed(s.choices, s.truthVotes, s.funnyVotes),
		Awards:      wireAwards(s.awards),
		Seconds:     seconds(s),
	}}}
}

func wireStandings(rows []standing, withDeltas bool) []*pb.Standing {
	out := make([]*pb.Standing, 0, len(rows))
	for _, r := range rows {
		st := &pb.Standing{PlayerId: r.playerID, Score: int32(r.score), Rank: int32(r.rank)}
		if withDeltas {
			st.Delta = int32(r.delta)
		}
		out = append(out, st)
	}
	return out
}

func leaderboard(s *state) *pb.FibblashServerMessage {
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_Leaderboard{Leaderboard: &pb.Leaderboard{
		Number:    int32(s.index + 1),
		Total:     int32(len(s.questions)),
		Standings: wireStandings(standings(s), true),
		TopIds:    topScorers(s),
		Skipped:   s.skipped,
		Seconds:   seconds(s),
	}}}
}

func finalResult(s *state) *pb.FibblashServerMessage {
	return &pb.FibblashServerMessage{Body: &pb.FibblashServerMessage_FinalResult{FinalResult: &pb.FinalResult{
		Standings:  wireStandings(standings(s), false),
		WinnerIds:  leaders(s),
		EndedEarly: s.endedEarly,
	}}}
}
