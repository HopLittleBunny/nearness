# Communication ecology architecture

Nearness treats an archive as partial evidence about communication, not as the relationship itself. The implementation keeps seven authority layers separate:

1. source manifest — where an export came from, parser version, locale, timezone and media policy;
2. immutable communication events — messages and source-reported media markers;
3. media metadata — type and provenance only, never media bytes in the current product;
4. derived interaction episodes — reproducible structural groupings with a versioned algorithm;
5. user meaning — roles, norms, symbolic shorthand, offline moments and lived context;
6. model hypotheses — evidence-referenced, calibrated and reversible observations;
7. assessments and Care — user self-reports and intention-led suggestions, never a score.

## Recency is three different facts

- **Last visible touch** is the latest attributable message or media event.
- **Last interaction episode** is the latest structurally substantive exchange visible in imported data.
- **Last meaningful contact** exists only when the user marks an offline moment meaningful.

Care uses the highest available authority and names it. A media marker or one-way group contribution is never silently relabelled as meaningful contact.

## Relationship grammar

Relationships are composable. A sibling can also be a collaborator and caregiver. The active lenses are assembled from declared roles and forms:

- friendship: companionship, mutual knowing, reliability, support fit and shared activity;
- family: affection, family identity, obligation, autonomy, ambivalence and ritual;
- intimate: responsiveness, intimacy, commitment, shared tasks, power and repair;
- professional: role clarity, trust, reliability, mutual support and boundaries;
- group: participation, group-carried continuity, belonging and collective history;
- caregiving: dependency, practical care, capacity, autonomy and boundaries.

These lenses create reflection prompts. They do not create demographic predictions or an aggregate quality rating.

## Culture and gender

Nearness does not infer culture from a name, nationality or language, and does not infer emotional ability from gender. Users may declare communication norms globally or for one relationship. Relationship-specific meaning outranks generic context. Golden tests confirm that structural episode results do not change when names or demographic descriptions change.

## Media boundary

The current release is text-first and media-aware. It records that an image, sticker, voice note, video or document event existed when the source reports it. It does not copy, open, transcribe, OCR or send that media. AI payloads replace media-marker text with an explicit metadata-only notice.

## Versioning

Parser and interaction-algorithm versions are stored with source and derived records. New algorithms must create superseding derived data, not rewrite imported events or silently reinterpret prior assessments.
