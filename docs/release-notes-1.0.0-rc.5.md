# Nearness 1.0.0-rc.5

This release candidate replaces the demo-shaped rc.4 relationship layer with the complete communication-ecology architecture required for founder use.

## Product

- Composable roles across friendship, family, intimate, professional, group and caregiving relationships.
- Relationship-specific norms, symbolic shorthand, offline calls/in-person moments, Expression Match and a user-only multi-dimensional experience profile.
- Visible touch, interaction episode and user-confirmed meaningful contact are separate throughout the model and UI.
- Independent per-person controls for analysis, Care and atlas visibility.
- WhatsApp timezone/date confirmation, metadata-only media awareness, archived Messages selection, vCard country context, live progress, cancellation and rollback.

## AI and governance

- Every excerpt and the exact final JSON are inspectable and selectively excludable.
- Consent is bound to the exact payload hash and recorded locally with provider/model/retention metadata.
- Prompt-injection instructions, strict output schema, valid evidence references, prohibited-inference screening and rejected-hypothesis memory are enforced.
- `store: false` is disclosed accurately without claiming Zero Data Retention.

## Reliability and security

- Schema v3 migration, versioned parser/episode provenance and recovery of interrupted imports.
- Upgraded WhatsApp conversation identity prevents duplicate history across renamed or extended exports, including rc.4 upgrades.
- HKDF-separated field encryption, loud ciphertext-integrity failures, secure deletion, trusted IPC senders, closed request schemas and a traversal-safe application protocol.
- Responsive dialogs now trap focus, close with Escape and restore focus.
- CI runs tests, production build, production dependency audit and CycloneDX SBOM generation.

## Verification

- 38 automated tests pass.
- Production dependency audit reports zero vulnerabilities.
- 200,000-event synthetic performance run: ~26 seconds encrypted import with responsive batches, ~0.48 seconds atlas listing and ~2.8 seconds for a capped 20,000-event person detail.
- Fresh-vault packaged launch and rc.4 → rc.5 packaged migration both pass.

## Distribution status

The DMG and ZIP are founder-testable but unsigned. Apple Developer ID signing and notarization remain mandatory before calling this a frictionless public macOS release.
