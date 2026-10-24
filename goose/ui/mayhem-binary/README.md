# Native Binary Packages for mayhem

This directory contains the npm package scaffolding for distributing the
`mayhem` Rust binary as platform-specific npm packages.

## Packages

| Package | Platform |
|---------|----------|
| `@aaif/mayhem-binary-darwin-arm64` | macOS Apple Silicon |
| `@aaif/mayhem-binary-darwin-x64` | macOS Intel |
| `@aaif/mayhem-binary-linux-arm64` | Linux ARM64 |
| `@aaif/mayhem-binary-linux-x64` | Linux x64 |
| `@aaif/mayhem-binary-win32-x64` | Windows x64 |

## Usage

These are platform-specific implementation dependencies and are not intended
to be installed directly. Install `@aaif/mayhem-acp` instead. It installs the
appropriate package automatically and provides the `mayhem` command. Each
binary package contains its native executable. Its platform-specific internal
command preserves executable permissions during npm packing;
`@aaif/mayhem-acp` remains the sole owner of the supported `mayhem` command.

## Release preparation

The `.github/workflows/publish-npm.yml` workflow downloads the binaries from an
exact versioned Mayhem release and prepares the platform package tarballs.
By default it only uploads the verified tarballs as a workflow artifact. Set
the manual `publish` input to publish them through the protected npm production
environment.
