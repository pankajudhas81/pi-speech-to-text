/**
 * pi-voice — Speech-to-text extension for pi.
 *
 * Push-to-talk dictation: record via sox, transcribe with Groq Whisper,
 * optionally clean up with a fast LLM, and paste into the pi editor.
 *
 * Shortcut: Ctrl+'  (toggle recording)
 * Commands: /voice, /voice-cancel, /voice-provider, /voice-model,
 *           /voice-mic, /voice-language, /voice-terms
 */

import type {
    ExtensionAPI,
    ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import {
    createConfig,
    mergeTerms,
    PROVIDERS,
    LANGUAGES,
    TERMS_ENV,
} from "./config"
import {
    getState,
    hasSox,
    startRecording,
    stopRecording,
    cancelRecording,
    waitForExit,
    markProcessing,
    idle,
    listInputDevices,
    WAV_FILE,
} from "./recorder"
import { transcribe } from "./transcribe"
import { normalize } from "./cleanup"

// ---------------------------------------------------------------------------
// Pipeline: stop → transcribe → cleanup → paste
// ---------------------------------------------------------------------------

async function runPipeline(
    ctx: ExtensionContext,
    cfg: ReturnType<typeof createConfig>,
    withNormalize: boolean,
): Promise<void> {
    markProcessing()
    ctx.ui.setStatus("voice", "⏳ Transcribing…")

    try {
        stopRecording()
        await waitForExit()

        ctx.ui.notify("Transcribing…", "info")
        const result = await transcribe({ wavPath: WAV_FILE, cfg })

        if (result.error) {
            ctx.ui.notify(result.error, "error")
            return
        }
        if (!result.text) {
            ctx.ui.notify("No speech detected", "warning")
            return
        }

        let finalText = result.text

        if (withNormalize && cfg.cleanup) {
            ctx.ui.setStatus("voice", "⏳ Normalizing…")
            ctx.ui.notify("Normalizing…", "info")
            const norm = await normalize({
                rawText: result.text,
                cfg,
            })
            if (norm.text) {
                finalText = norm.text
            } else {
                ctx.ui.notify(
                    `Cleanup skipped${norm.error ? ": " + norm.error : ""}`,
                    "warning",
                )
            }
        }

        ctx.ui.pasteToEditor(finalText)
        ctx.ui.notify("🎙 Added to prompt", "info")
    } catch (err: unknown) {
        const e = err as Error
        ctx.ui.notify(`Voice error: ${e.message}`, "error")
    } finally {
        idle()
        ctx.ui.setStatus("voice", undefined)
    }
}

// ---------------------------------------------------------------------------
// Toggle logic (shared by shortcut + command)
// ---------------------------------------------------------------------------

async function toggleVoice(
    ctx: ExtensionContext,
    cfg: ReturnType<typeof createConfig>,
    withNormalize: boolean,
): Promise<void> {
    const currentState = getState()

    if (currentState === "processing") {
        ctx.ui.notify("Already transcribing — please wait", "warning")
        return
    }

    if (currentState === "recording") {
        // Second press → stop and transcribe
        await runPipeline(ctx, cfg, withNormalize)
        return
    }

    // idle → start recording
    if (!hasSox()) {
        ctx.ui.notify("sox not found — install with: brew install sox", "error")
        return
    }
    if (!cfg.apiKey) {
        ctx.ui.notify(
            `Set ${cfg.apiKeyEnv || "GROQ_API_KEY"} to use voice`,
            "error",
        )
        return
    }

    const started = startRecording(cfg.mic, cfg.autoStopSilence, {
        onError(msg: string) {
            ctx.ui.setStatus("voice", undefined)
            ctx.ui.notify(msg, "error")
        },
        async onAutoStop() {
            // auto-stop on silence: run pipeline immediately
            await runPipeline(ctx, cfg, withNormalize)
        },
    })

    if (started) {
        ctx.ui.setStatus(
            "voice",
            "🔴 Recording… (Ctrl+' clean · Ctrl+Shift+' raw)",
        )
        ctx.ui.notify("🎙 Recording — speak now", "info")
    } else {
        ctx.ui.notify("Could not start recording", "error")
    }
}

// ---------------------------------------------------------------------------
// Extension entry
// ---------------------------------------------------------------------------

export default function voiceExtension(pi: ExtensionAPI): void {
    const cfg = createConfig()

    // ── Shortcut: Ctrl+' ────────────────────────────────────────────
    pi.registerShortcut("ctrl+'", {
        description: "Toggle voice recording",
        handler: async (ctx) => {
            await toggleVoice(ctx, cfg, true)
        },
    })

    // ── Shortcut: Ctrl+Shift+' ──────────────────────────────────────
    pi.registerShortcut("ctrl+shift+'", {
        description: "Toggle voice recording (no cleanup)",
        handler: async (ctx) => {
            await toggleVoice(ctx, cfg, false)
        },
    })

    // ── /voice — toggle recording ──────────────────────────────────
    pi.registerCommand("voice", {
        description: "Toggle voice recording (start / stop+transcribe)",
        handler: async (_args, ctx) => {
            await toggleVoice(ctx, cfg, true)
        },
    })

    // ── /voice-cancel — discard current recording ──────────────────
    pi.registerCommand("voice-cancel", {
        description: "Cancel the current voice recording",
        handler: async (_args, ctx) => {
            if (getState() === "recording") {
                cancelRecording()
                ctx.ui.setStatus("voice", undefined)
                ctx.ui.notify("Recording cancelled", "info")
            } else {
                ctx.ui.notify("Not currently recording", "warning")
            }
        },
    })

    // ── /voice-provider — pick transcription provider ──────────────
    pi.registerCommand("voice-provider", {
        description: "Switch voice transcription provider",
        handler: async (_args, ctx) => {
            const options = Object.entries(PROVIDERS).map(
                ([key, def]) => `${def.label} (${key})`,
            )
            const choice = await ctx.ui.select(
                `Voice provider (current: ${cfg.providerDef.label})`,
                options,
            )
            if (!choice) return

            const key = Object.keys(PROVIDERS).find((k) =>
                choice.includes(`(${k})`),
            )
            if (key) {
                cfg.setProvider(key)
                ctx.ui.notify(
                    `Voice provider → ${PROVIDERS[key]!.label}`,
                    "info",
                )
            }
        },
    })

    // ── /voice-model — pick Whisper model ──────────────────────────
    pi.registerCommand("voice-model", {
        description: "Pick the Whisper model for the active provider",
        handler: async (_args, ctx) => {
            const models = cfg.providerDef.models
            if (!models.length) {
                ctx.ui.notify("No model options for this provider", "warning")
                return
            }

            const options = models.map((m) => m.title)
            const choice = await ctx.ui.select(
                `Whisper model (current: ${cfg.model})`,
                options,
            )
            if (!choice) return

            const model = models.find((m) => m.title === choice)
            if (model) {
                cfg.setModel(model.value)
                ctx.ui.notify(`Whisper model → ${model.title}`, "info")
            }
        },
    })

    // ── /voice-mic — pick audio input device ───────────────────────
    pi.registerCommand("voice-mic", {
        description: "Pick the audio input device",
        handler: async (_args, ctx) => {
            const devices = listInputDevices()
            if (!devices.length) {
                ctx.ui.notify("No audio input devices found", "warning")
                return
            }

            const options = ["System default", ...devices]
            const choice = await ctx.ui.select(
                `Microphone (current: ${cfg.mic || "system default"})`,
                options,
            )
            if (!choice) return

            const mic = choice === "System default" ? "" : choice
            cfg.setMic(mic)
            ctx.ui.notify(`Microphone → ${mic || "system default"}`, "info")
        },
    })

    // ── /voice-language — set language or auto-detect ──────────────
    pi.registerCommand("voice-language", {
        description: "Set transcription language or auto-detect",
        handler: async (_args, ctx) => {
            const options = LANGUAGES.map((l) => l.title)
            const current =
                LANGUAGES.find((l) => l.value === cfg.language)?.title ??
                "Auto-detect"
            const choice = await ctx.ui.select(
                `Language (current: ${current})`,
                options,
            )
            if (!choice) return

            const lang = LANGUAGES.find((l) => l.title === choice)
            if (lang) {
                cfg.setLanguage(lang.value)
                ctx.ui.notify(`Language → ${lang.title}`, "info")
            }
        },
    })

    // ── /voice-terms — manage custom vocabulary (known words) ───────
    pi.registerCommand("voice-terms", {
        description: "Manage custom vocabulary (known words) for transcription",
        handler: async (args, ctx) => {
            // Inline form: /voice-terms yuyudhan, GitNexus, kanata
            const inline = args.trim()
            if (inline) {
                cfg.setCustomTerms(inline)
                const saved = cfg.savedTerms
                ctx.ui.notify(
                    saved ? `Custom terms → ${saved}` : "Custom terms cleared",
                    "info",
                )
                return
            }

            // Menu form: /voice-terms (no args)
            const saved = cfg.savedTerms
            const envTerms = mergeTerms(process.env[TERMS_ENV] ?? "")
            const title =
                `Custom terms — saved: ${saved || "(none)"}` +
                (envTerms ? `  |  ${TERMS_ENV}: ${envTerms}` : "")
            const action = await ctx.ui.select(title, [
                "Edit saved terms…",
                "Clear saved terms",
                "Cancel",
            ])
            if (!action || action === "Cancel") return

            if (action === "Clear saved terms") {
                cfg.setCustomTerms("")
                ctx.ui.notify("Saved custom terms cleared", "info")
                return
            }

            const entered = await ctx.ui.input(
                "Custom terms (comma-separated)",
                "yuyudhan, GitNexus, TypeScript, kanata",
            )
            if (entered === undefined) return // cancelled

            cfg.setCustomTerms(entered)
            const next = cfg.savedTerms
            ctx.ui.notify(
                next ? `Custom terms → ${next}` : "Custom terms cleared",
                "info",
            )
        },
    })

    // ── Startup check ──────────────────────────────────────────────
    pi.on("session_start", async (_event, ctx) => {
        if (!hasSox()) {
            ctx.ui.notify(
                "pi-voice: sox not found (brew install sox)",
                "warning",
            )
        }
    })
}
