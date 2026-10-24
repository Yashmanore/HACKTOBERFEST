# Terminal Integration

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Talk to mayhem directly from your shell prompt. Instead of switching to a separate REPL session, stay in your terminal and call mayhem when you need it.

## Setup

<Tabs groupId="shells">
<TabItem value="zsh" label="zsh" default>

Add to `~/.zshrc`:
```bash
eval "$(mayhem term init zsh)"
```

</TabItem>
<TabItem value="bash" label="bash">

Add to `~/.bashrc`:
```bash
eval "$(mayhem term init bash)"
```

</TabItem>
<TabItem value="fish" label="fish">

Add to `~/.config/fish/config.fish`:
```fish
mayhem term init fish | source
```

</TabItem>
<TabItem value="nu" label="Nushell">

Add to `~/.config/nushell/config.nu`:
```nu
let mayhem_term_init = ($nu.cache-dir | path join "mayhem-term-init.nu")
^mayhem term init nu | save --force $mayhem_term_init
source $mayhem_term_init
```

</TabItem>
<TabItem value="powershell" label="PowerShell">

Add to `$PROFILE`:
```powershell
Invoke-Expression (mayhem term init powershell)
```

</TabItem>
</Tabs>

Restart your terminal or source the config, and that's it!

## Usage

Just type `@mayhem` (or `@g` for short) followed by your question:

```bash
npm install express
    npm ERR! code EACCES
    npm ERR! permission denied

@mayhem "how do I fix this error?"
```

Use quotes around your prompt if it contains special characters like `?`, `*`, or `'`:

```bash
@mayhem "what's in this directory?"
@g "analyze the error: 'permission denied'"
```

## Named Sessions
By default, each terminal gets its own mayhem session that lasts until you close it. Named sessions let you continue conversations across terminal restarts and share context between windows.

<Tabs groupId="shells">
<TabItem value="zsh" label="zsh" default>

```bash
eval "$(mayhem term init zsh --name my-project)"
```

</TabItem>
<TabItem value="bash" label="bash">

```bash
eval "$(mayhem term init bash --name my-project)"
```

</TabItem>
<TabItem value="fish" label="fish">

```fish
mayhem term init fish --name my-project | source
```

</TabItem>
<TabItem value="nu" label="Nushell">

```nu
let mayhem_term_init = ($nu.cache-dir | path join "mayhem-term-init.nu")
^mayhem term init nu --name my-project | save --force $mayhem_term_init
source $mayhem_term_init
```

</TabItem>
<TabItem value="powershell" label="PowerShell">

```powershell
Invoke-Expression (mayhem term init powershell --name my-project)
```

</TabItem>
</Tabs>

Named sessions persist in mayhem's database, so they're available anytime, even after restarting your computer. Reopen later and run the same command to continue:

```bash
# Start debugging
eval "$(mayhem term init zsh --name auth-bug)"
@mayhem help me debug this login timeout

# Close terminal, come back later
eval "$(mayhem term init zsh --name auth-bug)"
@mayhem "what was the solution we discussed?"
# Continues the same conversation with context
```

## Default Handler

Use `--default` if you want mayhem to answer commands your shell cannot resolve.

<Tabs groupId="default-shells">
<TabItem value="zsh" label="zsh" default>

```bash
eval "$(mayhem term init zsh --default)"
```

</TabItem>
<TabItem value="bash" label="bash">

```bash
eval "$(mayhem term init bash --default)"
```

</TabItem>
<TabItem value="nu" label="Nushell">

```nu
let mayhem_term_init = ($nu.cache-dir | path join "mayhem-term-init.nu")
^mayhem term init nu --default | save --force $mayhem_term_init
source $mayhem_term_init
```

</TabItem>
</Tabs>

## Shell History

By default, mayhem does **not** record the commands you type. To let mayhem see your recent shell commands as context when you ask a question, pass `--dangerous-include-history` when initialising:

