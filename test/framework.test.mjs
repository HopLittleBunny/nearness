import { describe, expect, it } from 'vitest'
import { calculateCareAlignment, deriveLocalRelationshipSignals, validateObservation } from '../electron/domain/framework.mjs'

describe('relationship framework', () => {
  const now = new Date('2026-08-24T00:00:00Z')

  it('treats quiet by intention rather than universal cadence', () => {
    expect(calculateCareAlignment({ intention: 'rest', cadenceDays: 30, lastMeaningfulAt: '2020-01-01T00:00:00Z', coverage: 'longitudinal', now }).state).toBe('intentionally_quiet')
    expect(calculateCareAlignment({ intention: 'preserve', cadenceDays: null, lastMeaningfulAt: '2020-01-01T00:00:00Z', coverage: 'longitudinal', now }).state).toBe('aligned')
    expect(calculateCareAlignment({ intention: 'deepen', cadenceDays: 30, lastMeaningfulAt: '2026-06-01T00:00:00Z', coverage: 'longitudinal', now }).state).toBe('under_invested')
  })

  it('derives communication signals without a relationship score', () => {
    const signals = deriveLocalRelationshipSignals([
      { id: '1', sentAt: '2026-01-01T00:00:00Z', isFromMe: true, body: 'I will call next week', attachmentCount: 0 },
      { id: '2', sentAt: '2026-01-01T01:00:00Z', isFromMe: false, body: 'great', attachmentCount: 1 },
      { id: '3', sentAt: '2026-08-20T00:00:00Z', isFromMe: false, body: 'hello again', attachmentCount: 0 },
    ], { now })
    expect(signals.messageCount).toBe(3)
    expect(signals.recentEpisodeCount).toBe(1)
    expect(signals.openLoopCandidates[0].messageId).toBe('1')
    expect(signals).not.toHaveProperty('score')
  })

  it('rejects prohibited diagnostic language', () => {
    expect(validateObservation({ statement: 'This proves narcissism.', construct: 'mutuality', evidenceType: 'model_inference' })).toBe(false)
    expect(validateObservation({ statement: 'Visible replies become shorter in the latest period.', construct: 'responsiveness', evidenceType: 'observed_history' })).toBe(true)
  })
})
