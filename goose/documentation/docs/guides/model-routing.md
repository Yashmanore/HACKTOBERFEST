---
sidebar_position: 9
title: Local Model Routing
sidebar_label: Local Model Routing
description: Let mayhem pick the best locally installed Ollama model for every request
---

# Local Model Routing

The `router` provider sends each request to the best model installed in your local [Ollama](https://ollama.com). It looks at what the request needs and at what each model can do, then picks one. If that model fails before it starts answering, the router tries the next-best one.

## Setup

1. Install and start Ollama, then pull one or more chat models:

   ```bash
   ollama pull gemma4:e2b-it-qat
   ollama pull qwen3:0.6b
   ```

2. Point mayhem at the router in `config.yaml`:

   ```yaml
   MAYHEM_PROVIDER: router
   MAYHEM_MODEL: auto
   OLLAMA_HOST: http://localhost:11434
   ```

3. Start a session as usual with `mayhem session`.

The router asks Ollama for the installed models and their capabilities every 60 seconds, so newly pulled models are picked up automatically.

## How a model is chosen

For every request the router works out:

| Need | Detected from |
|---|---|
| **Tools** | The request offers tools to the model |
| **Vision** | A message or tool result contains an image |
| **Context** | Estimated size of the system prompt and conversation |
| **Difficulty** | The last user message is long, contains a code block, or uses words such as *explain*, *debug*, *refactor*, *design*, *review* or *why*, or the conversation is very large |

It then ranks the installed models:

1. Models that meet every hard need come first: tool support when tools are offered, vision for images, and a context window large enough for the input. Embedding-only models are never used.
2. **Simple requests** go to the *smallest* capable model, which is fastest and uses the least memory.
3. **Difficult requests** go to a *thinking*-capable model first, then the *largest* one.
4. Models that miss a need are kept at the end as a last resort.

## Fallback

If the chosen model fails **before it sends any output**, the router tries the next model in the ranking. That covers cases like Ollama being unreachable, a server error, a rate limit, a missing model or input that's too long for the model. Authentication and configuration errors are reported immediately, and the router never switches models in the middle of an answer.

## One model per turn

Once a model is chosen for a user message, the router keeps using it for every follow-up request in that turn, such as the requests after each tool call. This keeps tool-call formats and reasoning consistent. The next user message is routed again.

## Options

| Key | Default | Meaning |
|---|---|---|
| `MAYHEM_MODEL` | `auto` | `auto` lets the router choose. Set an installed model name to try that model first, with the others as fallbacks. |
| `MAYHEM_ROUTER_MODELS` | all installed | Comma-separated allowlist, for example `gemma4:e2b-it-qat,qwen3:0.6b` |
| `OLLAMA_HOST` | `localhost` | Where Ollama is running |

## Seeing the decisions

Every decision is written to the mayhem log with the chosen model, the reason, the model's capabilities and what the request needed:

```text
model router selected qwen3:0.6b model=qwen3:0.6b reason=simple request, smallest capable model, needs tools ...
model router falling back: qwen3:0.6b failed before answering ...
```

On Windows the logs are in `%APPDATA%\Block\mayhem\data\logs\cli`.

## Context limits

Mayhem compacts long conversations to fit the model's context window. With the router, it uses the **smallest** window among the usable models, so a conversation always fits whichever model ends up answering.
