//! Pure routing decisions: what a request needs, and which local models can serve it.
//!
//! Nothing here does I/O, so every rule is unit tested directly.

use mayhem_providers::conversation::message::{Message, MessageContent};
use rmcp::model::{Role, Tool};

/// Rough token estimate used only for routing (about 4 characters per token).
const CHARS_PER_TOKEN: usize = 4;
/// Inputs larger than this are treated as complex regardless of wording.
const COMPLEX_INPUT_TOKENS: usize = 6_000;
/// A last user message longer than this is treated as complex.
const COMPLEX_MESSAGE_CHARS: usize = 600;
/// Words that signal a request needs a stronger model.
const COMPLEX_KEYWORDS: &[&str] = &[
    "analyze",
    "analyse",
    "architecture",
    "debug",
    "design",
    "explain",
    "implement",
    "optimize",
    "optimise",
    "plan",
    "prove",
    "refactor",
    "review",
    "why",
];

/// What the router knows about one locally installed model.
#[derive(Debug, Clone, PartialEq)]
pub struct LocalModel {
    pub name: String,
    pub size_bytes: u64,
    pub context_length: Option<usize>,
    pub completion: bool,
    pub tools: bool,
    pub vision: bool,
    pub thinking: bool,
}

impl LocalModel {
    pub fn capability_labels(&self) -> Vec<&'static str> {
        let mut labels = Vec::new();
        if self.tools {
            labels.push("tools");
        }
        if self.vision {
            labels.push("vision");
        }
        if self.thinking {
            labels.push("thinking");
        }
        labels
    }
}

/// What a single request requires from the model that serves it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RequestNeeds {
    pub vision: bool,
    pub tools: bool,
    pub estimated_tokens: usize,
    pub complex: bool,
}

impl RequestNeeds {
    pub fn analyze(system: &str, messages: &[Message], tools: &[Tool]) -> Self {
        let mut chars = system.len();
        let mut vision = false;
        for message in messages {
            for content in &message.content {
                match content {
                    MessageContent::Text(text) => chars += text.text.len(),
                    MessageContent::Image(_) => vision = true,
                    MessageContent::ToolRequest(_) | MessageContent::ToolResponse(_) => {
                        chars += content.to_string().len();
                    }
                    _ => {}
                }
                if let MessageContent::ToolResponse(response) = content {
                    if let Ok(result) = &response.tool_result {
                        vision |= result.content.iter().any(|item| item.as_image().is_some());
                    }
                }
            }
        }
        let estimated_tokens = chars / CHARS_PER_TOKEN;
        let last_user_text = last_user_text(messages);
        let lowered = last_user_text.to_lowercase();
        let complex = estimated_tokens > COMPLEX_INPUT_TOKENS
            || last_user_text.len() > COMPLEX_MESSAGE_CHARS
            || last_user_text.contains("```")
            || lowered
                .split(|c: char| !c.is_alphanumeric())
                .any(|word| COMPLEX_KEYWORDS.contains(&word));

        Self {
            vision,
            tools: !tools.is_empty(),
            estimated_tokens,
            complex,
        }
    }
}

/// The text of the most recent user message that is not a tool response.
pub fn last_user_text(messages: &[Message]) -> String {
    messages
        .iter()
        .rev()
        .find(|m| m.role == Role::User && !m.is_tool_response())
        .map(|m| m.as_concat_text())
        .unwrap_or_default()
}

/// Identifies the current user turn (how many user messages so far, plus the
/// latest one's text), so a decision can stay fixed for a whole tool loop
/// without leaking into unrelated requests that happen to be the same length.
pub fn user_turn_key(messages: &[Message]) -> (usize, String) {
    let turns = messages
        .iter()
        .filter(|m| m.role == Role::User && !m.is_tool_response())
        .count();
    (turns, last_user_text(messages))
}

/// One ranked candidate and the reason it was chosen.
#[derive(Debug, Clone, PartialEq)]
pub struct Candidate {
    pub model: LocalModel,
    pub reason: String,
}

/// Whether `model` can serve a request with these needs at all.
pub fn satisfies(model: &LocalModel, needs: &RequestNeeds) -> bool {
    model.completion
        && (!needs.vision || model.vision)
        && (!needs.tools || model.tools)
        && model
            .context_length
            .is_none_or(|limit| limit >= needs.estimated_tokens)
}

/// Orders models from best to worst for this request.
///
/// Models that meet every hard requirement (vision, tools, context) come first.
/// Among those, simple requests prefer the smallest model (fastest, least memory)
/// and complex requests prefer thinking-capable, then larger, models. Models
/// that miss a requirement are kept at the end as a last resort.
pub fn rank(models: &[LocalModel], needs: &RequestNeeds) -> Vec<Candidate> {
    let mut usable: Vec<&LocalModel> = models.iter().filter(|m| m.completion).collect();
    usable.sort_by(|a, b| {
        let fit = satisfies(b, needs).cmp(&satisfies(a, needs));
        let preference = if needs.complex {
            b.thinking
                .cmp(&a.thinking)
                .then(b.size_bytes.cmp(&a.size_bytes))
        } else {
            a.size_bytes.cmp(&b.size_bytes)
        };
        fit.then(preference).then(a.name.cmp(&b.name))
    });

    usable
        .into_iter()
        .map(|model| Candidate {
            reason: reason(model, needs),
            model: model.clone(),
        })
        .collect()
}

