/**
 * Provider registry, configuration, and persisted runtime preferences.
 *
 * Static options come from the extension defaults. Runtime selections
 * (provider, model, mic, language) are persisted to a JSON file so
 * they survive across pi sessions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export interface ProviderDef {
    label: string
    kind: "cloud" | "local"
    endpoint: string | null
    apiKeyEnv: string | null
    defaultModel: string
    models: Array<{ value: string; title: string }>
}

export const PROVIDERS: Record<string, ProviderDef> = {
    groq: {
        label: "Groq",
        kind: "cloud",
        endpoint: "https://api.groq.com/openai/v1",
        apiKeyEnv: "GROQ_API_KEY",
        defaultModel: "whisper-large-v3",
        models: [
            { value: "whisper-large-v3", title: "Whisper Large v3" },
            {
                value: "whisper-large-v3-turbo",
                title: "Whisper Large v3 Turbo (faster)",
            },
            {
                value: "distil-whisper-large-v3-en",
                title: "Distil Whisper v3 (English only)",
            },
        ],
    },
    openai: {
        label: "OpenAI",
        kind: "cloud",
        endpoint: "https://api.openai.com/v1",
        apiKeyEnv: "OPENAI_API_KEY",
        defaultModel: "whisper-1",
        models: [
            { value: "whisper-1", title: "Whisper v1" },
            { value: "gpt-4o-transcribe", title: "GPT-4o Transcribe" },
            {
                value: "gpt-4o-mini-transcribe",
                title: "GPT-4o mini Transcribe",
            },
        ],
    },
    custom: {
        label: "Custom endpoint",
        kind: "cloud",
        endpoint: null,
        apiKeyEnv: null,
        defaultModel: "whisper-large-v3",
        models: [],
    },
}

export const LANGUAGES = [
    { value: "", title: "Auto-detect" },
    { value: "en", title: "English" },
    { value: "hi", title: "Hindi" },
    { value: "es", title: "Spanish" },
    { value: "fr", title: "French" },
    { value: "de", title: "German" },
    { value: "ja", title: "Japanese" },
    { value: "zh", title: "Chinese" },
] as const

// ---------------------------------------------------------------------------
// Preferences file (persisted runtime selections)
// ---------------------------------------------------------------------------

const PREFS_DIR = join(
    process.env.PI_CODING_AGENT_DIR || join(process.env.HOME!, ".pi", "agent"),
    "state",
    "voice",
)
const PREFS_FILE = join(PREFS_DIR, "prefs.json")

interface Prefs {
    provider?: string
    models?: Record<string, string> // per-provider model
    mic?: string
    language?: string
}

function loadPrefs(): Prefs {
    try {
        if (existsSync(PREFS_FILE)) {
            return JSON.parse(readFileSync(PREFS_FILE, "utf8"))
        }
    } catch {
        /* ignore corrupt file */
    }
    return {}
}

function savePrefs(prefs: Prefs): void {
    try {
        mkdirSync(dirname(PREFS_FILE), { recursive: true })
        writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 4) + "\n")
    } catch {
        /* best-effort */
    }
}

// ---------------------------------------------------------------------------
// Config object — mirrors opencode-speech-to-text's reactive getters
// ---------------------------------------------------------------------------

export interface VoiceConfig {
    readonly provider: string
    readonly providerDef: ProviderDef
    readonly endpoint: string | null
    readonly apiKeyEnv: string | null
    readonly apiKey: string | null
    readonly model: string
    readonly language: string
    readonly customTerms: string
    readonly cleanup: boolean
    readonly cleanupEndpoint: string
    readonly cleanupModel: string
    readonly cleanupModelFallback: string
    readonly cleanupApiKeyEnv: string
    readonly cleanupApiKey: string | null
    readonly autoStopSilence: boolean
    readonly mic: string
    setProvider(v: string): void
    setModel(v: string): void
    setLanguage(v: string): void
    setMic(v: string): void
}

const DEFAULT_PROVIDER = "groq"
const DEFAULT_CLEANUP_ENDPOINT = "https://api.groq.com/openai/v1"
const DEFAULT_CLEANUP_MODEL = "llama-3.3-70b-versatile"
const DEFAULT_CLEANUP_MODEL_FALLBACK = "llama-3.1-8b-instant"
const DEFAULT_CLEANUP_KEY_ENV = "GROQ_API_KEY"

export function createConfig(): VoiceConfig {
    const prefs = loadPrefs()

    return {
        get provider() {
            const p = prefs.provider ?? DEFAULT_PROVIDER
            return PROVIDERS[p] ? p : DEFAULT_PROVIDER
        },
        get providerDef() {
            return PROVIDERS[this.provider]!
        },
        get endpoint() {
            return this.providerDef.endpoint
        },
        get apiKeyEnv() {
            return this.providerDef.apiKeyEnv
        },
        get apiKey() {
            const env = this.apiKeyEnv
            return env ? (process.env[env] ?? null) : null
        },
        get model() {
            return (
                prefs.models?.[this.provider] ?? this.providerDef.defaultModel
            )
        },
        get language() {
            return prefs.language ?? ""
        },
        get customTerms() {
            return ""
        },
        get cleanup() {
            return true
        },
        get cleanupEndpoint() {
            return DEFAULT_CLEANUP_ENDPOINT
        },
        get cleanupModel() {
            return DEFAULT_CLEANUP_MODEL
        },
        get cleanupModelFallback() {
            return DEFAULT_CLEANUP_MODEL_FALLBACK
        },
        get cleanupApiKeyEnv() {
            return DEFAULT_CLEANUP_KEY_ENV
        },
        get cleanupApiKey() {
            return process.env[this.cleanupApiKeyEnv] ?? null
        },
        get autoStopSilence() {
            return false
        },
        get mic() {
            return prefs.mic ?? ""
        },

        setProvider(v: string) {
            prefs.provider = v
            savePrefs(prefs)
        },
        setModel(v: string) {
            prefs.models = prefs.models ?? {}
            prefs.models[this.provider] = v
            savePrefs(prefs)
        },
        setLanguage(v: string) {
            prefs.language = v
            savePrefs(prefs)
        },
        setMic(v: string) {
            prefs.mic = v
            savePrefs(prefs)
        },
    }
}
