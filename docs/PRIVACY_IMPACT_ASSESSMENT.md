# Privacy impact assessment

## Scope

Nearness processes relationship histories belonging to the user and containing communications from other people. Those other people have generally not consented to Nearness or to optional AI processing. This asymmetry is the product’s central privacy risk.

## Purpose limitation

Allowed purpose: private reflection on the user’s own relationships and user-directed Care planning. Prohibited purposes: covert monitoring, employee surveillance, partner surveillance, analysis of a child, diagnosis, deception detection, safety classification, or inferring protected or intimate traits.

## Data flow

- WhatsApp ZIP/TXT and vCard files are selected explicitly.
- Apple Messages is copied read-only to a temporary directory and the copy is removed after import.
- Parsing, identity proposals, structural signals and Care run locally.
- Personal payload fields are encrypted at rest with AES-256-GCM using a derived field key. The root key and optional OpenAI key are protected separately by macOS secure storage.
- Media bytes are not ingested.
- Optional AI processing occurs only after the exact redacted JSON, exclusions, provider, model, estimated input size, retention disclosure and payload hash are shown and approved.
- Every AI run creates a local consent receipt and processing record. Requests use `store: false`; Nearness does not claim this proves Zero Data Retention for the user’s OpenAI project.

## Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Other participants did not consent | AI stays off by default; per-person disable control; exact per-run boundary; misuse notice |
| Sensitive plaintext at rest | field encryption, keyed equality hashes, macOS secure storage, restrictive key-file permissions |
| Re-identification in AI payloads | recursive redaction, opaque relationship label, user excerpt exclusion, payload hash |
| Prompt injection inside chats | excerpts are declared untrusted data in the developer instruction; strict response schema |
| Overclaiming from incomplete channels | three-level recency, explicit missing channels, manual offline moments, calibrated evidence requirements |
| Harmful reconnection | revive/repair suggests reflection until the user confirms reconnection feels safe |
| Covert ranking or diagnosis | no composite relationship score and a prohibited-inference catalogue enforced in code |
| Partial or duplicated imports | durable jobs, cancellation rollback, interrupted-import recovery and stable conversation identity |
| Unclear deletion | per-source removal, API-key removal and whole-vault/key destruction in product UI |

## Children and vulnerable people

Nearness is not designed for monitoring minors or dependent adults. A user may have family messages involving them, but must not use the product to profile, supervise or make decisions about them. Public launch needs explicit age eligibility and legal review for target markets.

## Residual risks

An unlocked or compromised macOS account can inspect data while Nearness is running. Redaction is best-effort and cannot guarantee anonymisation of narrative details. The user’s OpenAI account terms and retention configuration remain outside Nearness’s control. A readable JSON export is no longer protected by the vault and must be stored carefully.

## Launch gate

Founder testing is appropriate with synthetic or personally selected histories. Broad public distribution additionally requires signed/notarized builds, jurisdiction-specific privacy/consumer review, a private vulnerability-reporting route and tested incident response.
