package fibblash

import (
	"sort"

	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

// Points, from the spec.
const (
	pointsTruth  = 1000 // voting for the truth
	pointsFooled = 500  // per player your lie fooled
	pointsVote   = 250  // per funny vote (HYBRID) or matchup vote (CREATIVE)
	pointsSweep  = 500  // a matchup answer that took every vote
)

// scoreTruth is what the truth vote awards: pointsTruth to everyone who found
// the truth, and pointsFooled to each author of a lie for every player who
// picked it. A player can earn both. Players who did not vote earn nothing for
// voting, but their lie can still fool others.
func scoreTruth(choices []choice, votes map[string]string) []award {
	var found []string
	fooled := make(map[string]int)
	for voter, id := range votes {
		c, ok := findChoice(choices, id)
		if !ok {
			continue
		}
		if c.truth {
			found = append(found, voter)
			continue
		}
		for _, a := range c.authors {
			fooled[a]++
		}
	}
	// votes is a map, and Go deliberately randomizes map iteration order, so
	// sort before building anything a test or a screen will read in order.
	sort.Strings(found)

	var out []award
	for _, id := range found {
		out = append(out, award{playerID: id, points: pointsTruth, reason: pb.AwardReason_AWARD_REASON_FOUND_TRUTH})
	}
	for _, id := range sortedKeys(fooled) {
		n := fooled[id]
		out = append(out, award{playerID: id, points: n * pointsFooled, reason: pb.AwardReason_AWARD_REASON_FOOLED, count: n})
	}
	return out
}

// scoreVotes is what a popularity vote awards: pointsVote to each author of a
// choice, per vote it got. A vote for the truth (HYBRID's funny vote) has no
// author and so scores nobody.
func scoreVotes(choices []choice, votes map[string]string) []award {
	got := make(map[string]int)
	for _, id := range votes {
		c, ok := findChoice(choices, id)
		if !ok {
			continue
		}
		for _, a := range c.authors {
			got[a]++
		}
	}
	var out []award
	for _, id := range sortedKeys(got) {
		n := got[id]
		out = append(out, award{playerID: id, points: n * pointsVote, reason: pb.AwardReason_AWARD_REASON_VOTES, count: n})
	}
	return out
}

// scoreMatchup is what one CREATIVE matchup awards: pointsVote per vote, and
// pointsSweep to an answer that took every vote from everyone who could vote.
// A sweep needs at least two voters: winning the only vote there was is not
// much of a landslide.
func scoreMatchup(m matchup) []award {
	out := scoreVotes(m.choices, m.votes)
	if len(m.voters) < 2 || len(m.votes) != len(m.voters) {
		return out
	}
	for _, c := range m.choices {
		if tally(m.votes, c.id) == len(m.voters) {
			for _, a := range c.authors {
				out = append(out, award{playerID: a, points: pointsSweep, reason: pb.AwardReason_AWARD_REASON_SWEEP})
			}
		}
	}
	return out
}

// tally counts the votes for one choice.
func tally(votes map[string]string, choiceID string) int {
	n := 0
	for _, id := range votes {
		if id == choiceID {
			n++
		}
	}
	return n
}

// winners is the choice ids with the most votes, in ballot order. Empty when
// nobody voted. Plural because a tie is a shared win.
func winners(choices []choice, votes map[string]string) []string {
	best := 0
	for _, c := range choices {
		if n := tally(votes, c.id); n > best {
			best = n
		}
	}
	if best == 0 {
		return nil
	}
	var out []string
	for _, c := range choices {
		if tally(votes, c.id) == best {
			out = append(out, c.id)
		}
	}
	return out
}

// apply adds awards to the running scores and to this question's deltas. It
// changes the state it is handed, so callers pass a clone they own.
func (s *state) apply(awards []award) {
	for _, a := range awards {
		s.scores[a.playerID] += a.points
		s.deltas[a.playerID] += a.points
	}
	s.awards = awards
}

// standing is one row of the leaderboard before it becomes a wire message.
type standing struct {
	playerID string
	score    int
	delta    int
	rank     int
}

// standings ranks the whole roster by score, highest first. Equal scores keep
// join order, so two players on the same score never swap places between
// questions, and they share a rank: 1, 1, 3. Nothing is broken at random.
//
// Players who left keep their row: their points were earned, and the table saw
// them earn them.
func standings(s *state) []standing {
	rows := make([]standing, len(s.roster))
	for i, id := range s.roster {
		rows[i] = standing{playerID: id, score: s.scores[id], delta: s.deltas[id]}
	}
	// SliceStable keeps equal scores in roster (join) order.
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].score > rows[j].score })
	for i := range rows {
		if i > 0 && rows[i].score == rows[i-1].score {
			rows[i].rank = rows[i-1].rank
		} else {
			rows[i].rank = i + 1
		}
	}
	return rows
}

// topScorers is whoever earned the most on this question, among the players
// still here, in join order. Empty if nobody scored.
func topScorers(s *state) []string {
	return best(s.present, s.deltas)
}

// leaders is whoever has the highest total among the players still here. A
// tie is shared. Empty if nobody has scored.
func leaders(s *state) []string {
	return best(s.present, s.scores)
}

// best is the ids in ids with the highest positive value in points.
func best(ids []string, points map[string]int) []string {
	top := 0
	for _, id := range ids {
		if points[id] > top {
			top = points[id]
		}
	}
	if top == 0 {
		return nil
	}
	var out []string
	for _, id := range ids {
		if points[id] == top {
			out = append(out, id)
		}
	}
	return out
}

func sortedKeys(m map[string]int) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
