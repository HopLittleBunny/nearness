import { describe, expect, it } from 'vitest'
import {
  careRecency, deriveInteractionEpisodes, grammarKeysFor,
  reflectionPromptsFor, summarizeCommunicationEcology,
} from '../electron/domain/communication-ecology.mjs'

describe('communication ecology authority model', () => {
  const messages = [
    { id: 'd1', conversationId: 'direct', sentAt: '2026-01-01T00:00:00Z', isFromMe: true, isGroup: false, evidenceScope: 'direct_dyadic', modality: 'text' },
    { id: 'd2', conversationId: 'direct', sentAt: '2026-01-01T00:05:00Z', isFromMe: false, isGroup: false, evidenceScope: 'direct_dyadic', modality: 'text' },
    { id: 'g1', conversationId: 'group', sentAt: '2026-02-01T00:00:00Z', isFromMe: false, isGroup: true, evidenceScope: 'person_in_group', modality: 'sticker', attachmentCount: 1 },
  ]

  it('keeps dyadic and person-authored group evidence separate', () => {
    const ecology = summarizeCommunicationEcology(messages)
    expect(ecology.scopeCounts.direct_dyadic).toBe(2)
    expect(ecology.scopeCounts.person_in_group).toBe(1)
    expect(ecology.lastVisibleTouch).toBe('2026-02-01T00:00:00Z')
    expect(ecology.lastMeaningfulContact).toBeNull()
    expect(ecology).not.toHaveProperty('score')
  })

  it('does not call a one-way visible touch meaningful contact', () => {
    const ecology = summarizeCommunicationEcology([messages[2]])
    expect(ecology.lastVisibleTouch).toBe(messages[2].sentAt)
    expect(ecology.lastMeaningfulContact).toBeNull()
    expect(careRecency(ecology).authority).toBe('interaction_episode')
  })

  it('derives episodes structurally without sentiment or demographic inputs', () => {
    const baseline = deriveInteractionEpisodes(messages)
    const renamed = deriveInteractionEpisodes(messages.map((item) => ({ ...item, sender: item.isFromMe ? 'Me' : 'A different gendered or cultural name' })))
    expect(renamed).toEqual(baseline)
    expect(baseline[0].mutual).toBe(true)
    expect(baseline[0].substantive).toBe(true)
  })

  it('composes grammars for relationships with overlapping roles', () => {
    const person = { primaryClass: 'kin_family', roles: ['sibling', 'professional_collaborator', 'caregiver'], forms: ['mixed', 'caregiving'] }
    expect(grammarKeysFor(person)).toEqual(['family', 'professional', 'group', 'caregiving'])
    const prompts = reflectionPromptsFor(person)
    expect(prompts.some((item) => item.grammar === 'family' && item.dimension === 'obligation')).toBe(true)
    expect(prompts.some((item) => item.grammar === 'professional' && item.dimension === 'role clarity')).toBe(true)
    expect(prompts.some((item) => item.grammar === 'caregiving' && item.dimension === 'autonomy')).toBe(true)
  })
})
