# Threat model

## Assets

Message bodies, names and handles, relationship notes, offline moments, symbolic meanings, portraits, consent receipts, OpenAI credentials and the vault root key.

## Trust boundaries

- The sandboxed renderer is untrusted and has no Node.js access.
- Only `app://nearness` and the exact configured local development origin may invoke privileged IPC.
- IPC channels validate argument count, field allowlists, types, sizes and identifiers.
- File paths for WhatsApp/vCard come from native dialogs or renderer-supplied bytes with a 250 MB cap. The renderer cannot choose the Messages database path.
- Packaged assets are served through a traversal-safe custom protocol.
- External navigation is denied except for a narrow HTTPS allowlist opened in the system browser.

## Threats addressed

- renderer compromise attempting arbitrary filesystem/database/key access;
- prototype pollution or confused-deputy calls through open-ended IPC payloads;
- malicious chat text attempting prompt injection;
- ZIP/TXT size abuse;
- path traversal through the application protocol;
- duplicate or interrupted imports corrupting derived state;
- ciphertext damage being silently treated as empty data;
- plaintext remnants after source or vault deletion.

## Controls

Context isolation, renderer sandboxing, no Node integration, closed IPC schemas, trusted-sender checks, content security policy, AES-256-GCM authentication, HKDF-separated field key, keyed hashes, `secure_delete`, WAL checkpointing, source vacuuming, durable import jobs, rollback on cancellation/startup recovery, model-output schemas, evidence-reference validation and prohibited-inference screening.

## Out of scope

A fully compromised operating system or unlocked user session; a malicious OpenAI account administrator; weaknesses in macOS Keychain or Electron itself; intentional disclosure through a readable export; and media content, because Nearness does not ingest media bytes in this release.

## Required release evidence

Automated unit/golden tests, dependency audit, CycloneDX SBOM, packaged-app smoke test with a fresh vault and an upgraded vault, Gatekeeper verification for signed public builds, and a private security-reporting channel.
