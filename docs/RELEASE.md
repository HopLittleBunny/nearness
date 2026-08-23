# Release checklist

## Automated

- `npm audit --omit=dev`
- `npm run test`
- `npm run build`
- real read-only Messages import into a disposable vault
- plaintext-leak scan of disposable vault bytes
- live structured OpenAI analysis with a synthetic conversation
- Electron secure-storage and window-load smoke test
- DMG and ZIP package build

## Manual

- First-run onboarding at desktop and narrow widths
- Atlas, People, person context, evidence, Care and Privacy & AI flows
- WhatsApp cancel, valid import and duplicate protection
- Messages Full Disk Access recovery copy
- vCard contact preview
- complete vault deletion phrase
- fresh install on a second macOS user account

## Public distribution gate

- Apple Developer ID Application certificate available
- hardened runtime signing passes
- notarization and stapling pass
- Gatekeeper verification on a clean Mac
- GitHub release checksums attached
- privacy and security documents reviewed
