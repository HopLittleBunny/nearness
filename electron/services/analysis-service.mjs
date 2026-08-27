import OpenAI from 'openai'
import { createHash } from 'node:crypto'
import { EXPERIENCE_DIMENSIONS, PROHIBITED_INFERENCES, RELATIONSHIP_FORMS, SOCIAL_WORLDS, TRAJECTORIES, validateObservation } from '../domain/framework.mjs'

const DEFAULT_MODEL = 'gpt-5.6-luna'
const MAX_EXCERPTS = 220
const MAX_BODY_CHARS = 700

function cleanText(value) {
  return String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
}

export function redactExcerpt(value, names = []) {
  let text = cleanText(value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi, '[email]')
    .replace(/(?<!\w)(?:\+?\d[\d\s().-]{6,}\d)(?!\w)/g, '[phone]')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]{2,}\s(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Ct|Boulevard|Blvd)\b/gi, '[address]')
  for (const name of names.filter((name) => String(name || '').trim().length >= 3).sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[person]')
  }
  return text.slice(0, MAX_BODY_CHARS)
}

function redactPayloadValue(value, names) {
  if (typeof value === 'string') return redactExcerpt(value, names)
  if (Array.isArray(value)) return value.map((item) => redactPayloadValue(item, names))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactPayloadValue(item, names)]))
  }
  return value
}

function payloadHash(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function containsProhibitedInference(value) {
  const text = String(value || '').toLowerCase()
  return PROHIBITED_INFERENCES.some((term) => text.includes(term))
}

function chooseRepresentativeMessages(messages, limit = MAX_EXCERPTS) {
  if (messages.length <= limit) return messages
  const selected = new Map()
  const add = (message) => message && selected.set(message.id, message)
  const sorted = [...messages].sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))

  for (const message of sorted.slice(0, 18)) add(message)
  for (const message of sorted.slice(-42)) add(message)

  const eventPattern = /\b(thank|sorry|miss you|love you|proud|congrat|birthday|wedding|funeral|hospital|help|need you|call me|promise|argument|upset|hurt|forgive|visit|trip|meet|dinner|lunch|tomorrow|next week|remember)\b/i
  for (const message of sorted) if (eventPattern.test(message.body || '')) add(message)

  const buckets = Math.max(1, limit - selected.size)
  const stride = Math.max(1, Math.floor(sorted.length / buckets))
  for (let index = 0; index < sorted.length && selected.size < limit; index += stride) add(sorted[index])
  return [...selected.values()].sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt)).slice(0, limit)
}

function analysisSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['portrait', 'observations'],
    properties: {
      portrait: {
        type: 'object', additionalProperties: false,
        required: ['headline', 'essence', 'story', 'relationshipForms', 'socialWorlds', 'trajectory', 'coverageCaveat'],
        properties: {
          headline: { type: 'string', maxLength: 180 },
          essence: { type: 'string', maxLength: 520 },
          story: { type: 'string', maxLength: 1400 },
          relationshipForms: { type: 'array', maxItems: 4, items: { type: 'string', enum: RELATIONSHIP_FORMS } },
          socialWorlds: { type: 'array', maxItems: 4, items: { type: 'string', enum: SOCIAL_WORLDS } },
          trajectory: { type: 'string', enum: TRAJECTORIES },
          coverageCaveat: { type: 'string', maxLength: 360 },
        },
      },
      observations: {
        type: 'array', maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          required: ['statement', 'construct', 'evidenceType', 'evidenceRefs', 'timeStart', 'timeEnd', 'missing', 'confidence', 'alternatives'],
          properties: {
            statement: { type: 'string', maxLength: 420 },
            construct: { type: 'string', enum: EXPERIENCE_DIMENSIONS },
            evidenceType: { type: 'string', enum: ['observed_history', 'model_inference'] },
            evidenceRefs: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
            timeStart: { type: ['string', 'null'] },
            timeEnd: { type: ['string', 'null'] },
            missing: { type: 'array', maxItems: 5, items: { type: 'string' } },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            alternatives: { type: 'array', maxItems: 3, items: { type: 'string' } },
          },
        },
      },
    },
  }
}

function answerSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['answer', 'caveat', 'evidenceRefs'],
    properties: {
      answer: { type: 'string', maxLength: 1200 },
      caveat: { type: 'string', maxLength: 320 },
      evidenceRefs: { type: 'array', maxItems: 8, items: { type: 'string' } },
    },
  }
}

function parseOutput(response) {
  const text = response.output_text || response.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text
  if (!text) throw new Error('The analysis returned no usable output.')
  return JSON.parse(text)
}

export class AnalysisService {
  constructor({ vault, keyStore, model = DEFAULT_MODEL }) {
    this.vault = vault
    this.keyStore = keyStore
    this.model = model
  }

