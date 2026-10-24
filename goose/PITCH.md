# Mayhem: the local AI agent that picks the right brain for every task

## The problem

Running an AI agent on your own laptop means choosing one local model and living with it:

- **A big model for everything** is slow and eats your RAM, even for "say hi".
- **A tiny model for everything** is fast, but it can't see images, struggles with tools and fails on hard tasks.
- **When that one model breaks**, because it's missing, has crashed or the input is too long, the agent just stops.

Cloud agents solve this by sending everything to a giant paid model. We wanted it **free, private and offline**.

## Our solution: capability-based local model routing

Mayhem is an open-source AI agent for the terminal and desktop. It **looks at every installed Ollama model, learns what each one can do, and sends every request to the best one for that job**, automatically.

| Request | Mayhem picks | Why |
|---|---|---|
| "say hi", "list my files" | **Smallest model** that supports what's needed | Fastest reply, least memory |
| "explain this architecture", "debug this crash", code blocks | **Thinking-capable, largest model** | Needs more reasoning |
| Screenshot or image in the chat | **Vision-capable model** | Not every model can see |
| Agent needs to run tools | **Tool-calling model** only | Others would fail |
| Huge conversation or file | **Model with a big enough context window** | Nothing gets cut off |
| Chosen model fails before answering | **Next-best model, automatically** | The agent keeps working |

### How it works

1. **Zero config.** Set `MAYHEM_PROVIDER: router` and you're done. Mayhem asks Ollama which models are installed and what each supports (tools, vision, thinking, context size), and it re-checks every minute, so a newly pulled model joins in automatically.
2. **Reads each request.** It detects whether tools are offered, images are present, how many tokens are involved, and whether the task is hard (wording, length, code).
3. **Ranks the models.** Models that meet every hard requirement come first. Simple tasks go to the smallest of them and hard tasks to the strongest.
4. **Safe fallback.** If a model fails *before* replying, Mayhem moves to the next one. It never switches halfway through an answer, and it never hides login or config errors.
5. **One model per task.** Every tool call inside a task uses the same model, so answers stay consistent.
6. **Fully visible.** Every decision is logged: which model was chosen, why, its capabilities and what the request needed.

```yaml
MAYHEM_PROVIDER: router
MAYHEM_MODEL: auto
```

## Why it matters

- **Free:** everything runs on your own machine, so there are no API bills.
- **Private:** your code and chats never leave your laptop.
- **Fast:** easy questions get the quick model instead of waiting on the big one.
- **Reliable:** one broken model doesn't stop the agent.
- **Smart about hardware:** small models for small jobs leave RAM free on a laptop.

## Live demo

```powershell
ollama list                                            # show the installed models
mayhem run --no-session -t "say hi"                    # -> small, fast model
mayhem run --no-session -t "explain what a mutex is"   # -> strongest model
```

Then we open the log, where each request is labelled with the model the router chose and the reason.

## What works today

- **Capability-based local model routing**, built and unit-tested, with 19 tests covering routing, fallback, per-turn stickiness, allowlists and context limits.
- **The Mayhem CLI** builds and runs (`mayhem --version` → 1.56.0).
- **100% local** on Ollama, for example Gemma 4 (`gemma4:e2b-it-qat`), with no API key and no cloud.
- **A full agent:** interactive chat, tool calling, MCP extensions, recipes, scheduled jobs and a desktop app.
- **Written in Rust:** fast, and shipped as a single binary.

## Roadmap

- **AI-picked routes:** a tiny model classifies each request to choose the route.
- **Mixed routing:** local models for everyday work, with a cloud model only when no local model can handle the task.
- **Routing dashboard** in the desktop app, showing requests per model and time saved.

## Tech stack

Rust (Tokio, async streaming) · MCP (Model Context Protocol) · Ollama · Electron + React desktop app

## Credits

Mayhem is built on top of an open-source AI agent framework (Apache License 2.0). Our contributions are the Mayhem rebrand, the local-first Ollama setup and the capability-based model routing layer (`crates/mayhem/src/providers/router/`).

**Team:** Yashmanore · Repo: https://github.com/Yashmanore/HACKTOBERFEST
