---
title: Offline / Air-gapped Docs
sidebar_position: 95
sidebar_label: Offline Docs
---

# Offline / Air-gapped Docs

The `mayhem-doc-guide` skill reads official mayhem documentation before answering
mayhem-specific questions. By default it reads from `https://mayhem-docs.ai`. In
an offline or air-gapped environment, point mayhem at a **local copy** instead by
setting `MAYHEM_DOCS_ROOT`.

- If `MAYHEM_DOCS_ROOT` is set (in `config.yaml` or the environment), mayhem uses
  it as the docs root — either a local filesystem path or an HTTP(S) URL.
- If it is not set, mayhem falls back to `https://mayhem-docs.ai`.

When the root is a local path, mayhem reads the docs with its file tools; no
network access is required.

## Docs layout

A docs root contains a docs map and a `docs/` tree:

```
<docs-root>/
├── mayhem-docs-map.md
└── docs/
    ├── getting-started/...
    └── guides/...
```

`mayhem-docs-map.md` is the index the skill searches first; every page it reads
is referenced by a path listed there.

## Building a local docs root

Build the docs from a mayhem checkout using the same version as your mayhem
binary, so the docs match the runtime. The standard documentation build already
produces everything mayhem needs — a `mayhem-docs-map.md` index and a `docs/` tree
of markdown files — so no custom tooling is required:

```bash
git checkout v1.41.0   # match your mayhem binary version
cd documentation
npm run build
```

This writes the docs root to `documentation/build/`, containing:

```
build/
├── mayhem-docs-map.md
└── docs/
    ├── getting-started/...
    └── guides/...
```

`npm run build` requires registry access, so run it in an online environment.
Then copy the resulting `build/` directory to your air-gapped target location
(for example `/opt/mayhem-docs`) and point `MAYHEM_DOCS_ROOT` at it.

## Configuring mayhem

Set `MAYHEM_DOCS_ROOT` in `config.yaml`:

```yaml
MAYHEM_DOCS_ROOT: "/opt/mayhem-docs"
```

Or via the environment:

```bash
export MAYHEM_DOCS_ROOT=/opt/mayhem-docs
```

For a managed distribution, bake the docs tree into your image and set
`MAYHEM_DOCS_ROOT` in the shipped `config.yaml` or launcher environment.

## Notes

- Documentation links in mayhem's answers always render as canonical
  `https://mayhem-docs.ai/...` URLs, even when read locally.
- A custom HTTP(S) mirror also works: set `MAYHEM_DOCS_ROOT` to its root URL.
- For MCP extension runtime issues offline, see
  [Airgapped/Offline Environment Issues](/docs/troubleshooting/known-issues#airgappedoffline-environment-issues).
