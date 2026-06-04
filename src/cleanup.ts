/**
 * Stage-2 cleanup: send the raw transcription to a fast chat model
 * to fix punctuation, enforce custom terms, and fix homophones.
 */

import type { VoiceConfig } from "./config"
import { buildCleanupSystem } from "./prompts"

/**
 * Strip framing prefixes that LLMs sometimes add despite instructions,
 * e.g. "Here is the cleaned text:\n\n". Last-resort safety net.
 */
const FRAMING_RE =
    /^(?:here(?:'s| is)(?: the| your)?(?: cleaned(?:[- ]up?)?| transcri(?:ption|bed))?(?:\s+text)?[:.-]?\s*\n+)/i

function stripFraming(text: string): string {
    return text.replace(FRAMING_RE, "").trimStart()
}

function shouldRetry(status: number): boolean {
    return status === 408 || status === 429 || status >= 500
}

function wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
}

export interface CleanupResult {
    text?: string
    error?: string
}

async function tryModel(opts: {
    rawText: string
    system: string
    url: string
    model: string
    apiKey: string
    signal?: AbortSignal
}): Promise<CleanupResult> {
    const { rawText, system, url, model, apiKey, signal } = opts

    const body = {
        model,
        max_tokens: 2048,
        temperature: 0,
        messages: [
            { role: "system", content: system },
            { role: "user", content: rawText },
        ],
    }

    for (let attempt = 0; attempt <= 2; attempt++) {
        try {
            const fetchSignal = signal ?? AbortSignal.timeout(30_000)

            const resp = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: fetchSignal,
            })

            if (!resp.ok) {
                if (attempt < 2 && shouldRetry(resp.status)) {
                    await wait(250 * 2 ** attempt)
                    continue
                }
                return { error: `Cleanup failed (${resp.status})` }
            }

            const data = (await resp.json()) as {
                choices?: Array<{
                    message?: { content?: string }
                }>
            }
            const text = data?.choices?.[0]?.message?.content?.trim() || null

            if (text) return { text }

            if (attempt < 2) {
                await wait(250 * 2 ** attempt)
                continue
            }
            return { error: "Empty cleanup response" }
        } catch (err: unknown) {
            const e = err as Error
            if (e.name === "TimeoutError" || e.name === "AbortError") {
                return { error: "Cleanup timed out (30 s)" }
            }
            if (attempt < 2) {
                await wait(250 * 2 ** attempt)
                continue
            }
            return { error: `Cleanup error: ${e.message}` }
        }
    }

    return { error: "Cleanup failed after retries" }
}

export async function normalize(opts: {
    rawText: string
    cfg: VoiceConfig
    signal?: AbortSignal
}): Promise<CleanupResult> {
    const { rawText, cfg, signal } = opts

    if (!cfg.cleanupEndpoint) {
        return { error: "No cleanup endpoint configured" }
    }
    if (!cfg.cleanupApiKey) {
        return { error: `Set ${cfg.cleanupApiKeyEnv} for text cleanup` }
    }

    const system = buildCleanupSystem(cfg.customTerms)
    const url = cfg.cleanupEndpoint.replace(/\/+$/, "") + "/chat/completions"

    // Try the primary cleanup model first (llama-3.3-70b-versatile),
    // fall back to the secondary model (llama-3.1-8b-instant) on failure.
    const models = [cfg.cleanupModel, cfg.cleanupModelFallback]

    for (const model of models) {
        const result = await tryModel({
            rawText,
            system,
            url,
            model,
            apiKey: cfg.cleanupApiKey,
            signal,
        })

        if (result.text) return { text: stripFraming(result.text) }

        // If the primary model failed with a rate-limit or server error,
        // log and try the fallback. If it's the fallback that failed, give up.
        if (model === cfg.cleanupModel && cfg.cleanupModelFallback) {
            // Fall through to next model in the loop
        } else {
            return result
        }
    }

    return { error: "Cleanup failed after retries" }
}
