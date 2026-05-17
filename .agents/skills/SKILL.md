---
name: moneyforward-asset-graph
description: Repository rules for MoneyForward Asset Graph work.
---

# MoneyForward Asset Graph Rules

## Build Artifact Placement

- Always place build artifacts in the repository root `debug/` or `release/` directory.
- Use `scripts/build_extension.sh debug` for local test builds. The unpacked extension must be written to `debug/moneyforward-asset-graph/`.
- Use `scripts/build_extension.sh release` for distribution builds. The unpacked extension and zip must be written to `release/`.
- Do not ask Ryo to load the repository root directly when validating a built extension; use the copied folder under `debug/` or `release/`.
- If build tooling changes, update this skill and `README.md` in the same change.
