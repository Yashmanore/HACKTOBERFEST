package io.github.aaif_mayhem.providers.groq

public fun provider(apiKey: String): io.github.aaif_mayhem.Provider = io.github.aaif_mayhem.groqProvider(apiKey)

public fun defaultModel(): String = io.github.aaif_mayhem.groqDefaultModel()
