# Building mayhem for RISC-V (riscv64gc-unknown-linux-gnu)

This document describes how to build mayhem-cli for RISC-V 64-bit systems.

> [!WARNING]
> This is an experimental, community-contributed build process. RISC-V is not
> officially supported by the mayhem project.

## Prerequisites

- The Rust toolchain pinned in `rust-toolchain.toml`
- Target: `rustup target add riscv64gc-unknown-linux-gnu`
- For cross-compilation, a RISC-V toolchain such as `gcc-riscv64-linux-gnu`
  and the target libraries required by Mayhem's native dependencies

### Linker configuration

Building on RISC-V hardware uses the native linker automatically.

Cross-compiling (e.g. from x86_64) needs the cross linker. Either export:

```bash
export CARGO_TARGET_RISCV64GC_UNKNOWN_LINUX_GNU_LINKER=riscv64-linux-gnu-gcc
```

or add to `.cargo/config.toml` (or `~/.cargo/config.toml`):

```toml
[target.riscv64gc-unknown-linux-gnu]
linker = "riscv64-linux-gnu-gcc"
```

Adjust the binary name if your distribution ships the cross gcc under a
different name.

## Build

Run from the repository root:

```bash
cargo build --release --target riscv64gc-unknown-linux-gnu -p mayhem-cli --bin mayhem
```

Output: `target/riscv64gc-unknown-linux-gnu/release/mayhem`

Self-update is unavailable on RISC-V because release artifacts are not published
for this platform. Rebuild from source to update.

## Verification

Check the binary's architecture:

```bash
file target/riscv64gc-unknown-linux-gnu/release/mayhem
```

On RISC-V hardware, run:

```bash
./target/riscv64gc-unknown-linux-gnu/release/mayhem --version
./target/riscv64gc-unknown-linux-gnu/release/mayhem doctor
```
