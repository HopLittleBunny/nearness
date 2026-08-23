# Contributing to Nearness

Nearness welcomes focused issues and pull requests.

Before submitting code:

```bash
npm install
npm run verify
```

Changes that touch relationship interpretation must preserve these rules:

- no ranking or composite “friend score”;
- observed, user-told, desired and unknown evidence remain distinct;
- quiet is not automatically decline;
- family and friendship use different lenses;
- rest, boundaries and conclusions never produce reconnect prompts;
- model output cites visible evidence and names missing channels;
- gender, nationality, name and language never determine an individual’s relational style;
- research-informed is not described as clinically or psychometrically validated.

Never commit real chat exports, Messages databases, contact cards, API keys, vault files or generated archives. Tests must use synthetic fixtures.
