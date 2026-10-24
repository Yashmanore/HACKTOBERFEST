package io.github.aaif_mayhem.providers.databricks

public fun provider(host: String, token: String): io.github.aaif_mayhem.Provider =
    io.github.aaif_mayhem.databricksProvider(host, token)

public fun defaultModel(): String = io.github.aaif_mayhem.databricksDefaultModel()