:::warning
When shell history is enabled, every command you run — including lines that contain passwords, API keys, or other credentials — is sent to the configured model provider. Only enable this if you understand and accept that risk.
:::

<Tabs groupId="shells">
<TabItem value="zsh" label="zsh" default>

```bash
eval "$(mayhem term init zsh --dangerous-include-history)"
```

</TabItem>
<TabItem value="bash" label="bash">

```bash
eval "$(mayhem term init bash --dangerous-include-history)"
```

</TabItem>
<TabItem value="fish" label="fish">

```fish
mayhem term init fish --dangerous-include-history | source
```

</TabItem>
<TabItem value="nu" label="Nushell">

```nu
let mayhem_term_init = ($nu.cache-dir | path join "mayhem-term-init.nu")
^mayhem term init nu --dangerous-include-history | save --force $mayhem_term_init
source $mayhem_term_init
```

</TabItem>
<TabItem value="powershell" label="PowerShell">

```powershell
Invoke-Expression (mayhem term init powershell --dangerous-include-history)
```

</TabItem>
</Tabs>

With history enabled, mayhem sees the commands you've run since your last question, so you don't need to explain what you've been doing.

## Show Context Status in Your Prompt

Add `mayhem term info` to your prompt to see how much context you've used and which model is active during a terminal mayhem session. 

<Tabs groupId="shells">
<TabItem value="zsh" label="zsh" default>

```bash
PROMPT='$(mayhem term info) %~ $ '
```

</TabItem>
<TabItem value="bash" label="bash">

```bash
PS1='$(mayhem term info) \w $ '
```

</TabItem>
<TabItem value="fish" label="fish">

```fish
function fish_prompt
    mayhem term info
    echo -n ' '(prompt_pwd)' $ '
end
```

</TabItem>
<TabItem value="nu" label="Nushell">

```nu
$env.PROMPT_COMMAND = {|| $"(mayhem term info) (pwd)> " }
```

</TabItem>
<TabItem value="powershell" label="PowerShell">

```powershell
function prompt {
    $mayhemInfo = & mayhem term info
    "$mayhemInfo $(Get-Location) PS> "
}
```

</TabItem>
</Tabs>

Your terminal prompt now shows the context usage and model name (shortened for readability) for the active mayhem session. For example:

```bash
●●○○○ sonnet ~/projects $
```
## Shell Completion for mayhem Commands

`@mayhem` provides context-aware assistance. To enable tab completion of mayhem CLI commands (like `mayhem session`, `mayhem run`, etc.), see the [shell completion documentation](/docs/guides/mayhem-cli-commands#completion).

## Troubleshooting

**mayhem doesn't see recent commands:**
Shell history capture is opt-in. mayhem only sees your recent commands if you initialised with [`--dangerous-include-history`](#shell-history). Without that flag, mayhem has no record of commands you've run.

If you've already enabled `--dangerous-include-history` but mayhem still reports no activity, check that terminal integration is properly [set up in your shell config](#setup).
You can also check the id of the mayhem session in your current terminal:
```bash
# Check if session ID exists
echo $AGENT_SESSION_ID
# Should show something like: 20251209_151730
```
```nu
# Nushell
$env.AGENT_SESSION_ID
# Should show something like: 20251209_151730
```
To share context across terminal windows, use a [named session](#named-sessions) instead.

**Session getting too full** (prompt shows `●●●●●`):
If mayhem's responses are getting slow or hitting context limits, start a fresh mayhem session in the terminal. The new mayhem session sees your command history, but not the conversation history from the previous session. 
```bash
# Start a new mayhem session in the same shell
eval "$(mayhem term init zsh)"
```
```nu
# Nushell
let mayhem_term_init = ($nu.cache-dir | path join "mayhem-term-init.nu")
^mayhem term init nu | save --force $mayhem_term_init
source $mayhem_term_init
```
