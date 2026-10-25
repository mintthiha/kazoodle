package game

import "fmt"

// Rejected is the error a game returns when it refuses an action for a reason
// the acting player can understand and fix — an empty clue, a clue that gives
// the secret word away, speaking out of turn. It is not for bugs: a malformed
// payload or an impossible state is an ordinary error.
//
// Code is the part that matters. It is stable and machine-readable, so the
// platform can hand it to the client and the client can look up a translated
// sentence for it. The Error() string is for server logs and for tests; it is
// English and must never be shown to a player, because the server does not
// know what language that player is reading in.
type Rejected struct {
	// Code is a short snake_case id, namespaced by game: "imposter.clue_empty".
	Code string
	// Reason is the English explanation, for logs.
	Reason string
}

// Error makes Rejected an error. The pointer receiver is deliberate: callers
// return &Rejected{...}, and errors.As looks for *Rejected.
func (r *Rejected) Error() string { return r.Reason }

// Reject builds a *Rejected. The format arguments make the log line specific
// ("not p3's turn") while Code stays constant for the client to translate.
func Reject(code, format string, args ...any) error {
	return &Rejected{Code: code, Reason: fmt.Sprintf(format, args...)}
}
