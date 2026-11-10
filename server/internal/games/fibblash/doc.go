// Package fibblash is Fibblash: a trivia-and-comedy party game played on
// phones, with an optional main screen. Each question is one of three kinds —
// REAL (write a believable lie, find the truth), CREATIVE (write the funniest
// answer, win head-to-head votes) or HYBRID (both) — drawn at random, and the
// scores carry across all of them.
//
// The package is pure game logic: it implements game.Game and game.Leaver and
// never touches a socket or a goroutine. Time is the room's job: every phase
// returns a game.Timer, and the room hands its expiry back as an event.
//
// Where things live: flow.go is the state machine (what ending a phase leads
// to, what entering one announces); fibblash.go takes player actions and host
// controls; plan.go picks the questions; ballot.go builds what is voted on;
// score.go awards points and ranks the table; text.go cleans and compares
// answers; messages.go is the wire; bank.go is the questions themselves.
package fibblash
