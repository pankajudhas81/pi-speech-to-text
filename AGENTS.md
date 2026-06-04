# Agent Guidelines — pi-speech-to-text

## Overview

Speech-to-text extension for pi — push-to-talk dictation via sox +
Groq Whisper. Published as `pi-speech-to-text` on npm.

## Rules

- 4-space indentation, 80-char line width
- No secrets (API keys, tokens) in any file
- Format before commit: `pnpm run format`
- Lint before commit: `pnpm run lint`
- Build must pass: `pnpm run build`

## Architecture

6 source files in `src/`:

| File             | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `index.ts`       | Extension entry — registers commands,      |
|                  | shortcuts, and the recording pipeline      |
| `config.ts`      | Provider registry + persisted preferences  |
| `recorder.ts`    | sox recording state machine                |
| `transcribe.ts`  | Whisper API client (OpenAI-compatible)      |
| `cleanup.ts`     | Stage-2 LLM cleanup pass                   |
| `prompts.ts`     | System prompt for the cleanup LLM          |

## Key Decisions

- **pi SDK as peer dep** — never bundle the SDK; the pi runtime
  provides it
- **typebox as regular dep** — used for schema validation at runtime
- **oxlint + oxfmt** — fast linting and formatting, no eslint/prettier
- **tsconfig emits** — `declaration`, `declarationMap`, `sourceMap`,
  `rewriteRelativeImportExtensions` for npm consumers
- **No test files yet** — `pnpm test` is a no-op placeholder

## Workflow

- CI runs on PRs and non-main pushes (`.github/workflows/ci.yml`)
- Release is tag-triggered (`.github/workflows/release.yml`)
- Push a `v*.*.*` tag to publish to npm with provenance

## Git Commits

Format: `<emoji> <imperative-verb> <description>`
Single line, under 72 chars, no body.
