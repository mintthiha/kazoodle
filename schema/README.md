# schema

The party-games wire protocol. The `.proto` files are the single source of
truth; both the Go server and the TypeScript web client use **generated** types,
never hand-written ones.

Messages travel over the WebSocket as **proto3 canonical JSON**. Game-specific
messages are carried inside the core protocol's `GameEvent` / `GameAction`
envelopes as a JSON string.

## Layout

One buf module per protocol surface — the core session protocol, and one per
game:

```
proto/core/protocol.proto            # package partygames.v1
proto/games/imposter/imposter.proto  # package imposter.v1
buf.yaml                             # workspace: lists the modules, lint config
buf.gen.core.yaml                    # codegen for the core module
buf.gen.imposter.yaml                # codegen for the imposter module
```

Generated output (do not edit by hand):

```
../server/internal/protocol/protocol.pb.go
../web/src/net/gen/protocol_pb.ts
../server/internal/games/imposter/pb/imposter.pb.go
../web/src/games/imposter/gen/imposter_pb.ts
```

## Adding a game

1. `proto/games/<name>/<name>.proto`, package `<name>.v1`, with a
   `<Name>ServerMessage` / `<Name>ClientMessage` oneof envelope.
2. Add the module to `buf.yaml`.
3. Copy `buf.gen.imposter.yaml` to `buf.gen.<name>.yaml`, point its `inputs` and
   `out` paths at the new module.
4. Add a `buf generate --template buf.gen.<name>.yaml` step to the `generate`
   script in `package.json`.

## Regenerating

One-time tool setup:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6   # needs Go
npm install                                                       # buf + TS plugin
```

Then, from this directory:

```bash
npm run generate
```

Each `buf.gen.*.yaml` has `clean: true`, so a run wipes and rewrites its own
output directories.

## CI

The `schema` job runs `npm run generate` and fails if `git status` shows any
change under the generated directories — that means the checked-in generated
code is stale relative to the `.proto` files (or was never committed).
