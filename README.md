# pi-speech-to-text

Speech-to-text extension for [pi](https://pi.dev) — push-to-talk
dictation via sox + Groq Whisper.

> **Note:** This package is unrelated to `pi-voice` by yukukotani on
> npm. This is the voice dictation extension for the pi coding agent.

## Features

- **Push-to-talk** recording via sox (Ctrl+' shortcut)
- **Groq Whisper** transcription (also supports OpenAI and custom
  endpoints)
- **LLM cleanup** pass — fixes punctuation, capitalization, and
  coding homophones (pie→pi, Jason→JSON, cash→cache, etc.)
- **Multiple languages** — auto-detect or pick from English, Hindi,
  Spanish, French, German, Japanese, Chinese
- **Microphone picker** — select from available macOS audio inputs
- **Persistent preferences** — provider, model, mic, and language
  choices survive across sessions

## Prerequisites

- **sox** — `brew install sox`
- **GROQ_API_KEY** — get one at [console.groq.com](https://console.groq.com)

## Install

```bash
pi install npm:pi-speech-to-text
```

## Commands

| Command           | Description                   |
| ----------------- | ----------------------------- |
| `/voice`          | Toggle recording (start/stop) |
| `/voice-cancel`   | Cancel the current recording  |
| `/voice-provider` | Switch transcription provider |
| `/voice-model`    | Pick Whisper model            |
| `/voice-mic`      | Pick audio input device       |
| `/voice-language` | Set language or auto-detect   |

## Shortcut

**Ctrl+'** — toggle voice recording (same as `/voice`)

## Providers

| Provider | API Key Env      | Default Model    |
| -------- | ---------------- | ---------------- |
| Groq     | `GROQ_API_KEY`   | whisper-large-v3 |
| OpenAI   | `OPENAI_API_KEY` | whisper-1        |
| Custom   | (configurable)   | whisper-large-v3 |

## How It Works

1. Press Ctrl+' (or run `/voice`) to start recording
2. Speak your prompt
3. Press Ctrl+' again to stop
4. Audio is sent to the configured Whisper API
5. Transcription is cleaned up by an LLM (Groq Llama 3.3 70B)
6. Cleaned text is pasted into the pi editor

## Development

```bash
pnpm install
pnpm run build
pnpm run lint
```

## License

MIT
