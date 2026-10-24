# Mayhemy

Put `mayhemy` in your $PATH if you want to launch via:

```
mayhemy .
```

This will open mayhem GUI from any path you specify

# Unregister Deeplink Protocols (macos only)

`unregister-deeplink-protocols.js` is a script to unregister the deeplink protocol used by mayhem like `mayhem://`.
This is handy when you want to test deeplinks with the development version of Mayhem.

# Usage

To unregister the deeplink protocols, run the following command in your terminal:
Then launch Mayhem again and your deeplinks should work from the latest launched mayhem application as it is registered on startup.

```bash
node scripts/unregister-deeplink-protocols.js
```

