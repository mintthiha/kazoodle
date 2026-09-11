// Command server starts the party-games session server: an HTTP service that
// speaks the wire protocol over WebSockets at /ws.
//
// This file only wires components together. All behaviour lives in the internal
// packages.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/mintthiha/party-games/server/internal/game"
	"github.com/mintthiha/party-games/server/internal/games/imposter"
	"github.com/mintthiha/party-games/server/internal/room"
	"github.com/mintthiha/party-games/server/internal/ws"
)

func main() {
	addr := envOr("PG_ADDR", ":8080")
	origins := splitList(envOr("PG_ALLOWED_ORIGINS", "localhost:5173"))

	// ctx is cancelled on Ctrl-C / SIGTERM. It is the parent of every room
	// goroutine and every connection, so a clean shutdown unwinds them too.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	games := game.NewRegistry()
	games.Register("imposter", imposter.New())

	mgr := room.NewManager(ctx, games)

	mux := http.NewServeMux()
	mux.Handle("/ws", ws.Handler(ctx, mgr, origins))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Shut the HTTP server down when the signal context is cancelled.
	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutCtx); err != nil {
			log.Printf("server shutdown: %v", err)
		}
	}()

	log.Printf("listening on %s (websocket at /ws), allowed origins: %v", addr, origins)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
	log.Print("stopped")
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// splitList parses a comma-separated env value into a trimmed, non-empty slice.
func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
