---
sidebar_position: 1
title: Use mayhem as an ACP agent
sidebar_label: Overview
description: Build clients that connect to mayhem over stdio, HTTP, or WebSocket.
---

# Use mayhem as an ACP agent

Use the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) to build
clients that connect to mayhem's agent runtime, tools, extensions, and configured
models. These clients can be code editors, desktop, web, or mobile apps,
automated services, or other custom integrations.

For methods provided by mayhem in addition to the standard ACP methods, see the
[mayhem ACP Reference](/docs/gdk/acp/reference).

## Install

Choose one installation method based on how your ACP client runs mayhem.

### Install the mayhem CLI

Install the [mayhem CLI](/docs/getting-started/installation) to configure a client
to launch `mayhem acp` or to run `mayhem serve` yourself.

### Install from the ACP Registry

Supported ACP clients can install and manage mayhem for you through the
[mayhem entry in the ACP Registry](https://agentclientprotocol.com/get-started/registry#mayhem).
This does not require a separate mayhem CLI installation.

## Run the agent

### Connect over stdio

Configure your ACP client to launch mayhem as a subprocess with this command:

```bash
mayhem acp
```

The client communicates with mayhem through stdin and stdout and manages the
process for the lifetime of the connection.

### Connect over HTTP or WebSocket

Run `mayhem serve` when your ACP client connects over HTTP or WebSocket:

```bash
MAYHEM_SERVER__SECRET_KEY='a-long-random-secret' mayhem serve
```

`MAYHEM_SERVER__SECRET_KEY` sets the secret your clients use to authenticate.
When you run `mayhem serve` directly, it listens on `127.0.0.1:3284` and exposes
the ACP endpoint at `/acp`. To use a different address, pass `--host` and
`--port`.

#### Authentication

HTTP clients authenticate with the `X-Secret-Key` header. WebSocket clients can
use the same header, but browser-based WebSocket clients must pass the secret in
the `?token=` query parameter. Requests without the correct secret receive a
`401 Unauthorized` response.

:::warning Local development only
Passing `--dangerously-unauthenticated` starts `mayhem serve` without
authentication. Use it only when the server is isolated from untrusted traffic.
:::

#### Browser origins

Most clients do not need to configure origins. Browser-based clients served from
a non-loopback origin must allow that origin when starting mayhem. To allow both
a local development client and a deployed web client, specify both origins:

```bash
MAYHEM_SERVER__SECRET_KEY='a-long-random-secret' mayhem serve \
  --allowed-origin 'http://localhost:5173' \
  --allowed-origin 'https://app.example'
```

Specifying any `--allowed-origin` values replaces the default loopback origins,
so include every origin your clients need, including localhost origins used for
development. Origins must match exactly, including the scheme and port.

For remote deployment, TLS, and certificate setup, see
[Running a Remote mayhem Server](/docs/guides/remote-mayhem-server).
Run `mayhem serve --help` for the complete list of options.

## ACP client examples

### Clients over stdio

Browse the [official ACP clients directory](https://agentclientprotocol.com/get-started/clients)
for clients that can run local ACP agents. For a worked example of installing
and configuring mayhem as a stdio agent, see the
[Zed setup example](/docs/gdk/acp/zed).

### mayhem Desktop over WebSocket

[mayhem Desktop](https://github.com/aaif-mayhem/mayhem/tree/main/ui/desktop) is an
ACP client that uses WebSocket. It starts `mayhem serve` locally on an available
loopback port and connects to its `/acp` endpoint over WebSocket.
