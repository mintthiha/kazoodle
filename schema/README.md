# schema

The Kazoodle wire protocol. `proto/protocol.proto` is the single source of
truth; both the Go server and the TypeScript web client use **generated** types,
never hand-written ones.

Messages travel over the WebSocket as **proto3 canonical JSON**.

## Layout

```
proto/protocol.proto   # the protocol (package kazoodle.v1)
buf.yaml               # buf module + lint config
buf.gen.yaml           # codegen: Go -> ../server, TS -> ../web
```

Generated output (do not edit by hand):

```
../server/internal/protocol/protocol.pb.go
../web/src/net/gen/protocol_pb.ts
```

## Regenerating

One-time tool setup:

```bash
# Go plugin (needs the Go toolchain)
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6

# buf CLI + the TS plugin
npm install
```

Then, from this directory:

```bash
npm run generate
```

`buf.gen.yaml` has `clean: true`, so each run wipes and rewrites both output
directories.

## CI

CI should run `npm run generate` and fail if `git diff` is non-empty — that
means the checked-in generated code is stale relative to `protocol.proto`.
