---
sidebar_position: 1
title: SDK
sidebar_label: Overview
description: Build with the native Rust GDK crates or shared provider bindings for Python and Kotlin.
---

# SDK

The SDK provides native Rust crates for agent orchestration, model providers,
and context management. Python and Kotlin access the provider layer through
shared bindings, so you can call models, stream completions, and compact
conversations from your own application.

For Rust, the primary API reference is the crate documentation on docs.rs:

- [`mayhem-agent`](https://docs.rs/mayhem-agent/latest/mayhem_agent/) — agent state machine and tools
- [`mayhem-providers`](https://docs.rs/mayhem-providers/latest/mayhem_providers/) — model providers
- [`mayhem-context-management`](https://docs.rs/mayhem-context-management/latest/mayhem_context_management/) — conversation compaction
- [All GDK crates](/docs/gdk/sdk/api-reference#rust-api-reference)

The `mayhem-sdk` crate is the source of the Python and Kotlin bindings, generated
with [UniFFI](https://github.com/mozilla/uniffi-rs). The
[shared bindings reference](/docs/gdk/sdk/api-reference#shared-bindings-reference)
documents that API in Python, Kotlin, and Rust; it does not cover the full native
Rust GDK API. The installation and examples below focus on this shared bindings
layer.

:::info Alpha
The SDK is in alpha. The surface may change between `0.x` releases. Pin an
exact version and select the matching version on docs.rs or in the shared
bindings reference when upgrading.
:::

## What you can do

- Construct providers for OpenAI, Anthropic, Groq, Databricks, or any
  [declarative provider](#declarative-providers) defined in JSON
- Stream a completion chunk by chunk, including tool calls and reasoning output
- Request a single non-streaming completion
- Compact a long conversation into a summary so it can continue past the
  model's context window
- Capture provider request logs as JSONL

## Install

<!-- prettier-ignore-start -->

### Rust

For native Rust, depend directly on the
[GDK crates](/docs/gdk/sdk/api-reference#rust-api-reference) your application needs
and follow their docs.rs documentation. To use the shared bindings API from Rust:

```bash
cargo add mayhem-sdk --features uniffi
```

The `uniffi` feature enables the in-process provider API documented here.

### Python

```bash
pip install mayhem-sdk
```

The package installs as `mayhem-sdk` and imports as `mayhem`. Wheels bundle the
native library, so there is nothing else to build. Requires Python 3.9+.

```python
import mayhem
```

### Kotlin / JVM

```kotlin
dependencies {
    implementation("io.github.aaif-mayhem:gdk:<version>")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
}
```

The artifact version matches the Rust crate version. Classes live in the
`io.github.aaif_mayhem` package. The jar bundles native libraries for
macOS (arm64, x86-64), Linux (arm64, x86-64), and Windows (x86-64).

On JDK 24+, add `--enable-native-access=ALL-UNNAMED` because the GDK loads its
native library through JNA.

<!-- prettier-ignore-end -->

## Quickstart

Each example builds a provider, sends one message, and prints the streamed
response.

### Python

```python
import asyncio
from mayhem import (
    MessageContent,
    MessageRole,
    ProviderMessage,
    ProviderModelConfig,
    StreamChunk,
    openai_default_model,
    openai_provider,
)


async def main() -> None:
    provider = openai_provider(api_key="...")
    model = ProviderModelConfig(model_name=openai_default_model())
    messages = [
        ProviderMessage(
            role=MessageRole.USER,
            content=[MessageContent.Text(text="What is the capital of France?")],
        )
    ]

    stream = await provider.stream(model, "You are a geography expert.", messages, [])
    while chunk := await stream.next_chunk():
        if isinstance(chunk, StreamChunk.TextChunk):
            print(chunk.text, end="")


asyncio.run(main())
```

### Kotlin

```kotlin
import io.github.aaif_mayhem.MessageContent
import io.github.aaif_mayhem.MessageRole
import io.github.aaif_mayhem.ProviderMessage
import io.github.aaif_mayhem.ProviderModelConfig
import io.github.aaif_mayhem.StreamChunk
import io.github.aaif_mayhem.streamFlow
import io.github.aaif_mayhem.providers.openai.defaultModel
import io.github.aaif_mayhem.providers.openai.provider as openAiProvider
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    val provider = openAiProvider(System.getenv("OPENAI_API_KEY"))
    val model = ProviderModelConfig(modelName = defaultModel())
    val messages = listOf(
        ProviderMessage(
            role = MessageRole.USER,
            content = listOf(MessageContent.Text(text = "What is the capital of France?")),
        ),
    )

    provider.streamFlow(model, "You are a geography expert.", messages)
        .collect { chunk ->
            if (chunk is StreamChunk.TextChunk) print(chunk.text)
        }
}
```

### Rust

```rust
use mayhem_sdk::bindings::{
    openai_default_model, openai_provider, MessageContent, MessageRole, ProviderMessage,
    ProviderModelConfig, StreamChunk,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let provider = openai_provider(std::env::var("OPENAI_API_KEY")?)?;
    let model = ProviderModelConfig {
        model_name: openai_default_model(),
        ..Default::default()
    };
    let messages = vec![ProviderMessage {
        role: MessageRole::User,
        content: vec![MessageContent::Text {
            text: "What is the capital of France?".to_string(),
        }],
    }];

    let stream = provider
        .stream(model, "You are a geography expert.".to_string(), messages, vec![])
        .await?;

    while let Some(chunk) = stream.next_chunk().await? {
        if let StreamChunk::TextChunk { text } = chunk {
            print!("{text}");
        }
    }
    Ok(())
}
```

## Kotlin idioms

The Kotlin package adds a few conveniences on top of the generated bindings:

| Kotlin API | Equivalent generated call |
| --- | --- |
| `provider.streamFlow(model, system, messages, tools)` | `stream(...)` plus a `nextChunk()` loop, as a `Flow<StreamChunk>` |
| `providers.openai.provider(apiKey)` | `openaiProvider(apiKey)` |
| `providers.openai.defaultModel()` | `openaiDefaultModel()` |
| `providers.anthropic.provider(apiKey, baseUrl, betaHeaders)` | `anthropicProvider(...)` |
| `providers.groq.provider(apiKey)` | `groqProvider(apiKey)` |
| `providers.databricks.provider(host, token)` | `databricksProvider(host, token)` |

`tools` defaults to an empty list in the Kotlin helpers, and suspending
functions map to Kotlin coroutines. Errors surface as `MayhemException`
subclasses.

## Declarative providers

Any provider that speaks an OpenAI- or Anthropic-compatible API can be defined
in JSON and loaded without new Rust code:

```python
provider = mayhem.declarative_provider_from_json(open("deepseek.json").read())
```

Environment variable placeholders such as `${DEEPSEEK_API_KEY}` in the JSON are
resolved when the provider is constructed.

## Streaming model

`stream()` returns a `ProviderStream`. Call `next_chunk()` until it returns
`None` to consume the response:

| Chunk | Meaning |
| --- | --- |
| `TextChunk` | Assistant text |
| `ToolChunk` | A tool call request with JSON arguments and the provider's tool-call `index` |
| `ThinkingChunk` / `RedactedThinkingChunk` | Reasoning output |
| `EndChunk` | Stream finished, carries final token `Usage` |
| `ErrorChunk` | Mid-stream failure, carries a `MayhemStreamError` |

Errors raised before the stream starts are thrown as `MayhemError`
(`MayhemException` in Kotlin). Errors that occur mid-stream arrive as an
`ErrorChunk` instead.
