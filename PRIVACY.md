# Nearness privacy promise

Last updated: 28 August 2026

Nearness is designed so that importing relationship history does not require uploading it to a Nearness server. The current desktop release has no Nearness account, telemetry, analytics, ad SDK or remote database.

## Data stored on this Mac

Nearness stores imported source structure, encrypted message bodies, encrypted names and handles, user-provided relationship context, offline moments, generated portraits, consent receipts and care choices in its local app-data directory. The vault encryption key and optional OpenAI API key are separately protected using macOS secure storage. Media files are not copied; only source-reported metadata is stored.

Structural fields needed for queries—dates, counts, user-selected taxonomy values and source types—remain readable to the local database engine. Source handles and external IDs are stored as keyed hashes, not plaintext.

## Apple Messages access

Nearness asks macOS for read access to the Messages database. It copies the database and its WAL/SHM companions to a temporary directory, reads the copy and deletes the temporary directory after the import. It never writes to Apple’s Messages database.

Full Disk Access may be required. This permission is granted and revoked in macOS System Settings.

## WhatsApp and contacts

WhatsApp exports and vCards are selected through the macOS file picker. Parsing happens locally. Contact cards help propose cross-source identity matches; users confirm or reject each proposal.

## Optional OpenAI processing

AI analysis is optional and separate from import. Nearness shows every selected excerpt and the exact final JSON, lets the user exclude content, records consent against its payload hash and requires fresh consent after any change. Requests set `store: false`. OpenAI may still retain API inputs and outputs for abuse monitoring unless the user’s project has approved Zero Data Retention or Modified Abuse Monitoring; Nearness cannot verify that account setting. Do not use AI analysis for a person or conversation you are not comfortable processing under those terms.

## Export and deletion

Users can export a readable JSON archive of Nearness-derived data. They can remove individual sources, remove the OpenAI key, or delete the complete local vault and encryption keys. Complete deletion requires typing `DELETE MY NEARNESS VAULT`.

## Responsible use

Nearness is for reflection on the user’s own relationship history. It must not be used for covert monitoring of a partner, employee or child. Other participants in an imported chat have generally not consented to Nearness or optional AI processing. Analysis is therefore disabled per relationship when the user chooses and stays off until an exact per-run boundary is approved.

Removing the app does not automatically remove its macOS app-data directory. Use the in-app deletion control first if you want the vault removed.

## Sharing

The current release does not publish relationship portraits or contact another person. Any future sharing feature must default to private, redact third-party content and require deliberate user action.
