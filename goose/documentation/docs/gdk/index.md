---
title: GDK Overview
sidebar_label: Overview
description: Build on mayhem with the SDK and ACP.
---

# GDK

The mayhem Development Kit (GDK) provides the core components developers need to
build agentic applications, including agent orchestration, model access, context
management, tools, memory, remote execution, automations, and routing. There are
two ways to use it:

- [SDK](/docs/gdk/sdk) — use mayhem's native Rust crates or the shared
  provider bindings for Python and Kotlin as in-process libraries.
- [ACP](/docs/gdk/acp) — connect to mayhem as a separate agent process over
  stdio, HTTP, or WebSocket.

For Rust, start with the crate documentation on docs.rs:
[`mayhem-agent`](https://docs.rs/mayhem-agent/latest/mayhem_agent/),
[`mayhem-providers`](https://docs.rs/mayhem-providers/latest/mayhem_providers/), and
[`mayhem-context-management`](https://docs.rs/mayhem-context-management/latest/mayhem_context_management/).
See the [Rust API reference](/docs/gdk/sdk/api-reference#rust-api-reference) for
the full list of GDK crates.
