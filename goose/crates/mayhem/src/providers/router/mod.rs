//! Local model router.
//!
//! `MAYHEM_PROVIDER: router` sends each request to the best model installed in
//! the local Ollama, chosen from what the request needs (tools, images, context
//! size, difficulty) and what each model can do. If the chosen model fails
//! before it starts answering, the next-best model is tried.

pub mod rules;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Result;
use async_trait::async_trait;
use futures::future::BoxFuture;
use futures::StreamExt;
use mayhem_providers::api_client::ApiClient;
use mayhem_providers::conversation::message::Message;
use mayhem_providers::errors::ProviderError;
use mayhem_providers::model::ModelConfig;
use mayhem_providers::ollama::OLLAMA_HOST;
use rmcp::model::Tool;
use serde_json::{json, Value};
use tracing::{info, warn};

use super::base::{ConfigKey, MessageStream, Provider, ProviderDef, ProviderMetadata};
use mayhem_providers::retry::RetryConfig;
use rules::{rank, satisfies, user_turn_key, Candidate, LocalModel, RequestNeeds};

pub const ROUTER_PROVIDER_NAME: &str = "router";
/// Model name that lets the router choose freely.
pub const ROUTER_AUTO_MODEL: &str = "auto";
/// Optional allowlist of installed models the router may use.
pub const ROUTER_MODELS_KEY: &str = "MAYHEM_ROUTER_MODELS";
/// How long the list of installed models is cached before Ollama is asked again.
const DISCOVERY_TTL: Duration = Duration::from_secs(60);
const STICKY_REASON: &str = "same model for the rest of this turn";

/// (user turn key, model chosen for that turn), per session id.
type StickyChoices = HashMap<String, ((usize, String), String)>;

enum ModelSource {
    Ollama(ApiClient),
    #[cfg(test)]
    Fixed(Vec<LocalModel>),
}

pub struct RouterProvider {
    inner: Arc<dyn Provider>,
    source: ModelSource,
    allowlist: Option<Vec<String>>,
    discovered: tokio::sync::Mutex<Option<(Instant, Vec<LocalModel>)>>,
    sticky: Mutex<StickyChoices>,
}

impl RouterProvider {
    fn new(inner: Arc<dyn Provider>, source: ModelSource, allowlist: Option<Vec<String>>) -> Self {
        Self {
            inner,
            source,
            allowlist,
            discovered: tokio::sync::Mutex::new(None),
            sticky: Mutex::new(HashMap::new()),
        }
    }

    /// Installed models the router may use, refreshed every [`DISCOVERY_TTL`].
    pub async fn local_models(&self) -> Result<Vec<LocalModel>, ProviderError> {
        let mut cache = self.discovered.lock().await;
        if let Some((fetched_at, models)) = cache.as_ref() {
            if fetched_at.elapsed() < DISCOVERY_TTL {
                return Ok(models.clone());
            }
        }
        let mut models = match &self.source {
            ModelSource::Ollama(client) => discover_ollama_models(client).await?,
            #[cfg(test)]
            ModelSource::Fixed(models) => models.clone(),
        };
        if let Some(allowlist) = &self.allowlist {
            models.retain(|m| allowlist.iter().any(|allowed| allowed == &m.name));
        }
        *cache = Some((Instant::now(), models.clone()));
        Ok(models)
    }

