# Contributing to TabNexus

Thanks for helping make browser context easier to keep and reuse. Focused issues and pull requests are welcome, especially around tab-workbench clarity, accessibility, provider adapters, MCP interoperability, performance, and documentation.

For product ideas, experience feedback, or future improvements, email [currykchen@hotmail.com](mailto:currykchen@hotmail.com).

## Before opening an issue

- Search existing issues first.
- For a bug, include Chrome version, TabNexus version, reproduction steps, expected behavior, and actual behavior.
- Remove page titles, URLs, email addresses, API keys, and other private browser data from screenshots and logs.
- Report security problems privately as described in [SECURITY.md](SECURITY.md).

## Local development

Requirements: Node.js 22+ and pnpm 11.

```bash
corepack enable
pnpm install
pnpm dev
```

The Vite preview uses synthetic tabs. Real Chrome APIs are available only after `pnpm build` and loading `dist/` as an unpacked extension.

## Pull requests

1. Fork the repository and create a focused branch.
2. Keep unrelated formatting or refactors out of the change.
3. Add or update tests for behavior changes.
4. Run the relevant checks:

```bash
pnpm typecheck
pnpm test
pnpm mcp:test       # when Agent or MCP behavior changes
pnpm build
```

5. Explain the user benefit, behavior change, validation, and any privacy or permission impact in the pull request.

Changes that add Chrome permissions, provider hosts, external data transmission, destructive MCP behavior, or credential handling require explicit security rationale and tests.

## Product and design principles

- Make saved/open/closed state understandable without documentation.
- Optimize for task recovery, not the number of visible features.
- Keep navigation intentional; clicking card content must not unexpectedly open a page.
- Prefer reviewable AI proposals over silent mutations.
- Keep local-first and least-privilege defaults.
- Preserve keyboard access, bilingual copy, and reduced-motion behavior.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
