package io.github.aaif_mayhem.providers.openai

public fun provider(
    apiKey: String,
    baseUrl: String? = null,
): io.github.aaif_mayhem.Provider = io.github.aaif_mayhem.openaiProvider(apiKey, baseUrl)

public fun defaultModel(): String = io.github.aaif_mayhem.openaiDefaultModel()