    /// Ranked candidates for a request, best first.
    async fn plan(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<(RequestNeeds, Vec<Candidate>), ProviderError> {
        let models = self.local_models().await?;
        if !models.iter().any(|m| m.completion) {
            return Err(ProviderError::ExecutionError(
                "The model router found no usable local models. Start Ollama and pull a chat \
                 model, for example `ollama pull gemma4:e2b-it-qat`."
                    .to_string(),
            ));
        }
        let needs = RequestNeeds::analyze(system, messages, tools);
        let mut ranked = rank(&models, &needs);

        // A specific installed model in MAYHEM_MODEL is tried first.
        let pinned = model_config.model_name.as_str();
        if pinned != ROUTER_AUTO_MODEL {
            promote(&mut ranked, pinned, "pinned by MAYHEM_MODEL", &needs);
        }

        // Keep one model for a whole user turn so tool loops stay consistent.
        let session_id = crate::session_context::current_session_id().unwrap_or_default();
        let turn = user_turn_key(messages);
        let sticky = self
            .sticky
            .lock()
            .unwrap()
            .get(&session_id)
            .filter(|(sticky_turn, _)| *sticky_turn == turn)
            .map(|(_, model)| model.clone());
        if let Some(model) = sticky {
            promote(&mut ranked, &model, STICKY_REASON, &needs);
        }
        Ok((needs, ranked))
    }

    fn remember(&self, messages: &[Message], model: &str) {
        let session_id = crate::session_context::current_session_id().unwrap_or_default();
        self.sticky
            .lock()
            .unwrap()
            .insert(session_id, (user_turn_key(messages), model.to_string()));
    }
}

/// Moves `name` to the front if it can serve the request.
fn promote(ranked: &mut Vec<Candidate>, name: &str, reason: &str, needs: &RequestNeeds) {
    if let Some(index) = ranked
        .iter()
        .position(|c| c.model.name == name && satisfies(&c.model, needs))
    {
        let mut candidate = ranked.remove(index);
        candidate.reason = reason.to_string();
        ranked.insert(0, candidate);
    }
}

/// Errors where another model may succeed. Auth and config errors are surfaced as-is.
fn can_fall_back(error: &ProviderError) -> bool {
    matches!(
        error,
        ProviderError::NetworkError(_)
            | ProviderError::ServerError(_)
            | ProviderError::RateLimitExceeded { .. }
            | ProviderError::RequestFailed(_)
            | ProviderError::EndpointNotFound(_)
            | ProviderError::ContextLengthExceeded(_)
    )
}

#[async_trait]
impl Provider for RouterProvider {
    fn get_name(&self) -> &str {
        ROUTER_PROVIDER_NAME
    }

    fn retry_config(&self) -> RetryConfig {
        self.inner.retry_config()
    }

    async fn stream(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        let (needs, candidates) = self.plan(model_config, system, messages, tools).await?;
        let total = candidates.len();
        let mut last_error = None;

        for (attempt, candidate) in candidates.into_iter().enumerate() {
            let model = candidate.model.name.clone();
            info!(
                target: "mayhem::router",
                model = %model,
                reason = %candidate.reason,
                capabilities = %candidate.model.capability_labels().join(","),
                needs_tools = needs.tools,
                needs_vision = needs.vision,
                complex = needs.complex,
                estimated_tokens = needs.estimated_tokens,
                attempt = attempt + 1,
                "model router selected {model}"
            );
            let mut config = model_config.clone();
            config.model_name = model.clone();
            let has_next = attempt + 1 < total;

            let error = match self.inner.stream(&config, system, messages, tools).await {
                Ok(mut stream) => match stream.next().await {
                    Some(Err(error)) if has_next && can_fall_back(&error) => error,
                    first => {
                        self.remember(messages, &model);
                        let head = futures::stream::iter(first);
                        return Ok(Box::pin(head.chain(stream)));
                    }
                },
                Err(error) if has_next && can_fall_back(&error) => error,
                Err(error) => return Err(error),
            };
            warn!(
                target: "mayhem::router",
                model = %model,
                error = %error,
                "model router falling back: {model} failed before answering"
            );
            last_error = Some(error);
        }

        Err(last_error.unwrap_or_else(|| {
            ProviderError::ExecutionError("The model router had no model to try".to_string())
        }))
    }

    /// The smallest limit among usable models, so compaction keeps every
    /// conversation small enough for whichever model ends up answering.
    async fn get_context_limit(&self, model: &str, override_limit: Option<usize>) -> usize {
        if let Some(limit) = override_limit {
            return limit;
        }
        let Ok(models) = self.local_models().await else {
            return self.inner.get_context_limit(model, None).await;
        };
        let mut smallest: Option<usize> = None;
        for local in models.iter().filter(|m| m.completion) {
            let resolved = self.inner.get_context_limit(&local.name, None).await;
            let limit = local
                .context_length
                .map_or(resolved, |native| native.min(resolved));
            smallest = Some(smallest.map_or(limit, |s| s.min(limit)));
        }
        match smallest {
            Some(limit) => limit,
            None => self.inner.get_context_limit(model, None).await,
        }
    }