fn reason(model: &LocalModel, needs: &RequestNeeds) -> String {
    if !satisfies(model, needs) {
        let mut missing = Vec::new();
        if needs.vision && !model.vision {
            missing.push("vision");
        }
        if needs.tools && !model.tools {
            missing.push("tools");
        }
        if model
            .context_length
            .is_some_and(|limit| limit < needs.estimated_tokens)
        {
            missing.push("context");
        }
        return format!("last resort, missing {}", missing.join("+"));
    }
    let mut parts = vec![if needs.complex {
        "complex request, strongest capable model"
    } else {
        "simple request, smallest capable model"
    }
    .to_string()];
    if needs.vision {
        parts.push("needs vision".to_string());
    }
    if needs.tools {
        parts.push("needs tools".to_string());
    }
    parts.join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::object;

    fn model(name: &str, gb: u64, tools: bool, vision: bool, thinking: bool) -> LocalModel {
        LocalModel {
            name: name.to_string(),
            size_bytes: gb * 1_000_000_000,
            context_length: Some(32_768),
            completion: true,
            tools,
            vision,
            thinking,
        }
    }

    fn installed() -> Vec<LocalModel> {
        vec![
            model("big", 9, true, true, true),
            model("small", 1, true, false, false),
            model("text-only", 2, false, false, false),
        ]
    }

    fn tool() -> Tool {
        Tool::new("shell", "run a command", object!({ "type": "object" }))
    }

    fn needs(text: &str, tools: bool) -> RequestNeeds {
        let tools = if tools { vec![tool()] } else { vec![] };
        RequestNeeds::analyze("", &[Message::user().with_text(text)], &tools)
    }

    fn first(models: &[LocalModel], needs: &RequestNeeds) -> String {
        rank(models, needs)[0].model.name.clone()
    }

    #[test]
    fn simple_request_uses_smallest_model() {
        assert_eq!(first(&installed(), &needs("say hi", false)), "small");
    }

    #[test]
    fn complex_keyword_uses_strongest_model() {
        let needs = needs("Explain how a mutex works", false);
        assert!(needs.complex);
        assert_eq!(first(&installed(), &needs), "big");
    }

    #[test]
    fn keyword_must_be_a_whole_word() {
        assert!(!needs("whyte is my name", false).complex);
    }

    #[test]
    fn long_or_code_messages_are_complex() {
        assert!(needs(&"a".repeat(COMPLEX_MESSAGE_CHARS + 1), false).complex);
        assert!(needs("fix\n```rust\nfn main() {}\n```", false).complex);
    }

    #[test]
    fn tools_skip_models_without_tool_support() {
        let models = vec![
            model("text-only", 1, false, false, false),
            model("small", 2, true, false, false),
        ];
        assert_eq!(first(&models, &needs("say hi", true)), "small");
    }

    #[test]
    fn images_require_vision() {
        let messages = [Message::user()
            .with_text("what is this")
            .with_image("aGk=", "image/png")];
        let needs = RequestNeeds::analyze("", &messages, &[]);
        assert!(needs.vision);
        assert_eq!(first(&installed(), &needs), "big");
    }

    #[test]
    fn oversized_input_skips_small_context_models() {
        let mut models = installed();
        models[0].context_length = Some(131_072);
        models[1].context_length = Some(2_048);
        models[2].context_length = Some(2_048);
        let big_input = "word ".repeat(4_000);
        let needs = RequestNeeds::analyze(&big_input, &[Message::user().with_text("hi")], &[]);
        assert_eq!(first(&models, &needs), "big");
    }

    #[test]
    fn unusable_models_are_kept_as_last_resort() {
        let ranked = rank(&installed(), &needs("say hi", true));
        assert_eq!(ranked.last().unwrap().model.name, "text-only");
        assert!(ranked.last().unwrap().reason.contains("missing tools"));
    }

    #[test]
    fn embedding_models_are_never_candidates() {
        let mut models = installed();
        models.push(LocalModel {
            completion: false,
            ..model("embed", 0, false, false, false)
        });
        assert!(rank(&models, &needs("hi", false))
            .iter()
            .all(|c| c.model.name != "embed"));
    }

    #[test]
    fn turn_index_ignores_tool_responses() {
        let messages = vec![
            Message::user().with_text("one"),
            Message::assistant().with_text("ok"),
            Message::user().with_text("two"),
        ];
        assert_eq!(user_turn_key(&messages), (2, "two".to_string()));
        assert_eq!(last_user_text(&messages), "two");
    }
}
