# Task: Add a model routing layer to Mayhem

You are working in the Mayhem repository, an AI agent framework written in Rust (Cargo workspace under `crates/`) with a CLI (`crates/mayhem-cli`) and an Electron desktop app (`ui/desktop`). Read `AGENTS.md` first and follow its build, test and lint rules.

## Goal

Today a session talks to exactly one provider and one model (`MAYHEM_PROVIDER` + `MAYHEM_MODEL`). Add a **model routing layer** that picks the provider and model *per request* from a configured set of routes, and falls back to another route when a provider fails.

Typical use: a small local model (for example Ollama `gemma4:e2b-it-qat`) handles simple turns, a stronger cloud model handles long-context, image or hard requests, and if the local model is down the request goes to the next route.

The router must be **opt-in**. With no router configured, behaviour must be exactly what it is today.

## How the code works today (verified, read these files before designing)

- **Provider trait:** `crates/mayhem-provider-types/src/base.rs`, `pub trait Provider` (around line 532). The required method is `stream(&self, model_config: &ModelConfig, system: &str, messages: &[Message], tools: &[Tool]) -> Result<MessageStream, ProviderError>`. `complete()` has a default impl built on `stream()`. Other relevant methods: `get_name`, `get_context_limit`, `retry_config`, `fetch_model_info`, `manages_own_context`, `apply_model_selection`, `thinking_effort_support`, `update_mode`.
- **ModelConfig:** `crates/mayhem-provider-types/src/model.rs` has `model_name`, `context_limit`, `temperature`, `max_tokens`, `toolshim`, `toolshim_model`, `request_params`, `reasoning`, `supports_vision` and `request_headers`.
- **Usage:** `ProviderUsage { model: String, usage, stats, cost }` in `crates/mayhem-provider-types/src/conversation/token_usage.rs`. Usage must report the model that actually served the request.
- **Provider registry and factory:** `crates/mayhem/src/providers/init.rs` (`init_registry`, `create`, `create_with_default_model`, `get_from_registry`) and `crates/mayhem/src/providers/provider_registry.rs` (`ProviderRegistry::register::<F: ProviderDef>()`, `ProviderEntry`, `session_bound()`, `runs_own_tool_loop()`). New providers implement `ProviderDef` from `crates/mayhem/src/providers/base.rs`. Use `crates/mayhem/src/providers/ollama_def.rs` as a small reference.
- **Per-session provider selection:** `crates/mayhem/src/agents/provider_manager.rs` (`ProviderManager::provider_for`, `provider_name_for`, `model_config_for`).
- **Main LLM call path:** `crates/mayhem/src/agents/reply_parts.rs`, `stream_response_from_provider` (around line 249). It handles toolshim conversion, telemetry and retry before the first stream item. It is called from `crates/mayhem/src/agents/state_machine/ops_llm.rs`, where `MayhemInferenceProvider` already **wraps an inner `Arc<dyn Provider>` as a decorator**. That is the pattern to copy.
- **State machine wiring:** `crates/mayhem/src/agents/state_machine_builder.rs` (`build_state_machine`, `extra_operations`) and `crates/mayhem/src/agents/agent.rs` (around line 690, where `AutoEffortOperation` is optionally created).
- **Existing per-turn classifier:** `crates/mayhem/src/agents/state_machine/ops_auto_effort.rs` uses `DecisionProvider` (`crates/mayhem-providers/src/decision.rs`) to choose a thinking effort per user turn. `crates/mayhem/src/agents/state_machine/session.rs` (`thinking_effort()`) shows how a per-turn decision is read back. Use this as the model for an optional classifier-based route.
- **Config:** `crates/mayhem/src/config/base.rs` (`config_value!` macro, `get_mayhem_provider`, `get_mayhem_model`) and `crates/mayhem/src/config/providers.rs` (structured `providers:` block). User config lives at `%APPDATA%\Block\mayhem\config\config.yaml` on Windows.
- **Existing subagent overrides:** `MAYHEM_SUBAGENT_PROVIDER` and `MAYHEM_SUBAGENT_MODEL` in `crates/mayhem/src/agents/platform_extensions/summon.rs`. Do not break these.
- **Test doubles:** `crates/mayhem/src/providers/testprovider.rs`, plus mock `impl Provider` blocks in `crates/mayhem/src/agents/state_machine/tests/` and `crates/mayhem/tests/agent.rs`.

## Required design

Implement the router as **a provider that wraps other providers**, registered in the provider registry under the name `router`. Setting `MAYHEM_PROVIDER: router` turns it on. This keeps `ProviderManager`, the state machine and `reply_parts.rs` unchanged, because they already work with any `Arc<dyn Provider>`.

1. **New module** `crates/mayhem/src/providers/router/` containing:
   - `config.rs`: route config types (serde, YAML).
   - `rules.rs`: pure, synchronous route selection with no I/O, so it is easy to unit test.
   - `mod.rs`: `RouterProvider` implementing `Provider`, plus a `ProviderDef` impl registered in `init_registry()`.
