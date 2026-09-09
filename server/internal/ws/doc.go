// Package ws serves the wire protocol over WebSockets.
//
// One connection runs three goroutines: a read pump (client -> server), a write
// pump (server -> client), and a heartbeat. Outbound messages pass through a
// small buffered channel so that one slow client cannot stall a room; if that
// buffer fills, the connection is dropped rather than allowed to back up.
//
// All three goroutines watch a single connection context. Any of them
// cancelling it — a read error, a failed write, a missed heartbeat — tears the
// whole connection down.
package ws