    async fn fetch_supported_models(&self) -> Result<Vec<String>, ProviderError> {
        let mut names = vec![ROUTER_AUTO_MODEL.to_string()];
        names.extend(self.local_models().await?.into_iter().map(|m| m.name));
        Ok(names)
    }

    fn skip_canonical_filtering(&self) -> bool {
        true
    }
}

/// Reads installed models and their capabilities from Ollama.
async fn discover_ollama_models(client: &ApiClient) -> Result<Vec<LocalModel>, ProviderError> {
    let response = client
        .request("api/tags")
        .response_get()
        .await
        .map_err(|e| ProviderError::NetworkError(format!("Could not reach Ollama: {e}")))?;
    if !response.status().is_success() {
        return Err(ProviderError::RequestFailed(format!(
            "Ollama returned HTTP {} when listing models",
            response.status()
        )));
    }
    let tags: Value = response
        .json()
        .await
        .map_err(|e| ProviderError::RequestFailed(format!("Invalid Ollama model list: {e}")))?;

    let mut models = Vec::new();
    for entry in tags["models"].as_array().into_iter().flatten() {
        let Some(name) = entry["name"].as_str() else {
            continue;
        };
        let mut capabilities = string_list(&entry["capabilities"]);
        let mut context_length = entry["details"]["context_length"]
            .as_u64()
            .map(|n| n as usize);
        // Older Ollama versions only report capabilities through api/show.
        if capabilities.is_none() || context_length.is_none() {
            if let Some(show) = show_model(client, name).await {
                capabilities = capabilities.or_else(|| string_list(&show["capabilities"]));
                context_length = context_length.or_else(|| native_context_length(&show));
            }
        }
        models.push(local_model(
            name,
            entry["size"].as_u64().unwrap_or(0),
            context_length,
            capabilities,
        ));
    }
    Ok(models)
}

async fn show_model(client: &ApiClient, name: &str) -> Option<Value> {
    let response = client
        .request("api/show")
        .response_post(&json!({ "model": name }))
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json().await.ok()
}

fn string_list(value: &Value) -> Option<Vec<String>> {
    value.as_array().map(|items| {
        items
            .iter()
            .filter_map(|item| item.as_str().map(String::from))
            .collect()
    })
}

fn native_context_length(show: &Value) -> Option<usize> {
    show["model_info"]
        .as_object()?
        .iter()
        .find(|(key, _)| key.ends_with(".context_length"))
        .and_then(|(_, value)| value.as_u64())
        .map(|n| n as usize)
}

/// Unknown capabilities (very old Ollama) are treated as a plain chat model.
fn local_model(
    name: &str,
    size_bytes: u64,
    context_length: Option<usize>,
    capabilities: Option<Vec<String>>,
) -> LocalModel {
    let has = |capability: &str| {
        capabilities
            .as_ref()
            .is_some_and(|list| list.iter().any(|c| c == capability))
    };
    LocalModel {
        name: name.to_string(),
        size_bytes,
        context_length,
        completion: capabilities.is_none() || has("completion"),
        tools: has("tools"),
        vision: has("vision"),
        thinking: has("thinking"),
    }
}

fn allowlist_from_config() -> Option<Vec<String>> {
    let config = crate::config::Config::global();
    let names = config
        .get_param::<Vec<String>>(ROUTER_MODELS_KEY)
        .or_else(|_| {
            config
                .get_param::<String>(ROUTER_MODELS_KEY)
                .map(|list| list.split(',').map(|s| s.trim().to_string()).collect())
        })
        .ok()?;
    let names: Vec<String> = names.into_iter().filter(|n| !n.is_empty()).collect();
    (!names.is_empty()).then_some(names)
}

pub struct RouterProviderDef;

impl mayhem_providers::base::ProviderDescriptor for RouterProviderDef {
    fn metadata() -> ProviderMetadata {
        ProviderMetadata::new(
            ROUTER_PROVIDER_NAME,
            "Local Model Router",
            "Routes every request to the best locally installed Ollama model, based on what the \
             request needs (tools, images, context size, difficulty) and what each model supports",
            ROUTER_AUTO_MODEL,
            vec![ROUTER_AUTO_MODEL],
            "https://ollama.com/library",
            vec![
                ConfigKey::new("OLLAMA_HOST", true, false, Some(OLLAMA_HOST), true),
                ConfigKey::new(ROUTER_MODELS_KEY, false, false, None, false),
            ],
        )
    }
}

impl ProviderDef for RouterProviderDef {
    type Provider = RouterProvider;

