package fibblash

import (
	"math/rand/v2"

	"github.com/mintthiha/party-games/server/internal/games/fibblash/pb"
)

// How many questions a match has, before the bank's own limits.
const (
	defaultQuestions = 12
	minQuestions     = 3
	maxQuestions     = 20
)

// kindWeights is how often each kind is drawn, out of 100.
var kindWeights = []struct {
	kind   pb.Kind
	weight int
}{
	{kindReal, 40},
	{kindCreative, 30},
	{kindHybrid, 30},
}

// maxRun is the longest stretch of one kind in a row.
const maxRun = 2

// planAttempts bounds the random search in planKinds. Each attempt almost
// always succeeds; the bound only guarantees the loop ends.
const planAttempts = 200

// questionCount turns StartOptions.questions into how many questions to play.
func questionCount(requested int32) int {
	switch {
	case requested <= 0:
		return defaultQuestions
	case requested < minQuestions:
		return minQuestions
	case requested > maxQuestions:
		return maxQuestions
	default:
		return int(requested)
	}
}

// planMatch picks the questions for a whole match, up front: n of them, no
// question twice, kinds drawn by kindWeights with no more than maxRun of one
// kind in a row, and every kind at least once when n allows it. It returns
// fewer than n only when the bank runs out.
//
// The plan is made at the start rather than one question at a time so that the
// rules above are easy to guarantee and to test: they are properties of a
// list, not of a sequence of separate random draws.
//
// r is passed in rather than taken from the global source so a test can seed
// it and get the same match every time.
func planMatch(bank []question, n int, r *rand.Rand) []question {
	pools := make(map[pb.Kind][]question)
	for _, q := range bank {
		pools[q.kind] = append(pools[q.kind], q)
	}
	// Shuffle each pool once and deal from the front: drawing without
	// replacement is what keeps a question from appearing twice.
	//
	// The pools are visited in kindWeights' fixed order, not by ranging over
	// the map. Go randomizes map iteration order on purpose, so ranging over
	// pools would shuffle them in a different order each run and the same seed
	// would give a different match.
	for _, kw := range kindWeights {
		shuffled := append([]question(nil), pools[kw.kind]...)
		r.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })
		pools[kw.kind] = shuffled
	}

	avail := make(map[pb.Kind]int, len(pools))
	total := 0
	for k, pool := range pools {
		avail[k] = len(pool)
		total += len(pool)
	}
	if n > total {
		n = total
	}

	kinds := planKinds(n, avail, r)
	out := make([]question, 0, len(kinds))
	next := make(map[pb.Kind]int)
	for _, k := range kinds {
		out = append(out, pools[k][next[k]])
		next[k]++
	}
	return out
}

// planKinds lays out which kind each of n questions is. avail is how many
// questions of each kind the bank holds, and no kind is used more often than
// that.
func planKinds(n int, avail map[pb.Kind]int, r *rand.Rand) []pb.Kind {
	for attempt := 0; attempt < planAttempts; attempt++ {
		if kinds, ok := tryPlan(n, avail, r); ok && coversAll(kinds, n, avail) {
			return kinds
		}
	}
	return fallbackPlan(n, avail)
}

// tryPlan makes one random draw of a plan. It fails when it paints itself
// into a corner: every kind left would break the run rule or is used up.
func tryPlan(n int, avail map[pb.Kind]int, r *rand.Rand) ([]pb.Kind, bool) {
	left := make(map[pb.Kind]int, len(avail))
	for k, v := range avail {
		left[k] = v
	}
	kinds := make([]pb.Kind, 0, n)
	for len(kinds) < n {
		// The weighted options still allowed at this position.
		sum := 0
		for _, kw := range kindWeights {
			if left[kw.kind] > 0 && !wouldRun(kinds, kw.kind) {
				sum += kw.weight
			}
		}
		if sum == 0 {
			return nil, false
		}
		pick := r.IntN(sum)
		for _, kw := range kindWeights {
			if left[kw.kind] == 0 || wouldRun(kinds, kw.kind) {
				continue
			}
			if pick < kw.weight {
				kinds = append(kinds, kw.kind)
				left[kw.kind]--
				break
			}
			pick -= kw.weight
		}
	}
	return kinds, true
}

// wouldRun reports whether adding k to kinds would make more than maxRun of
// it in a row.
func wouldRun(kinds []pb.Kind, k pb.Kind) bool {
	if len(kinds) < maxRun {
		return false
	}
	for _, prev := range kinds[len(kinds)-maxRun:] {
		if prev != k {
			return false
		}
	}
	return true
}

// coversAll reports whether every kind the bank has appears in kinds, as long
// as there are enough questions for that to be possible.
func coversAll(kinds []pb.Kind, n int, avail map[pb.Kind]int) bool {
	need := 0
	for _, v := range avail {
		if v > 0 {
			need++
		}
	}
	if n < need {
		return true // too short to have one of each; nothing to check
	}
	seen := make(map[pb.Kind]bool)
	for _, k := range kinds {
		seen[k] = true
	}
	return len(seen) == need
}

// fallbackPlan is a deterministic plan for when random draws keep failing,
// which only a lopsided bank causes: cycle through the kinds in weight order,
// skipping any that has run out.
func fallbackPlan(n int, avail map[pb.Kind]int) []pb.Kind {
	left := make(map[pb.Kind]int, len(avail))
	for k, v := range avail {
		left[k] = v
	}
	var kinds []pb.Kind
	for len(kinds) < n {
		added := false
		for _, kw := range kindWeights {
			if len(kinds) < n && left[kw.kind] > 0 {
				kinds = append(kinds, kw.kind)
				left[kw.kind]--
				added = true
			}
		}
		if !added {
			break
		}
	}
	return kinds
}
