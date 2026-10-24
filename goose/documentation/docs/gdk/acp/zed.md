---
title: Set up mayhem in Zed
sidebar_position: 3
description: See how Zed installs and configures mayhem as an ACP agent.
---

# Set up mayhem in Zed

Zed can run mayhem as an ACP agent. Install mayhem from the ACP Registry for the
simplest setup, or configure it manually to use your own mayhem binary and
environment overrides.

## Install mayhem from the ACP Registry

Zed has built-in ACP Registry support, so it can download and run mayhem for you
without manual configuration.

1. Open Zed
2. Open Agent Settings
3. Click `Add Agent`, then choose `Install from Registry`
4. Select `mayhem`

A registry-installed mayhem runs the same `mayhem acp` server and reads your
existing mayhem configuration, so your providers, models, and extensions carry
over. Zed keeps the installed version up to date for you.

## Configure mayhem manually

Use a custom agent if you want to run your own mayhem binary, such as a local
development build, or pass environment overrides.

### Prerequisites

Ensure you have both Zed and the mayhem CLI installed:

- **Zed**: Download from [zed.dev](https://zed.dev/)
- **mayhem CLI**: Follow the [installation guide](/docs/getting-started/installation)

Verify mayhem is installed:

```bash
mayhem --version
```

### Add mayhem to your Zed settings

1. Open Zed
2. Open Agent Settings, click `Add Agent`, then choose `Add Custom Agent`. Zed
   scaffolds an `agent_servers` entry and opens your settings file
3. Edit the entry so it runs mayhem:

```json
{
  "agent_servers": {
    "mayhem": {
      "type": "custom",
      "command": "mayhem",
      "args": ["acp"]
    }
  }
}
```

You can now interact with mayhem directly in Zed. ACP sessions use the extensions
enabled in your mayhem configuration, so their tools are also available in Zed.

## Override the provider and model

By default, mayhem uses the provider and model defined in your
[configuration file](/docs/guides/config-files). Override them for a specific
agent configuration with the `MAYHEM_PROVIDER` and `MAYHEM_MODEL` environment
variables.

This example configures two mayhem agents with different model settings:

```json
{
  "agent_servers": {
    "mayhem": {
      "type": "custom",
      "command": "mayhem",
      "args": ["acp"]
    },
    "mayhem (GPT-4o)": {
      "type": "custom",
      "command": "mayhem",
      "args": ["acp"],
      "env": {
        "MAYHEM_PROVIDER": "openai",
        "MAYHEM_MODEL": "gpt-4o"
      }
    }
  }
}
```

## Use Zed MCP servers with mayhem

MCP servers in Zed's `context_servers` configuration are automatically
available to mayhem. This lets native Zed features and the mayhem agent use the
same MCP servers.

```json
{
  "context_servers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/dir"
      ]
    }
  },
  "agent_servers": {
    "mayhem": {
      "type": "custom",
      "command": "mayhem",
      "args": ["acp"]
    }
  }
}
```

All MCP servers in `context_servers` are available to mayhem when they use stdio
(command-based) or HTTP transports. mayhem does not support servers using the
deprecated SSE transport.

If a server in `context_servers` has the same name as a mayhem extension, mayhem
uses its own [configuration](/docs/guides/config-files).
