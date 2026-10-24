# mayhem-sdk

Python bindings for the mayhem Development Kit (GDK).

This package is generated from the Rust `mayhem-sdk` crate using UniFFI.

## Build a local wheel

From the repository root:

```bash
just --justfile crates/mayhem-sdk/justfile python-wheel
```

The wheel is written to `crates/mayhem-sdk/python/dist/`.