    fn from_env(
        _extensions: Vec<crate::config::ExtensionConfig>,
        tls_config: Option<super::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>> {
        Box::pin(async move {
            let inner = super::ollama_def::from_env(tls_config.clone()).await?;
            let client = super::ollama_def::api_client_from_env(tls_config)?;
            Ok(RouterProvider::new(
                Arc::new(inner),
                ModelSource::Ollama(client),
                allowlist_from_config(),
            ))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::base::stream_from_single_message;
    use chrono::Utc;
    use mayhem_providers::conversation::message::MessageContent;
    use mayhem_providers::conversation::token_usage::{ProviderUsage, Usage};
    use rmcp::model::{Role, TextContent};

    /// Answers with its model name, or fails for models listed in `failing`.
    struct ScriptedProvider {
        failing: Vec<(String, fn() -> ProviderError)>,
        calls: Mutex<Vec<String>>,
    }

    impl ScriptedProvider {
        fn new(failing: Vec<(&str, fn() -> ProviderError)>) -> Arc<Self> {
            Arc::new(Self {
                failing: failing
                    .into_iter()
                    .map(|(name, error)| (name.to_string(), error))
                    .collect(),
                calls: Mutex::new(Vec::new()),
            })
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl Provider for ScriptedProvider {
        fn get_name(&self) -> &str {
            "scripted"
        }

        async fn stream(
            &self,
            model_config: &ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[Tool],
        ) -> Result<MessageStream, ProviderError> {
            let model = model_config.model_name.clone();
            self.calls.lock().unwrap().push(model.clone());
            if let Some((_, error)) = self.failing.iter().find(|(name, _)| *name == model) {
                return Err(error());
            }
            let message = Message::new(
                Role::Assistant,
                Utc::now().timestamp(),
                vec![MessageContent::Text(TextContent::new(model.clone()))],
            );
            Ok(stream_from_single_message(
                message,
                ProviderUsage::new(model, Usage::default()),
            ))
        }

        async fn get_context_limit(&self, model: &str, _override: Option<usize>) -> usize {
            if model == "small" {
                8_192
            } else {
                128_000
            }
        }
    }

    fn installed() -> Vec<LocalModel> {
        vec![
            local_model(
                "big",
                9_000_000_000,
                Some(131_072),
                Some(vec!["completion".into(), "tools".into(), "vision".into()]),
            ),
            local_model(
                "small",
                1_000_000_000,
                Some(32_768),
                Some(vec!["completion".into(), "tools".into()]),
            ),
            local_model("embed", 100_000_000, None, Some(vec!["embedding".into()])),
        ]
    }

    fn router(inner: Arc<ScriptedProvider>) -> RouterProvider {
        RouterProvider::new(inner, ModelSource::Fixed(installed()), None)
    }

    async fn answer(router: &RouterProvider, model: &str, messages: &[Message]) -> String {
        let (message, usage) = router
            .complete(&ModelConfig::new(model), "", messages, &[])
            .await
            .unwrap();
        assert_eq!(message.as_concat_text(), usage.model);
        usage.model
    }

    #[tokio::test]
    async fn routes_by_difficulty() {
        let router = router(ScriptedProvider::new(vec![]));
        let simple = [Message::user().with_text("say hi")];
        let complex = [Message::user().with_text("explain this architecture")];
        assert_eq!(answer(&router, "auto", &simple).await, "small");
        assert_eq!(answer(&router, "auto", &complex).await, "big");
    }

    #[tokio::test]
    async fn falls_back_when_the_chosen_model_fails() {
        let inner = ScriptedProvider::new(vec![("small", || {
            ProviderError::NetworkError("connection refused".into())
        })]);
        let router = router(inner.clone());
        let messages = [Message::user().with_text("say hi")];
        assert_eq!(answer(&router, "auto", &messages).await, "big");
        assert_eq!(inner.calls(), vec!["small", "big"]);
    }

    #[tokio::test]
    async fn auth_errors_do_not_fall_back() {
        let inner = ScriptedProvider::new(vec![("small", || {
            ProviderError::Authentication("bad key".into())
        })]);
        let router = router(inner.clone());
        let result = router
            .complete(
                &ModelConfig::new("auto"),
                "",
                &[Message::user().with_text("say hi")],
                &[],
            )
            .await;
        assert!(matches!(result, Err(ProviderError::Authentication(_))));
        assert_eq!(inner.calls(), vec!["small"]);
    }

    #[tokio::test]
    async fn last_error_is_returned_when_every_model_fails() {
        let inner = ScriptedProvider::new(vec![
            ("small", || ProviderError::ServerError("down".into())),
            ("big", || ProviderError::ServerError("down too".into())),
        ]);
        let result = router(inner)
            .complete(
                &ModelConfig::new("auto"),
                "",
                &[Message::user().with_text("say hi")],
                &[],
            )
            .await;
        assert!(matches!(result, Err(ProviderError::ServerError(m)) if m == "down too"));
    }

    #[tokio::test]
    async fn pinned_model_is_tried_first() {
        let router = router(ScriptedProvider::new(vec![]));
        let messages = [Message::user().with_text("say hi")];
        assert_eq!(answer(&router, "big", &messages).await, "big");
    }

    #[tokio::test]
    async fn model_stays_fixed_within_a_turn() {
        let router = router(ScriptedProvider::new(vec![]));
        // "say hi" alone would route to "small"; pinning makes the turn start on "big".
        let turn = vec![Message::user().with_text("say hi")];
        assert_eq!(answer(&router, "big", &turn).await, "big");

        // A follow-up inside the same turn (e.g. after a tool call) keeps the model.
        let mut follow_up = turn.clone();
        follow_up.push(Message::assistant().with_text("let me look"));
        assert_eq!(answer(&router, "auto", &follow_up).await, "big");

        // A new user turn is routed again.
        follow_up.push(Message::user().with_text("thanks, say bye"));
        assert_eq!(answer(&router, "auto", &follow_up).await, "small");
    }

    #[tokio::test]
    async fn context_limit_is_the_smallest_usable_model() {
        let router = router(ScriptedProvider::new(vec![]));
        assert_eq!(router.get_context_limit("auto", None).await, 8_192);
        assert_eq!(router.get_context_limit("auto", Some(1_000)).await, 1_000);
    }

    #[tokio::test]
    async fn allowlist_limits_the_models() {
        let router = RouterProvider::new(
            ScriptedProvider::new(vec![]),
            ModelSource::Fixed(installed()),
            Some(vec!["big".to_string()]),
        );
        let messages = [Message::user().with_text("say hi")];
        assert_eq!(answer(&router, "auto", &messages).await, "big");
        assert_eq!(
            router.fetch_supported_models().await.unwrap(),
            vec!["auto", "big"]
        );
    }

    #[test]
    fn parses_ollama_capabilities() {
        let model = local_model(
            "gemma4:e2b-it-qat",
            4_336_358_185,
            Some(131_072),
            Some(vec![
                "completion".into(),
                "vision".into(),
                "tools".into(),
                "thinking".into(),
            ]),
        );
        assert!(model.completion && model.tools && model.vision && model.thinking);
        assert!(local_model("old", 0, None, None).completion);
        let show = json!({ "model_info": { "gemma3.context_length": 32768 } });
        assert_eq!(native_context_length(&show), Some(32_768));
    }
}
