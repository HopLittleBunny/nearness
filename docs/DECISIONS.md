# Product decisions and assumptions

Updated: 24 August 2026

These decisions were made to turn the concept into a founder-testable release without waiting for approval on reversible product choices.

## Product shape

- Built a macOS desktop application, not a browser-only service, because direct Apple Messages access and local secure storage require a native boundary.
- Preserved two modes: **Understand** for interpretation and **Care** for action. Importing a person never enrolls them in reminders.
- Replaced the v2 beige dashboard language with a dark editorial “constellation observatory” system: bone serif type, midnight field, restrained gold/jade evidence marks and progressive folds instead of card grids.
- Kept the atlas spatial, but made closeness user-selected. Message volume only affects visible-history descriptions.
- Modelled family, chosen family and household ties in the same universe with a distinct bond system.

## Privacy and architecture

- Chose local SQLite plus field-level AES-256-GCM encryption rather than a hosted database.
- Put filesystem, database, decryption and API access in Electron’s main process; the sandboxed renderer receives only narrow IPC methods.
- Store handles/external IDs as keyed HMACs for equality matching and encrypt the readable values.
- Read Apple Messages from a temporary copied database with no writes to the original.
- Do not use AI during import. AI is a per-person, per-run opt-in after payload inspection.
- Use OpenAI Responses API with `gpt-5.6-luna`, low reasoning effort, strict JSON schema and `store: false` as the current cost/quality default.
- Reuse the founder key only by importing it into macOS secure storage; never copy it into source, logs, exports or the vault.

## Relationship interpretation

- Rejected a friend score, leaderboard and automatic “fading friend” label.
- Use a multi-axis ontology rather than a single friendship category.
- Separate observed history, user-told meaning, user-desired intention and unknown/missing evidence throughout the UI and database.
- Use research constructs as lenses, not diagnostic labels or a claim of scientific validation.
- Allow name and handle matching to create identity proposals, but only exact cross-source handles are “strong”; name-only matches always require review.
- Care alignment compares visible activity with user intention/cadence and names missing channels. Rest, boundary and conclusion are valid aligned states.
- Reserve 30% of weekly capacity and show no more than three suggestions to prevent optimization pressure.

## Release choices

- Released source under MIT to lower adoption and contributor friction. This permits commercial forks; stronger copyleft can be reconsidered before a stable 1.0 if desired.
- Targeted macOS 13+ on Apple Silicon first. WhatsApp/vCard logic is portable, but Apple Messages linking is Mac-only.
- Produced an unsigned founder-test DMG/ZIP. Public one-click trust requires an Apple Developer ID certificate and notarization, which cannot be fabricated by the build.
- Did not auto-import the founder’s chats into the durable vault. The app makes source and conversation selection explicit so consent remains meaningful.
- Did not publish relationship portraits or sharing links. Safe sharing needs a separate redaction/product pass and is not required for private founder use.

## Assumptions

- The founder Mac is the first supported environment and can grant Full Disk Access to Nearness.
- Users have lawful access to the chat exports and local Messages history they choose to import.
- OpenAI analysis is optional and uses the user’s own API account; the product remains useful through local signals and manual context without it.
- Calls, meetings and other messaging services are often missing. The product treats coverage as incomplete unless the user supplies context.