  async client() {
    const apiKey = await this.keyStore.getOpenAiKey()
    if (!apiKey) throw new Error('Add an OpenAI API key in Privacy & AI before running analysis.')
    return new OpenAI({ apiKey })
  }

  buildPayload(personId) {
    const person = this.vault.getPerson(personId)
    if (!person) throw new Error('Person not found.')
    const messages = this.vault.getMessagesForPerson(personId)
    if (!messages.length) throw new Error('There is no visible message history for this person yet.')
    const selected = chooseRepresentativeMessages(messages)
    const relationalSelf = this.vault.getRelationalSelf()
    const names = [person.displayName, relationalSelf?.displayName, ...new Set(messages.map((message) => message.sender))]
    const excerpts = selected.map((message) => ({
      id: message.id,
      date: message.sentAt,
      direction: message.isFromMe ? 'from_user' : 'from_person',
      context: message.isGroup ? 'group' : 'one_to_one',
      evidenceScope: message.evidenceScope,
      body: redactExcerpt(message.body, names),
      attachmentCount: message.attachmentCount,
    })).filter((message) => message.body || message.attachmentCount)
    const payload = {
      person: {
        label: 'this person',
        userChosenClass: person.primaryClass,
        userChosenRelationship: person.specificRelationship,
        userChosenCloseness: person.closeness,
        userChosenIntention: person.intention,
        userChosenForms: person.forms,
        userChosenSocialWorlds: person.socialWorlds,
        userNotes: redactExcerpt(person.notes, names),
      },
      relationalSelf,
      localSignals: person.signals,
      coverage: {
        totalVisibleMessages: messages.length,
        selectedExcerpts: excerpts.length,
        firstVisibleAt: messages[0]?.sentAt || null,
        lastVisibleAt: messages.at(-1)?.sentAt || null,
        missingChannels: ['phone calls', 'in-person time', 'messages from unimported services', 'events not mentioned in chat'],
      },
      excerpts,
    }
    return redactPayloadValue(payload, names)
  }

  inspectPayload(personId) {
    const payload = this.buildPayload(personId)
    const hash = payloadHash(payload)
    return {
      model: this.model,
      store: false,
      redactions: ['names', 'phone numbers', 'email addresses', 'web links', 'street-like addresses'],
      coverage: payload.coverage,
      payload,
      excerptSample: payload.excerpts,
      payloadHash: hash,
      payloadBytes: Buffer.byteLength(JSON.stringify(payload)),
    }
  }

  async testKey() {
    const client = await this.client()
    const model = await client.models.retrieve(this.model)
    return { configured: true, model: model.id }
  }

  async analyzePerson({ personId, consent, consentHash }) {
    if (consent !== true) throw new Error('Analysis only runs after you confirm what will be sent.')
    const payload = this.buildPayload(personId)
    const currentHash = payloadHash(payload)
    if (!consentHash || consentHash !== currentHash) throw new Error('The inspected payload changed or was not confirmed. Inspect it again before analysis.')
    const client = await this.client()
    try {
      const response = await client.responses.create({
        model: this.model,
        store: false,
        reasoning: { effort: 'low' },
        text: { format: { type: 'json_schema', name: 'nearness_relationship_portrait', strict: true, schema: analysisSchema() } },
        input: [
          {
            role: 'developer',
            content: `You are the evidence-bound relationship interpretation layer for Nearness. Describe patterns in visible communication, never judge or rank people. Separate observation from inference. Never infer: ${PROHIBITED_INFERENCES.join('; ')}. A quiet or infrequent relationship may be secure, cyclical, group-carried, or missing from the dataset. Treat the user's chosen labels as lived context, not facts about the other person's inner state. Every observation must cite only excerpt IDs provided. Use calibrated language such as “visible here”, “may”, and “not enough evidence”.`,
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      })
      const result = parseOutput(response)
      const portraitText = Object.values(result.portrait || {}).flat().join(' ')
      if (containsProhibitedInference(portraitText)) throw new Error('The generated portrait crossed a prohibited inference boundary and was not saved.')
      const allowedRefs = new Set(payload.excerpts.map((excerpt) => excerpt.id))
      const observations = (result.observations || []).map((observation) => ({
        ...observation,
        evidenceRefs: (observation.evidenceRefs || []).filter((id) => allowedRefs.has(id)),
      })).filter((observation) => observation.evidenceRefs.length && validateObservation(observation))
      return this.vault.saveAnalysis({
        personId,
        model: this.model,
        inputCount: payload.excerpts.length,
        usage: response.usage || {},
        portrait: result.portrait,
        observations,
      })
    } catch (error) {
      this.vault.createFailedAnalysis({ personId, model: this.model, error: error.message })
      throw error
    }
  }

  async askPerson({ personId, question, consent }) {
    void personId; void question; void consent
    throw new Error('Ask is paused until its exact question-and-evidence payload can be inspected and confirmed. Portrait analysis remains available after exact payload review.')
  }
}

export { DEFAULT_MODEL }
