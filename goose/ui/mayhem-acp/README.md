# @aaif/mayhem-acp

Install and resolve the Mayhem executable through npm.

This package distributes the Mayhem CLI using platform-specific optional npm
dependencies. It does not contain or depend on the Mayhem ACP client.

## Installation

```bash
npm install @aaif/mayhem-acp
```

The matching `@aaif/mayhem-binary-*` package is installed automatically. Do not
install a platform package directly; `@aaif/mayhem-acp` provides the supported
`mayhem` command.

## Usage

Run the Mayhem CLI installed by the package:

```bash
npx mayhem acp
npx mayhem serve
```

The launcher forwards arguments and standard input, output, and error streams to
the native executable. It preserves the executable's exit status and forwards
termination signals.

Resolve the executable path programmatically:

```typescript
import { resolveMayhemBinary } from "@aaif/mayhem-acp";

const binaryPath = resolveMayhemBinary();
```

`resolveMayhemBinary()` first uses `MAYHEM_BINARY` when it is set. Otherwise, it
selects the package matching `process.platform` and `process.arch`. In both
cases it verifies that the executable exists and returns an absolute path.

Use the override to run a locally built or custom Mayhem executable:

```bash
MAYHEM_BINARY=/path/to/mayhem npx mayhem acp
```

`MAYHEM_BINARY` must point directly to a native Mayhem executable, not a
`node_modules/.bin/mayhem` command shim.

Supported platforms:

| Operating system | Architecture |
| ---------------- | ------------ |
| macOS            | ARM64        |
| macOS            | x64          |
| Linux            | ARM64        |
| Linux            | x64          |
| Windows          | x64          |

Package managers must install optional dependencies. If optional dependencies
are disabled, the resolver reports which platform package is missing.
