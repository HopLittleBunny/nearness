import OpenAI from 'openai'
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
    const names = [person.displayName, ...new Set(messages.map((message) => message.sender))]
    const excerpts = selected.map((message) => ({
      id: message.id,
      date: message.sentAt,
      direction: message.isFromMe ? 'from_user' : 'to_user',
      context: message.isGroup ? 'group' : 'one_to_one',
      body: redactExcerpt(message.body, names),
      attachmentCount: message.attachmentCount,
    })).filter((message) => message.body || message.attachmentCount)
    return {
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
      relationalSelf: this.vault.getRelationalSelf(),
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
  }

  inspectPayload(personId) {
    const payload = this.buildPayload(personId)
    return {
      model: this.model,
      store: false,
      redactions: ['names', 'phone numbers', 'email addresses', 'web links', 'street-like addresses'],
      coverage: payload.coverage,
      excerptSample: payload.excerpts.slice(0, 12),
      payloadBytes: Buffer.byteLength(JSON.stringify(payload)),
    }
  }

  async testKey() {
    const client = await this.client()
    const model = await client.models.retrieve(this.model)
    return { configured: true, model: model.id }
  }

  async analyzePerson({ personId, consent }) {
    if (consent !== true) throw new Error('Analysis only runs after you confirm what will be sent.')
    const payload = this.buildPayload(personId)
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
    if (consent !== true) throw new Error('Ask only runs after you confirm that redacted excerpts may be sent.')
    const prompt = cleanText(question).slice(0, 800)
    if (!prompt) throw new Error('Ask a question first.')
    const payload = this.buildPayload(personId)
    const client = await this.client()
    const response = await client.responses.create({
      model: this.model,
      store: false,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name: 'nearness_evidence_answer', strict: true, schema: answerSchema() } },
      input: [
        {
          role: 'developer',
          content: `Answer only from the supplied redacted history and user context. Do not diagnose, mind-read, rank, label the person, or claim what they feel. State when the history cannot answer. Cite excerpt IDs. Forbidden inferences: ${PROHIBITED_INFERENCES.join('; ')}.`,
        },
        { role: 'user', content: JSON.stringify({ question: prompt, context: payload }) },
      ],
    })
    const result = parseOutput(response)
    const allowedRefs = new Set(payload.excerpts.map((excerpt) => excerpt.id))
    return { ...result, evidenceRefs: (result.evidenceRefs || []).filter((id) => allowedRefs.has(id)), model: this.model }
  }
}

export { DEFAULT_MODEL }
