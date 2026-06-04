/**
 * Microphone recording via sox, with a small state machine.
 *
 * States: idle → recording → processing → idle
 *
 * Manual mode: caller stops via stopRecording() (SIGINT to sox), then
 * runs the pipeline. The intentionalStop flag prevents a manual SIGINT
 * from being reported as an error (sox exits non-zero on SIGINT).
 */

import { existsSync, unlinkSync } from "node:fs"
import { execSync, spawn, type ChildProcess } from "node:child_process"

export const WAV_FILE = "/tmp/pi-voice-recording.wav"

type RecorderState = "idle" | "recording" | "processing"

let soxProc: ChildProcess | null = null
let soxStderr = ""
let state: RecorderState = "idle"
let intentionalStop = false

export function getState(): RecorderState {
    return state
}

export function markProcessing(): void {
    state = "processing"
}

export function idle(): void {
    state = "idle"
    intentionalStop = false
}

export function hasSox(): boolean {
    try {
        execSync("command -v sox", { stdio: "ignore" })
        return true
    } catch {
        return false
    }
}

function forceKillSox(): void {
    if (soxProc) {
        try {
            process.kill(soxProc.pid!, "SIGKILL")
        } catch {
            /* already dead */
        }
        soxProc = null
    }
    try {
        execSync("pkill -9 -f 'sox.*pi-voice-recording'", {
            stdio: "ignore",
        })
    } catch {
        /* nothing to kill */
    }
}

export interface RecorderCallbacks {
    onError?: (msg: string) => void
    onAutoStop?: () => void
}

/**
 * Start recording. Returns true if started successfully.
 */
export function startRecording(
    mic: string,
    autoStopSilence: boolean,
    callbacks: RecorderCallbacks = {},
): boolean {
    if (soxProc) return false

    forceKillSox()
    try {
        if (existsSync(WAV_FILE)) unlinkSync(WAV_FILE)
    } catch {
        /* ignore */
    }

    soxStderr = ""
    intentionalStop = false

    const inputArgs = mic ? ["-t", "coreaudio", mic] : ["-d"]
    // Trim leading silence; in auto mode also stop after trailing pause
    const silenceArgs = autoStopSilence
        ? ["silence", "1", "0.1", "1%", "1", "2.0", "2%"]
        : ["silence", "1", "0.1", "1%"]

    soxProc = spawn(
        "sox",
        [
            ...inputArgs,
            "-r",
            "16000",
            "-c",
            "1",
            "-b",
            "16",
            WAV_FILE,
            ...silenceArgs,
        ],
        { stdio: ["ignore", "ignore", "pipe"], detached: false },
    )

    soxProc.stderr!.on("data", (chunk: Buffer) => {
        soxStderr += chunk.toString()
    })

    soxProc.on("error", (err: Error) => {
        soxProc = null
        if (state === "recording") {
            state = "idle"
            callbacks.onError?.(`Recording failed: ${err.message}`)
        }
    })

    soxProc.on("exit", (code: number | null) => {
        soxProc = null
        if (state !== "recording") return
        if (intentionalStop) return
        if (autoStopSilence && (code === 0 || code === null)) {
            callbacks.onAutoStop?.()
            return
        }
        state = "idle"
        const line = soxStderr.trim().split("\n").pop()
        callbacks.onError?.(
            line || `Recording stopped unexpectedly (code ${code})`,
        )
    })

    state = "recording"
    return true
}

/** Signal sox to finalize the WAV (manual stop). */
export function stopRecording(): void {
    intentionalStop = true
    if (soxProc) soxProc.kill("SIGINT")
}

/** Abort current recording without transcribing. */
export function cancelRecording(): void {
    state = "idle"
    intentionalStop = true
    forceKillSox()
}

/** Wait for sox to exit after a stop, with a hard-timeout fallback. */
export async function waitForExit(timeoutMs = 3000): Promise<void> {
    const start = Date.now()
    // eslint-disable-next-line no-unmodified-loop-condition -- soxProc is nulled by event handlers
    while (soxProc && Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 50))
    }
    if (soxProc) forceKillSox()
}

/** List macOS audio input devices for the microphone picker. */
export function listInputDevices(): string[] {
    try {
        const json = execSync(
            "system_profiler SPAudioDataType -json 2>/dev/null",
            { encoding: "utf-8", timeout: 5000 },
        )
        const data = JSON.parse(json)
        return (data.SPAudioDataType?.[0]?._items || [])
            .filter(
                (d: Record<string, unknown>) =>
                    d.coreaudio_input_source != null,
            )
            .map(
                (d: Record<string, string>) =>
                    d.coreaudio_device_name || d._name,
            )
            .filter(Boolean)
    } catch {
        return []
    }
}
