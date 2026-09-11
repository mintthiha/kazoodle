package room

import "errors"

// ErrRoomNotFound is returned when no live room has the given code — whether it
// never existed or it has already emptied out and been torn down.
var ErrRoomNotFound = errors.New("room not found")

// ErrNoRoomCode is returned when the manager could not allocate an unused room
// code after several tries. In practice this only happens if a huge number of
// rooms are live at once.
var ErrNoRoomCode = errors.New("could not allocate a room code")

// Game-control errors, all reported back to the acting client.
var (
	// ErrNotHost — a non-host tried to start a game.
	ErrNotHost = errors.New("only the host can start a game")
	// ErrGameInProgress — StartGame while a game is already running.
	ErrGameInProgress = errors.New("a game is already in progress")
	// ErrUnknownGame — StartGame named a game the server has not registered.
	ErrUnknownGame = errors.New("unknown game")
	// ErrNoActiveGame — a GameAction arrived with no game running.
	ErrNoActiveGame = errors.New("no game is in progress")
	// ErrWrongGame — a GameAction's game_id does not match the running game.
	ErrWrongGame = errors.New("game_id does not match the running game")
)
