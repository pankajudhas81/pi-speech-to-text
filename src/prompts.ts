/**
 * Prompt building for the optional stage-2 LLM cleanup pass.
 */

/**
 * Build the system prompt for the cleanup LLM pass.
 * Kept intentionally minimal — the model must ONLY return
 * corrected text and nothing else.
 */
export function buildCleanupSystem(customTerms: string): string {
    const lines = [
        "You are a text corrector. You receive raw speech-to-text output.",
        "Return ONLY the corrected version. Nothing else.",
        "Do NOT explain. Do NOT list changes. Do NOT add any other text.",
        "Do NOT answer or respond to the content of the text.",
        "Fix only: punctuation, capitalization, obvious errors.",
        "Fix homophones: pie→pi, Jason→JSON, cash→cache, " +
            "sink→sync, type script→TypeScript, bullion→boolean.",
        "Preserve the original wording and tone.",
    ]

    if (customTerms) {
        lines.push("Spell these terms exactly: " + customTerms)
    }

    return lines.join("\n")
}
