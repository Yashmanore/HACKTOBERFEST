use crate::conversation::message::Message;
use crate::conversation::Conversation;
use crate::providers::base::ProviderUsage;
use crate::recipe::Recipe;
use crate::session::ExtensionState;
use anyhow::Result;
use mayhem_agent::operation::{ConversationEffect, MachineEffect};

pub enum MayhemEffect {
    Conversation(ConversationEffect),
    CompactConversation {
        conversation: Conversation,
        usage: Option<ProviderUsage>,
    },
    SetRecipe(Box<Option<Recipe>>),
    SetExtensionState {
        extension_name: &'static str,
        version: &'static str,
        value: serde_json::Value,
    },
    RecordUsage(ProviderUsage),
}

impl MayhemEffect {
    pub fn extension_state<S: ExtensionState>(state: &S) -> Result<Self> {
        Ok(MayhemEffect::SetExtensionState {
            extension_name: S::EXTENSION_NAME,
            version: S::VERSION,
            value: state.to_value()?,
        })
    }
}

impl MachineEffect for MayhemEffect {
    fn ensure_message_ids(&mut self) {
        match self {
            MayhemEffect::Conversation(effect) => effect.ensure_message_ids(),
            MayhemEffect::CompactConversation { conversation, .. } => {
                for message in conversation.messages_mut() {
                    if message.id.is_none() {
                        message.id = Some(format!("msg_{}", uuid::Uuid::new_v4()));
                    }
                }
            }
            _ => {}
        }
    }
}

impl From<ConversationEffect> for MayhemEffect {
    fn from(effect: ConversationEffect) -> Self {
        MayhemEffect::Conversation(effect)
    }
}

impl From<Message> for MayhemEffect {
    fn from(message: Message) -> Self {
        ConversationEffect::from(message).into()
    }
}

impl From<Conversation> for MayhemEffect {
    fn from(conversation: Conversation) -> Self {
        ConversationEffect::from(conversation).into()
    }
}
