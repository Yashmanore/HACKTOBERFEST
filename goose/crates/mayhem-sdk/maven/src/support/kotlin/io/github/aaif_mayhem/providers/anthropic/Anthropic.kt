package io.github.aaif_mayhem.providers.anthropic

public fun provider(
    apiKey: String,
    baseUrl: String? = null,
    betaHeaders: List<String> = emptyList(),
): io.github.aaif_mayhem.Provider = io.github.aaif_mayhem.anthropicProvider(apiKey, baseUrl, betaHeaders)

public fun defaultModel(): String = io.github.aaif_mayhem.anthropicDefaultModel()
