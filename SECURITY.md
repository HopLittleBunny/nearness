# Security

## Supported release

Security fixes are applied to the latest release candidate and stable release.

## Reporting a vulnerability

Do not open a public issue containing private chat data, API keys, database files or an exploitable vulnerability. Until a dedicated security mailbox exists, open a GitHub issue containing no exploit details and request a private maintainer contact.

## Security model

- Electron renderer sandboxing, context isolation and no Node integration.
- A strict preload allowlist instead of a generic IPC bridge.
- Navigation denied outside the app; HTTPS links open externally.
- Content Security Policy forbids remote scripts, objects and frames.
- AES-256-GCM encryption for personal payload fields.
- HMAC-SHA-256 equality keys for source identities, external IDs and message hashes.
- macOS secure storage for the vault key and optional OpenAI key.
- Read-only copying for Apple Messages imports.
- No remote Nearness backend or telemetry in the current release.
- Explicit user consent before each AI analysis or answer.

## Known boundaries

An unlocked Mac account that can run arbitrary code can potentially inspect Nearness while the app is open. Local encryption protects data at rest; it is not a defence against a fully compromised operating system. JSON exports are readable and must be stored accordingly.

Release builds should be signed with an Apple Developer ID certificate and notarized before broad distribution.
