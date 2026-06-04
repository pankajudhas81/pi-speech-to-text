/**
 * Cloud transcription via the OpenAI-compatible
 * POST /audio/transcriptions endpoint.
 *
 * Shared by Groq, OpenAI, and any custom compatible endpoint.
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import type { VoiceConfig } from "./config"

const MAX_BYTES = 25 * 1024 * 1024 // OpenAI/Groq upload limit
const WAV_HEADER_BYTES = 44 // empty capture is just the WAV header
const TIMEOUT_MS = 60_000

/** Allowlisted API host prefixes for transcription requests. */
const ALLOWED_HOSTS = [
    "https://api.groq.com/",
    "https://api.openai.com/",
] as const

function shouldRetry(status: number): boolean {
    return status === 408 || status === 429 || status >= 500
}

function wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
}

function joinUrl(base: string, path: string): string {
    return base.replace(/\/+$/, "") + "/" + path
}

/** Whisper biasing prompt is capped (~224 tokens); keep it short. */
function truncateTerms(terms: string, maxChars = 800): string {
    return terms.length > maxChars ? terms.slice(0, maxChars) : terms
}

export interface TranscribeResult {
    text?: string
    error?: string
}

export async function transcribe(opts: {
    wavPath: string
    cfg: VoiceConfig
    signal?: AbortSignal
}): Promise<TranscribeResult> {
    const { wavPath, cfg, signal } = opts

    if (!cfg.endpoint) {
        return { error: "No endpoint configured for this provider" }
    }
    if (!cfg.apiKey) {
        return {
            error: `Set ${cfg.apiKeyEnv || "the API key env var"} for ${cfg.providerDef.label}`,
        }
    }
    if (!existsSync(wavPath)) {
        return { error: "No recording captured (sox produced no file)" }
    }

    const size = statSync(wavPath).size
    if (size <= WAV_HEADER_BYTES) {
        return { text: "" } // empty capture → caller reports "no speech"
    }
    if (size > MAX_BYTES) {
        return {
            error: "Recording exceeds 25 MB API limit — shorten it",
        }
    }

    // safe: endpoint comes from the static PROVIDERS registry
    const targetUrl = joinUrl(cfg.endpoint, "audio/transcriptions")
    const isAllowed = ALLOWED_HOSTS.some((h) => targetUrl.startsWith(h))
    if (!isAllowed && cfg.provider !== "custom") {
        return { error: `Blocked: unknown endpoint ${cfg.endpoint}` }
    }

    const buf = readFileSync(wavPath)

    for (let attempt = 0; attempt <= 2; attempt++) {
        try {
            const form = new FormData()
            form.append(
                "file",
                new Blob([buf], { type: "audio/wav" }),
                "audio.wav",
            )
            form.append("model", cfg.model)
            form.append("response_format", "json")
            if (cfg.customTerms) {
                form.append("prompt", truncateTerms(cfg.customTerms))
            }
            if (cfg.language) {
                form.append("language", cfg.language)
            }

            const fetchSignal = signal ?? AbortSignal.timeout(TIMEOUT_MS)

            const resp = await globalThis.fetch(targetUrl, {
                method: "POST",
                headers: { Authorization: `Bearer ${cfg.apiKey}` },
                body: form,
                signal: fetchSignal,
            })

            if (!resp.ok) {
                if (attempt < 2 && shouldRetry(resp.status)) {
                    await wait(250 * 2 ** attempt)
                    continue
                }
                const body = await resp.text()
                let msg = `Transcription error ${resp.status}`
                try {
                    msg = JSON.parse(body)?.error?.message || msg
                } catch {
                    /* use fallback msg */
                }
                return { error: msg }
            }

            const data = (await resp.json()) as { text?: string }
            return { text: (data.text || "").trim() }
        } catch (err: unknown) {
            const e = err as Error
            if (e.name === "TimeoutError" || e.name === "AbortError") {
                return { error: "Transcription timed out (60 s)" }
            }
            if (attempt < 2) {
                await wait(250 * 2 ** attempt)
                continue
            }
            return { error: `Transcription failed: ${e.message}` }
        }
    }

    return { error: "Transcription failed after retries" }
}
