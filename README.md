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
- **Custom vocabulary** — teach it your known words (names, project
  jargon) so they're spelled correctly instead of mangled
  (e.g. `yuyudhan` instead of `UU-DAN`)
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
pi install npm:@pankajudhas81/pi-speech-to-text
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
| `/voice-terms`    | Manage custom vocabulary      |

## Shortcuts

| Shortcut         | Description                                         |
| ---------------- | --------------------------------------------------- |
| **Ctrl+'**       | Toggle voice recording with LLM cleanup             |
| **Ctrl+Shift+'** | Toggle voice recording, raw transcript (no cleanup) |

## Custom Vocabulary (Known Words)

If the transcriber keeps mangling names or domain jargon (e.g. it hears
`yuyudhan` as `UU-DAN`), give it a list of known words. Terms are applied
in **two stages**: they bias the Whisper model directly (sent as its
`prompt` hint), and they're enforced again in the LLM cleanup pass
(`Spell these terms exactly: …`).

There are two sources, **merged and de-duplicated**:

1. **Per-user, interactive** — run `/voice-terms`:

    ```
    /voice-terms yuyudhan, GitNexus, kanata     # set inline
    /voice-terms                                # open the edit menu
    ```

    Saved choices persist across sessions in
    `~/.pi/agent/state/voice/prefs.json`.

2. **Shared / version-controlled** — the `PI_VOICE_TERMS` env var
   (comma-separated). Ideal for dotfiles or a team-wide vocabulary:

    ```bash
    export PI_VOICE_TERMS="yuyudhan, GitNexus, kanata, TypeScript"
    ```

The combined list is capped at ~800 chars before being sent to Whisper
(its biasing prompt is limited), so keep it to the words that actually
get mistranscribed.

## Providers

| Provider | API Key Env      | Default Model    |
| -------- | ---------------- | ---------------- |
| Groq     | `GROQ_API_KEY`   | whisper-large-v3 |
| OpenAI   | `OPENAI_API_KEY` | whisper-1        |
| Custom   | (configurable)   | whisper-large-v3 |

## How It Works

1. Press **Ctrl+'** (with LLM cleanup) or **Ctrl+Shift+'** (raw transcript) to start recording
2. Speak your prompt
3. Press the same shortcut again to stop (or `/voice` to toggle)
4. Audio is sent to the configured Whisper API
5. With Ctrl+': transcription is cleaned up by an LLM (Groq Llama 3.3 70B)
6. Final text is pasted into the pi editor

## Development

```bash
pnpm install
pnpm run build
pnpm run lint
```

## License

MIT
