package fibblash

import (
	"math/rand/v2"
	"strings"
)

// choiceIDs labels choices in the order they are shown. The labels are handed
// out after shuffling, so "A" says nothing about who wrote it or whether it is
// true. Thirteen covers twelve lies plus the truth.
const choiceIDs = "ABCDEFGHIJKLM"

// choiceKey is what two answers are compared by when merging duplicates.
// answerKey gives "" for an answer with no letters or digits ("!!!"), and two
// of those are not the same lie, so they fall back to their exact text.
func choiceKey(text string) string {
	if k := answerKey(text); k != "" {
		return k
	}
	return "raw:" + strings.ToLower(text)
}

// buildBallot is the REAL / HYBRID ballot: every lie, with duplicates merged
// into one choice that credits all of its authors, plus the truth, shuffled.
//
// order is the authors in the order they answered, so a merged lie shows the
// first author's spelling. A lie can never merge with the truth: a lie matching
// the truth was refused when it was submitted (see isTruth).
func buildBallot(order []string, answers map[string]string, truth string, r *rand.Rand) []choice {
	var out []choice
	byKey := make(map[string]int) // key -> index into out
	for _, id := range order {
		text := answers[id]
		key := choiceKey(text)
		if i, ok := byKey[key]; ok {
			out[i].authors = append(out[i].authors, id)
			continue
		}
		byKey[key] = len(out)
		out = append(out, choice{text: text, authors: []string{id}})
	}
	out = append(out, choice{text: truth, truth: true})
	return label(shuffled(out, r))
}

// pairUp splits the players who answered a CREATIVE prompt into matchups:
// pairs, with one trio when the count is odd. Fewer than two answers make no
// matchup at all, since there is nothing to compare.
func pairUp(authors []string, r *rand.Rand) [][]string {
	if len(authors) < 2 {
		return nil
	}
	ids := append([]string(nil), authors...)
	r.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })

	var groups [][]string
	if len(ids)%2 == 1 {
		groups = append(groups, ids[:3])
		ids = ids[3:]
	}
	for len(ids) > 0 {
		groups = append(groups, ids[:2])
		ids = ids[2:]
	}
	return groups
}

// buildMatchups turns the CREATIVE answers into matchups, each with its own
// shuffled, labelled choices and its own voters.
//
// Who may vote follows the spec: nobody votes for their own answer, and in a
// trio each author votes for one of the other two. In a pair an author's only
// legal vote would be their opponent, which says nothing, so pair authors sit
// that matchup out and everyone else votes.
func buildMatchups(present []string, order []string, answers map[string]string, r *rand.Rand) []matchup {
	groups := pairUp(order, r)
	out := make([]matchup, 0, len(groups))
	for _, g := range groups {
		cs := make([]choice, 0, len(g))
		for _, id := range g {
			cs = append(cs, choice{text: answers[id], authors: []string{id}})
		}
		var voters []string
		for _, id := range present {
			if len(g) == 2 && indexOf(g, id) >= 0 {
				continue
			}
			voters = append(voters, id)
		}
		out = append(out, matchup{
			choices: label(shuffled(cs, r)),
			voters:  voters,
			votes:   make(map[string]string),
		})
	}
	return out
}

// shuffled returns a shuffled copy of cs.
func shuffled(cs []choice, r *rand.Rand) []choice {
	out := append([]choice(nil), cs...)
	r.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

// label gives each choice its letter, in order. It writes into cs, which the
// callers above have just made.
func label(cs []choice) []choice {
	for i := range cs {
		cs[i].id = string(choiceIDs[i])
	}
	return cs
}

// findChoice returns the choice with this id, if there is one.
func findChoice(cs []choice, id string) (choice, bool) {
	for _, c := range cs {
		if c.id == id {
			return c, true
		}
	}
	return choice{}, false
}