2. **Config format.** Add one key, `MAYHEM_ROUTER`, read through `Config::global()`:

   ```yaml
   MAYHEM_PROVIDER: router
   MAYHEM_ROUTER:
     default: local
     sticky_per_turn: true        # keep one route for a whole user turn (tool loop included)
     routes:
       local:
         provider: ollama
         model: gemma4:e2b-it-qat
       strong:
         provider: anthropic
         model: claude-sonnet-5-5
     rules:                        # evaluated top to bottom, first match wins
       - when: { has_images: true }
         route: strong
       - when: { min_input_tokens: 24000 }
         route: strong
       - when: { last_user_message_matches: "(?i)(refactor|architecture|debug)" }
         route: strong
     fallback: [local, strong]     # tried in order when the chosen route errors
   ```

   Validate the config when the router is created and return a clear error for: an unknown route name in `default`, `rules` or `fallback`; an unknown provider name; a malformed regex; or an empty `routes` map.
3. **Rule conditions** (all optional, combined with AND inside one `when`):
   - `has_images`: any message in the request contains image content.
   - `min_input_tokens` / `max_input_tokens`: estimated size of the system prompt plus messages. Reuse the existing token counter in `crates/mayhem/src/token_counter.rs`; do not add a new tokenizer.
   - `min_tools`: number of tools in the request.
   - `last_user_message_matches`: regex on the text of the last user message. The workspace `regex` dependency is declared with `default-features = false, features = ["std"]`, so Unicode classes such as `\b`, `\w` and `\d` may not compile. Test the patterns you document, and do not change the workspace dependency features without a reason.
4. **Route targets.** Build each target lazily with `crate::providers::create(...)` and cache it for the life of the router. Pass each target its own `ModelConfig`: copy the incoming one and replace `model_name`, and resolve `toolshim` for that model. Reject targets whose registry entry has `session_bound()`, `runs_own_tool_loop()` or `manages_own_context() == true` (for example `claude_code`, `codex`, `gemini_cli`), because they keep their own conversation state and cannot be switched mid-session. Also reject `router` itself as a target.
5. **Fallback.** If the chosen target's `stream()` returns `Err`, or the stream yields an error **before its first item**, try the next route in `fallback`, skipping routes already tried. Only fall back on transient or availability errors (connection refused, timeouts, rate limits, 5xx, model not found). Never fall back after content has been streamed to the user. Never fall back on auth or config errors; surface those. Reuse `mayhem_providers::retry::should_retry` and `ProviderError` variants where possible.
6. **Stickiness.** With `sticky_per_turn: true`, decide the route once per user turn and reuse it for every follow-up request in that turn's tool loop. Switching models in the middle of a tool loop breaks prompt caching and can confuse tool-call formats. Key the decision on the session id from `crate::session_context::current_session_id()` plus the index of the latest user message.
7. **Correct reporting.**
   - `get_name()` returns `"router"`.
   - `ProviderUsage.model` must be the model that actually answered.
   - `get_context_limit()` returns the **minimum** context limit across all routes the request could reach, so compaction never lets a conversation grow past the smallest model.
   - `fetch_model_info()` delegates to the default route.
   - Log every routing decision at `info` (route, provider, model, matched rule) and every fallback at `warn`, using `tracing` like the rest of the crate.
8. **Optional, phase 2. Only do this after phases 1–7 are merged and green.** Add a rule `when: { classifier: <route-name list> }` that asks a `DecisionProvider` to choose a route, following `ops_auto_effort.rs`. Time out after 2 seconds and use `default` on any failure.

## Non-goals

- Do not change the `Provider` trait signature.
- Do not change `reply_parts.rs`, `ProviderManager` or the state machine unless a test proves it is required. If it is, explain why in the PR.
- No desktop UI work in this change. CLI and config only.
- Do not add new crates or dependencies. `regex`, `serde` and `serde_yaml` are already in the workspace.

## Tests (required)

Use a mock `Provider` that records which model was called and can be scripted to fail.

- Each rule condition matches and does not match as expected (unit tests on `rules.rs`).
- The first matching rule wins, and `default` is used when nothing matches.
- Fallback moves to the next route on a connection or 5xx error before the first item.
- No fallback after the first streamed item; the error propagates.
- No fallback on an auth error.
- `sticky_per_turn` keeps the same route for every request within one user turn, and re-routes on the next user turn.
- `ProviderUsage.model` reflects the serving model.
- `get_context_limit` returns the minimum across routes.
- Invalid configs (unknown route, bad regex, session-bound target, `router` as a target) fail with clear messages.
- With `MAYHEM_PROVIDER` set to anything other than `router`, existing tests pass unchanged.

## Documentation

- Add `documentation/docs/guides/model-routing.md` with the config example above, an explanation of each rule, fallback behaviour and the stickiness trade-off.
- Mention `MAYHEM_ROUTER` in the docs page that lists configuration environment variables.

## Verification (run all of these and report the results)

```bash
export MAYHEM_DISABLE_KEYRING=1
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo test -p mayhem router
cargo test -p mayhem
cargo build -p mayhem-cli --bin mayhem
```

The development machine has about 7 GB of RAM. If the build runs out of memory, use `cargo build -j 2`.

Then do a manual end-to-end check:

1. Set `MAYHEM_PROVIDER: router` with `local` → Ollama `gemma4:e2b-it-qat` as the default route.
2. Run `mayhem run --no-session -t "say hi"` and confirm the log shows the `local` route.
3. Stop Ollama, run it again, and confirm it falls back to the next route (or fails with a clear error if no other route is configured).

## Definition of done

- `MAYHEM_PROVIDER: router` works as described. Without it, behaviour is unchanged.
- All tests above exist and pass, and clippy is clean with `-D warnings`.
- The docs page exists.
- The PR description lists the files changed, the design choices made in steps 4–7, and the output of the verification commands.
