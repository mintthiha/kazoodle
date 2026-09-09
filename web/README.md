# web

The browser client: React + Vite + TypeScript, mobile-first. Two screens so
far — join a room, then a lobby that shows who's connected and can round-trip a
test message. No games yet.

## Run

```bash
npm install
npm run dev            # http://localhost:5173
```

Needs the Go server running on `:8080` (see ../server). The client connects
straight to `ws://<host>:8080/ws` — there is no HTTP proxy. Override with
`VITE_WS_URL` if the server is elsewhere.

## Checks

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest run
npm run build          # tsc + vite build
```

## Layout

```
src/
  net/                 the ONLY place that touches the socket
    gen/protocol_pb.ts   generated wire types (do not edit; see ../schema)
    messages.ts          encode/decode wire frames using the generated schema
    backoff.ts           exponential backoff with jitter (pure)
    connection.ts        one socket, reconnect, roster state, immutable snapshot
    useConnection.ts     React hook over a single app-wide Connection
  i18n/
    messages.ts          en + fr catalogues and the pure translate()
    index.tsx            <LocaleProvider> and useT()
  screens/
    JoinScreen.tsx        name + create / join by code
    LobbyScreen.tsx       room code, player list, echo box, leave
    ConnBanner.tsx        connecting / reconnecting / disconnected strip
  App.tsx                picks the screen from the connection snapshot
  main.tsx               entry
```

### Conventions (see ../CLAUDE.md)

- Components never open a socket or parse a frame — they use `useConnection()`.
- Wire types are always imported from `net/gen`, never hand-written.
- Every screen has a visible reconnecting state; a dropped connection is normal.
- Every user-facing string goes through `t()`; English and French ship together.

### Known gaps (intentional, pre-alpha)

- On reconnect the client re-sends its join, so the server issues a **new**
  player. True session restore (same identity) is an open design question.
- The single `Connection` is created once and never torn down on unmount — fine
  for a one-page app, revisit if routing is added.
