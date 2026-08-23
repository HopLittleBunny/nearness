import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, BookOpenText, Check, CheckCircle2, ChevronRight, CircleHelp,
  Clock3, ContactRound, Database, Download, ExternalLink, Eye, FileArchive, Fingerprint,
  HeartHandshake, KeyRound, Layers3, Link2, LoaderCircle, LockKeyhole, MessageCircleQuestion,
  MessageSquareText, Network, Phone, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck,
  Sparkles, Star, Trash2, Upload, UserRoundCheck, UsersRound, X,
} from 'lucide-react'
import { bridge } from './lib/bridge'
import './product.css'

const UNDERSTAND = ['Me', 'Atlas', 'People', 'Family', 'Groups', 'Story', 'Ask']
const CARE = ['This week', 'Intentions']
const STEPS = ['Welcome', 'Sources', 'Identity', 'You', 'People', 'AI boundary', 'Ready']
const CLASSES = ['household_intimate', 'kin_family', 'chosen_family', 'friendship', 'role_community', 'acquaintance_contextual']
const CLOSENESS = ['essential', 'inner', 'active', 'wider_world', 'historical_dormant', 'intentionally_distant']
const TRAJECTORIES = ['new', 'deepening', 'steady', 'cyclical', 'quiet_but_intact', 'changing_form', 'drifting', 'strained', 'repairing', 'dormant_meaningful', 'resting', 'concluded', 'ambiguous', 'unknown']
const INTENTIONS = ['understand', 'preserve', 'deepen', 'revive', 'repair', 'reframe', 'boundary', 'rest', 'conclude']
const FORMS = ['dyadic', 'group_carried', 'mixed', 'activity_led', 'disclosure_led', 'practical_support_led', 'long_distance', 'seasonal_ritual', 'role_bound', 'mentor', 'caregiving', 'bridge', 'household_interdependent', 'unclear']
const WORLDS = ['childhood', 'school', 'university', 'professional', 'sports', 'parenting', 'neighbourhood', 'faith_community', 'migration_diaspora', 'online', 'creative', 'volunteering', 'health_caregiving', 'personal', 'family']

const friendly = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not visible'
const fullDate = (value) => value ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not visible'
const number = (value) => new Intl.NumberFormat().format(Number(value || 0))
const errorMessage = (error) => String(error?.message || error || 'Something went wrong.').replace(/^Error invoking remote method '[^']+': Error: /, '')

function StarMark({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8c.6 5.4 1.4 8.3 3.1 10.2-1.7 1.9-2.5 4.8-3.1 10.2-.6-5.4-1.4-8.3-3.1-10.2C10.6 10.1 11.4 7.2 12 1.8Z" fill="currentColor" /><path d="M1.8 12c5.4-.6 8.3-1.4 10.2-3.1 1.9 1.7 4.8 2.5 10.2 3.1-5.4.6-8.3 1.4-10.2 3.1C10.1 13.4 7.2 12.6 1.8 12Z" fill="currentColor" opacity=".72" /></svg>
}

function LoadingScreen() {
  return <div className="n-loading"><StarMark size={30} /><span>Opening your private atlas…</span></div>
}

function Notice({ tone = 'error', children, onClose }) {
  return <div className={`n-notice ${tone}`} role="status"><span>{children}</span>{onClose && <button aria-label="Dismiss" onClick={onClose}><X /></button>}</div>
}

function AppHeader({ mode, setMode, section, setSection, sourceCount, onSources }) {
  const nav = mode === 'Understand' ? UNDERSTAND : CARE
  return <header className="n-header">
    <div className="n-titlebar">
      <button className="n-wordmark" onClick={() => { setMode('Understand'); setSection('Atlas') }}>Nearness</button>
      <div className="n-mode"><button className={mode === 'Understand' ? 'active' : ''} onClick={() => { setMode('Understand'); setSection('Atlas') }}><StarMark size={14} />Understand</button><i /><button className={mode === 'Care' ? 'active' : ''} onClick={() => { setMode('Care'); setSection('This week') }}>Care<HeartHandshake size={15} /></button></div>
      <div className="n-trust"><span><LockKeyhole size={14} />Private to you</span><button onClick={onSources}><Layers3 size={16} />Sources <b>{sourceCount}</b></button></div>
    </div>
    <nav className="n-nav">{nav.map((item) => <button key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>)}</nav>
  </header>
}

function SourceButtons({ onImport, compact = false }) {
  return <div className={`n-source-buttons ${compact ? 'compact' : ''}`}>
    <button onClick={() => onImport('whatsapp')}><MessageSquareText /><span><strong>WhatsApp export</strong><small>ZIP or TXT · read locally</small></span><ChevronRight /></button>
    <button onClick={() => onImport('imessage')}><Phone /><span><strong>Messages on this Mac</strong><small>Select conversations · read-only</small></span><ChevronRight /></button>
    <button onClick={() => onImport('vcard')}><ContactRound /><span><strong>Contacts</strong><small>vCard · helps join identities</small></span><ChevronRight /></button>
  </div>
}

function ImportFlow({ kind, onClose, onChanged }) {
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [selfName, setSelfName] = useState('')
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const value = kind === 'whatsapp' ? await bridge.import.previewWhatsApp() : kind === 'imessage' ? await bridge.import.previewIMessage() : await bridge.import.previewVCard()
        if (!live) return
        if (!value) return onClose()
        setPreview(value)
        if (value.participants?.length) setSelfName(value.participants[0])
      } catch (err) { if (live) setError(errorMessage(err)) } finally { if (live) setBusy(false) }
    }
    load()
    return () => { live = false }
  }, [kind, onClose])

  async function commit() {
    setBusy(true); setError('')
    try {
      if (kind === 'whatsapp') await bridge.import.commitWhatsApp({ previewId: preview.previewId, selfName, conversationTitle: title })
      if (kind === 'vcard') await bridge.import.commitVCard({ previewId: preview.previewId, defaultCountry: 'AU' })
      if (kind === 'imessage') await bridge.import.commitIMessage({ previewId: preview.previewId, chatIds: [...selected] })
      await onChanged()
      onClose()
    } catch (err) { setError(errorMessage(err)); setBusy(false) }
  }

  const chats = preview?.chats?.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())) || []
  const titleText = kind === 'whatsapp' ? 'Read a WhatsApp export' : kind === 'imessage' ? 'Choose Messages conversations' : 'Add names to your history'
  return <div className="n-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="n-dialog n-import-dialog">
      <div className="n-dialog-head"><div><span>Source import</span><h2>{titleText}</h2></div><button onClick={onClose} disabled={busy}><X /></button></div>
      <div className="n-boundary"><ShieldCheck /><p><strong>Parsing happens on this Mac.</strong> Nothing is sent to AI during import. Message text is encrypted before it enters the vault.</p></div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {busy && !preview && <div className="n-dialog-loading"><LoaderCircle />Reading structure and dates…</div>}
      {kind === 'imessage' && error.includes('Full Disk Access') && <button className="n-secondary wide" onClick={() => bridge.privacy.openFullDiskAccess()}><ExternalLink />Open Full Disk Access</button>}
      {preview && kind === 'whatsapp' && <div className="n-import-body">
        <div className="n-import-summary"><div><strong>{number(preview.messageCount)}</strong><span>messages</span></div><div><strong>{preview.participantCount}</strong><span>people</span></div><div><strong>{dateLabel(preview.startAt)}–{dateLabel(preview.endAt)}</strong><span>visible period</span></div></div>
        {preview.duplicate && <Notice>This exact export is already in your vault.</Notice>}
        <label className="n-field"><span>Which name is you?</span><select value={selfName} onChange={(event) => setSelfName(event.target.value)}>{preview.participants.map((name) => <option key={name}>{name}</option>)}</select><small>Nearness needs this to distinguish messages you sent. It never guesses.</small></label>
        <label className="n-field"><span>Conversation label <em>optional</em></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={preview.label} /></label>
        <details className="n-preview-fold"><summary><Eye />Inspect the parsed sample</summary>{preview.sample.map((item, index) => <div key={index}><time>{fullDate(item.sentAt)}</time><strong>{item.sender}</strong><p>{item.body}</p></div>)}</details>
      </div>}
      {preview && kind === 'vcard' && <div className="n-import-body">
        <div className="n-import-summary"><div><strong>{number(preview.contactCount)}</strong><span>contacts with handles</span></div></div>
        <p className="n-muted-copy">Contacts do not become “friends”. They help Nearness recognise that a phone number in Messages and a name in WhatsApp may belong to one person. You confirm every merge.</p>
        <div className="n-contact-preview">{preview.contacts.slice(0, 12).map((contact) => <span key={`${contact.displayName}-${contact.phoneCount}`}><strong>{contact.displayName}</strong><small>{contact.phoneCount} phone · {contact.emailCount} email</small></span>)}</div>
      </div>}
      {preview && kind === 'imessage' && <div className="n-import-body">
        <div className="n-import-toolbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a conversation" /></label><button onClick={() => setSelected(new Set(preview.chats.slice(0, 20).map((chat) => chat.id)))}>Select 20 recent</button><span>{selected.size} chosen</span></div>
        <div className="n-chat-list">{chats.map((chat) => <label key={chat.id} className={selected.has(chat.id) ? 'selected' : ''}><input type="checkbox" checked={selected.has(chat.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(chat.id) ? next.delete(chat.id) : next.add(chat.id); return next })} /><span><strong>{chat.title}</strong><small>{number(chat.messageCount)} messages · {chat.isGroup ? `${chat.participantCount} people` : chat.service}</small></span><time>{dateLabel(chat.endAt)}</time></label>)}</div>
      </div>}
      {preview && <div className="n-dialog-actions"><button className="n-primary" disabled={busy || preview.duplicate || (kind === 'imessage' && !selected.size)} onClick={commit}>{busy ? <LoaderCircle className="spin" /> : <Upload />}{kind === 'imessage' ? `Import ${selected.size || ''} conversations` : 'Encrypt and add to Nearness'}</button><button className="n-secondary" onClick={onClose} disabled={busy}>Cancel</button></div>}
    </section>
  </div>
}

function IdentityWorkbench({ proposals, refresh, minimal = false }) {
  const pending = proposals.filter((proposal) => proposal.status === 'pending')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function decide(id, decision) {
    setBusy(id); setError('')
    try { await bridge.identity.decide(id, decision); await refresh() } catch (err) { setError(errorMessage(err)) } finally { setBusy('') }
  }
  if (!pending.length) return <div className="n-empty-inline"><CheckCircle2 /><div><strong>No identities need review</strong><p>Names match people only after source evidence or your confirmation.</p></div></div>
  return <div className={`n-identity-workbench ${minimal ? 'minimal' : ''}`}>
    {error && <Notice>{error}</Notice>}
    {pending.map((proposal) => <article key={proposal.id}>
      <div className="n-identity-glyph"><Fingerprint /></div>
      <div className="n-identity-copy"><span>{proposal.strength === 'strong' ? 'Strong cross-source match' : 'Needs your judgment'}</span><h3>Are these all {proposal.proposedName}?</h3><div>{proposal.identities.map((identity) => <p key={identity.id}><b>{identity.sourceType}</b><strong>{identity.displayName}</strong><small>{identity.handle || 'name only'}</small></p>)}</div><ul>{proposal.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
      <div className="n-identity-actions"><button disabled={busy === proposal.id} onClick={() => decide(proposal.id, 'merge')}><Link2 />Yes, one person</button><button disabled={busy === proposal.id} onClick={() => decide(proposal.id, 'separate')}>Keep separate</button></div>
    </article>)}
  </div>
}

function ProfileEditor({ value, onSave, onboarding = false }) {
  const [profile, setProfile] = useState(value)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => setProfile(value), [value])
  const setNested = (group, key, next) => setProfile((current) => ({ ...current, [group]: { ...current[group], [key]: next } }))
  async function save() { setBusy(true); await onSave(profile); setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  return <div className={`n-profile-editor ${onboarding ? 'onboarding' : ''}`}>
    <div className="n-form-pair"><label className="n-field"><span>What should Nearness call you?</span><input value={profile.displayName || ''} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} placeholder="Your name" /></label><label className="n-field"><span>Your current life chapter</span><input value={profile.currentChapter || ''} onChange={(event) => setProfile({ ...profile, currentChapter: event.target.value })} placeholder="Settling in Perth, new parent, rebuilding…" /></label></div>
    <div className="n-capacity-row"><div><span>Relationship time in a typical week</span><strong>{profile.weeklyMinutes} minutes</strong><small>Nearness deliberately keeps at least 30% unallocated.</small></div><input type="range" min="15" max="240" step="5" value={profile.weeklyMinutes} onChange={(event) => setProfile({ ...profile, weeklyMinutes: Number(event.target.value) })} /></div>
    <section className="n-language"><div><span>Your closeness language</span><h3>What makes a relationship feel close to you?</h3><p>This changes interpretation. It is not inferred from gender, nationality, or message volume.</p></div>{Object.entries(profile.closenessLanguage || {}).map(([key, score]) => <label key={key}><span>{friendly(key)}</span><input type="range" min="0" max="5" value={score} onChange={(event) => setNested('closenessLanguage', key, Number(event.target.value))} /><strong>{['Not part of it', 'Slight', 'Some', 'Meaningful', 'Strong', 'Essential'][score]}</strong></label>)}</section>
    <section className="n-preferences"><div><span>How care can look</span><h3>Channels that count in your real life</h3></div><div>{Object.entries(profile.communication || {}).map(([key, enabled]) => <button key={key} className={enabled ? 'active' : ''} onClick={() => setNested('communication', key, !enabled)}>{enabled && <Check />}{friendly(key)}</button>)}</div></section>
    <label className="n-checkline"><input type="checkbox" checked={Boolean(profile.norms?.silenceCanBeComfortable)} onChange={(event) => setNested('norms', 'silenceCanBeComfortable', event.target.checked)} /><span><strong>Silence can be comfortable in a secure relationship.</strong><small>Long gaps will not be treated as decline on their own.</small></span></label>
    <div className="n-profile-actions"><button className="n-primary" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : saved ? <Check /> : <UserRoundCheck />}{saved ? 'Saved' : onboarding ? 'Save my relational language' : 'Save changes'}</button></div>
  </div>
}

function Onboarding({ data, refresh }) {
  const [step, setStep] = useState(data.hasData ? 2 : 0)
  const [importKind, setImportKind] = useState(null)
  const [key, setKey] = useState('')
  const [keyStatus, setKeyStatus] = useState(data.keyConfigured ? 'configured' : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function saveKey() {
    setBusy(true); setError('')
    try { if (key) await bridge.analysis.saveKey(key); const result = await bridge.analysis.testKey(); setKey(''); setKeyStatus(result.model) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  async function finish() { await bridge.finishOnboarding(); await refresh() }
  return <div className="n-onboarding">
    <aside className="n-onboarding-rail"><div className="n-onboarding-mark"><StarMark /><span>Nearness</span></div><ol>{STEPS.map((name, index) => <li key={name} className={index === step ? 'active' : index < step ? 'done' : ''}><i>{index < step ? <Check /> : String(index + 1).padStart(2, '0')}</i><span>{name}</span></li>)}</ol><div className="n-local-promise"><LockKeyhole /><p><strong>Local by default.</strong>Your history stays encrypted on this Mac. AI is a separate, visible choice.</p></div></aside>
    <main className="n-onboarding-main">
      <div className="n-step-count">Step {step + 1} of {STEPS.length}<span><i style={{ width: `${(step + 1) / STEPS.length * 100}%` }} /></span></div>
      {step === 0 && <section className="n-welcome n-step-enter"><span className="n-kicker">A private relationship atlas</span><h1>See your life through<br />the people <em>in it.</em></h1><p>Nearness reconstructs the shape of friendships, family and groups from history you already own—then lets your lived meaning correct the record.</p><div className="n-doctrine"><span>Not a ranking.</span><span>Not a guilt machine.</span><span>Not a diagnosis.</span></div><button className="n-primary large" onClick={() => setStep(1)}>Begin privately <ArrowRight /></button></section>}
      {step === 1 && <section className="n-step-section n-step-enter"><span className="n-kicker">Bring your history closer</span><h1>Keep it private.</h1><p className="n-lede">Start with one source or bring the full picture. Imports are additive and reversible.</p><SourceButtons onImport={setImportKind} /><div className="n-source-status"><strong>{data.sourceCount || 0} sources · {number(data.messageCount)} messages</strong><span>Encrypted locally</span></div><div className="n-step-actions"><button className="n-primary" disabled={!data.hasData} onClick={() => setStep(2)}>Review identities <ArrowRight /></button></div></section>}
      {step === 2 && <section className="n-step-section n-step-enter"><span className="n-kicker">One person, many places</span><h1>You decide what joins.</h1><p className="n-lede">Nearness can propose that a WhatsApp name, phone number and contact card belong together. A name match alone never merges people.</p><IdentityWorkbench proposals={data.proposals || []} refresh={refresh} /><div className="n-step-actions"><button className="n-primary" onClick={() => setStep(3)}>Define what closeness means <ArrowRight /></button><button className="n-text" onClick={() => setStep(1)}><ArrowLeft />Add another source</button></div></section>}
      {step === 3 && <section className="n-step-section wide n-step-enter"><span className="n-kicker">Your relational self</span><h1>The same silence means different things to different people.</h1><p className="n-lede">Give Nearness your definitions before it interprets anyone else.</p><ProfileEditor value={data.relationalSelf} onboarding onSave={async (profile) => { await bridge.profile.save(profile); await refresh() }} /><div className="n-step-actions"><button className="n-primary" onClick={() => setStep(4)}>Meet the people in the data <ArrowRight /></button></div></section>}
      {step === 4 && <section className="n-step-section n-step-enter"><span className="n-kicker">People are not contacts</span><h1>{number(data.peopleCount)} visible identities are waiting for context.</h1><p className="n-lede">Nearness begins with neutral “person” records. You decide who is family, a friend, a former colleague, a community tie—or someone best left unexamined.</p><div className="n-people-preview">{data.people.slice(0, 12).map((person, index) => <span key={person.id}><i>{String(index + 1).padStart(2, '0')}</i><strong>{person.displayName}</strong><small>{friendly(person.closeness)} · {number(person.messageCount)} visible messages</small></span>)}</div><p className="n-footnote">There is no default “top friend” list. Placement and labels remain yours.</p><div className="n-step-actions"><button className="n-primary" onClick={() => setStep(5)}>Set the AI boundary <ArrowRight /></button></div></section>}
      {step === 5 && <section className="n-step-section n-step-enter"><span className="n-kicker">Analysis boundary</span><h1>Your whole archive never leaves by default.</h1><p className="n-lede">When you request a portrait, Nearness selects representative excerpts, redacts obvious identifiers, and shows you what will be sent. Nothing is sent until you confirm that individual run.</p><div className="n-ai-boundary"><div><ShieldCheck /><span><strong>Local interpretation</strong><small>Timing, gaps, episodes, coverage, open loops</small></span><CheckCircle2 /></div><div><Sparkles /><span><strong>Consented AI interpretation</strong><small>Meaningful patterns with evidence references</small></span><b>Your choice</b></div><div><Database /><span><strong>Provider storage</strong><small>Requests use <code>store: false</code></small></span><CheckCircle2 /></div></div>{error && <Notice>{error}</Notice>}{keyStatus ? <div className="n-key-ready"><KeyRound /><span><strong>Analysis is ready</strong><small>{keyStatus === 'configured' ? 'A protected API key is stored in macOS secure storage.' : `${keyStatus} is available.`}</small></span><button onClick={saveKey} disabled={busy}>Test again</button></div> : <div className="n-key-entry"><label className="n-field"><span>OpenAI API key</span><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="sk-…" autoComplete="off" /><small>Protected with macOS secure storage. Never written to your vault or exports.</small></label><button className="n-secondary" disabled={busy || !key} onClick={saveKey}>{busy ? <LoaderCircle className="spin" /> : <KeyRound />}Save and test</button></div>}<div className="n-step-actions"><button className="n-primary" onClick={() => setStep(6)}>Review the promise <ArrowRight /></button></div></section>}
      {step === 6 && <section className="n-ready n-step-enter"><div className="n-ready-mark"><StarMark size={44} /></div><span className="n-kicker">Your atlas is ready to become yours</span><h1>Observed. Told. Desired.<br /><em>Never confused.</em></h1><p>Start by placing the people who matter, correcting the story, and choosing which relationships—if any—you want help caring for.</p><div className="n-evidence-principles"><span><i className="observed" /><strong>Observed</strong><small>Visible history</small></span><span><i className="told" /><strong>Told</strong><small>Your lived account</small></span><span><i className="desired" /><strong>Desired</strong><small>Your intention</small></span><span><i className="unknown" /><strong>Unknown</strong><small>Named, not filled in</small></span></div><button className="n-primary large" onClick={finish}>Open my atlas <ArrowRight /></button></section>}
    </main>
    {importKind && <ImportFlow kind={importKind} onClose={() => setImportKind(null)} onChanged={refresh} />}
  </div>
}

function usePerson(personId, version) {
  const [person, setPerson] = useState(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let live = true
    if (!personId) { setPerson(null); return }
    setLoading(true)
    bridge.people.get(personId).then((value) => { if (live) setPerson(value) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [personId, version])
  return { person, setPerson, loading }
}

function positionPeople(people) {
  const radii = { essential: 92, inner: 155, active: 235, wider_world: 305, historical_dormant: 350, intentionally_distant: 365 }
  const grouped = new Map()
  for (const person of people) {
    const ring = person.closeness || 'active'
    if (!grouped.has(ring)) grouped.set(ring, [])
    grouped.get(ring).push(person)
  }
  const result = {}
  for (const [ring, items] of grouped) {
    items.sort((a, b) => a.displayName.localeCompare(b.displayName))
    const offset = items.reduce((sum, person) => sum + [...person.id].reduce((acc, char) => acc + char.charCodeAt(0), 0), 0) % 360
    items.forEach((person, index) => {
      const angle = (offset + index * (360 / items.length)) * Math.PI / 180
      const radius = radii[ring] || 235
      result[person.id] = [500 + Math.cos(angle) * radius, 310 + Math.sin(angle) * radius * .72]
    })
  }
  return result
}

function Atlas({ people, onSelect }) {
  const positions = useMemo(() => positionPeople(people), [people])
  const colors = { household_intimate: '#edb65e', kin_family: '#e4935d', chosen_family: '#b06bc2', friendship: '#56d5bd', role_community: '#68bce2', acquaintance_contextual: '#8ca0a3' }
  return <main className="n-page n-atlas-page">
    <div className="n-page-heading"><div><span>Your relationship atlas</span><h1>Your people, in context.</h1><p>Distance reflects the closeness you choose. Lines show imported history, not a verdict on the bond.</p></div><div className="n-evidence-key"><span><i className="observed" />Observed</span><span><i className="told" />Told</span><span><i className="desired" />Desired</span></div></div>
    <section className="n-atlas-frame">
      {!people.length ? <EmptyAtlas /> : <svg viewBox="0 0 1000 620" className="n-atlas" role="img" aria-label="Your relationship atlas">
        <defs><radialGradient id="center-glow"><stop offset="0" stopColor="#fff4da" stopOpacity=".7" /><stop offset="1" stopColor="#edb65e" stopOpacity="0" /></radialGradient></defs>
        {[92, 155, 235, 305, 365].map((radius, index) => <ellipse key={radius} cx="500" cy="310" rx={radius} ry={radius * .72} className={`n-ring r${index}`} />)}
        <g className="n-ring-labels"><text x="510" y="244">ESSENTIAL</text><text x="510" y="198">INNER</text><text x="510" y="140">ACTIVE</text><text x="510" y="86">WIDER WORLD</text></g>
        {people.map((person) => { const [x, y] = positions[person.id]; return <path key={`line-${person.id}`} d={`M500 310 Q${(500 + x) / 2} ${(310 + y) / 2 - 15} ${x} ${y}`} className={person.identityCount > 1 ? 'n-atlas-line told' : 'n-atlas-line'} /> })}
        <circle cx="500" cy="310" r="70" fill="url(#center-glow)" /><g className="n-you"><circle cx="500" cy="310" r="9" /><path d="M500 285v50m-25-25h50m-14-14-22 28m0-28 22 28" /><text x="520" y="341">You</text></g>
        {people.map((person) => { const [x, y] = positions[person.id]; const color = colors[person.primaryClass] || colors.friendship; return <g key={person.id} className="n-atlas-person" transform={`translate(${x} ${y})`} onClick={() => onSelect(person.id)} role="button" tabIndex="0" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(person.id) }}><circle className="hit" r="28" /><circle className="aura" r="20" style={{ fill: color }} /><path d="M0-13v26M-13 0h26M-8-8 8 8M8-8-8 8" style={{ stroke: color }} /><circle r="4" /><text x={x > 780 ? -18 : 18} y="5" textAnchor={x > 780 ? 'end' : 'start'}>{person.displayName}</text><text className="n-node-caption" x={x > 780 ? -18 : 18} y="21" textAnchor={x > 780 ? 'end' : 'start'}>{friendly(person.trajectory)}</text></g> })}
      </svg>}
      <div className="n-atlas-note"><StarMark /><span><strong>Not ranked.</strong> A frequent relationship can sit far away. A quiet one can remain essential.</span></div>
    </section>
  </main>
}

function EmptyAtlas() {
  return <div className="n-empty-atlas"><Network /><h2>Your atlas begins with history.</h2><p>Add a WhatsApp export or link Messages, then place people in the way that feels true.</p></div>
}

function PersonContext({ person, onSaved }) {
  const [form, setForm] = useState({ ...person, socialWorldsText: person.socialWorlds.join(', '), formsText: person.forms.join(', ') })
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm({ ...person, socialWorldsText: person.socialWorlds.join(', '), formsText: person.forms.join(', ') }), [person])
  async function save() {
    setBusy(true)
    const updated = await bridge.people.update(person.id, { displayName: form.displayName, primaryClass: form.primaryClass, specificRelationship: form.specificRelationship, socialWorlds: form.socialWorldsText.split(',').map((item) => item.trim().toLowerCase().replaceAll(' ', '_')).filter(Boolean), forms: form.formsText.split(',').map((item) => item.trim().toLowerCase().replaceAll(' ', '_')).filter(Boolean), closeness: form.closeness, trajectory: form.trajectory, intention: form.intention || null, cadenceDays: form.cadenceDays ? Number(form.cadenceDays) : null, intentionallyQuiet: form.intentionallyQuiet, notes: form.notes })
    setBusy(false); onSaved(updated)
  }
  return <div className="n-context-form">
    <div className="n-form-pair"><label className="n-field"><span>Name</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label><label className="n-field"><span>Specific relationship</span><input value={form.specificRelationship} onChange={(event) => setForm({ ...form, specificRelationship: event.target.value })} placeholder="old friend, cousin, teammate…" /></label></div>
    <div className="n-form-triple"><label className="n-field"><span>Bond system</span><select value={form.primaryClass} onChange={(event) => setForm({ ...form, primaryClass: event.target.value })}>{CLASSES.map((item) => <option key={item} value={item}>{friendly(item)}</option>)}</select></label><label className="n-field"><span>Felt closeness</span><select value={form.closeness} onChange={(event) => setForm({ ...form, closeness: event.target.value })}>{CLOSENESS.map((item) => <option key={item} value={item}>{friendly(item)}</option>)}</select></label><label className="n-field"><span>Trajectory</span><select value={form.trajectory} onChange={(event) => setForm({ ...form, trajectory: event.target.value })}>{TRAJECTORIES.map((item) => <option key={item} value={item}>{friendly(item)}</option>)}</select></label></div>
    <div className="n-form-pair"><label className="n-field"><span>Social worlds</span><input list="worlds" value={form.socialWorldsText} onChange={(event) => setForm({ ...form, socialWorldsText: event.target.value })} placeholder="school, sports, personal" /><datalist id="worlds">{WORLDS.map((item) => <option key={item}>{item}</option>)}</datalist></label><label className="n-field"><span>Relationship forms</span><input list="forms" value={form.formsText} onChange={(event) => setForm({ ...form, formsText: event.target.value })} placeholder="group carried, activity led" /><datalist id="forms">{FORMS.map((item) => <option key={item}>{item}</option>)}</datalist></label></div>
    <div className="n-form-pair"><label className="n-field"><span>Your intention</span><select value={form.intention || ''} onChange={(event) => setForm({ ...form, intention: event.target.value })}><option value="">No care intention yet</option>{INTENTIONS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="n-field"><span>Rhythm you would feel good about</span><select value={form.cadenceDays || ''} onChange={(event) => setForm({ ...form, cadenceDays: event.target.value })}><option value="">No recurring cadence</option><option value="7">About weekly</option><option value="14">Every two weeks</option><option value="30">Monthly</option><option value="60">Every two months</option><option value="90">Quarterly</option><option value="180">Twice a year</option><option value="365">Yearly ritual</option></select></label></div>
    <label className="n-field"><span>What the archive cannot know</span><textarea value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="We mostly call. Silence is normal. This relationship is changing. I do not want reconnection suggestions…" /></label>
    <label className="n-checkline"><input type="checkbox" checked={Boolean(form.intentionallyQuiet)} onChange={(event) => setForm({ ...form, intentionallyQuiet: event.target.checked })} /><span><strong>This relationship is intentionally quiet.</strong><small>Care will not suggest more contact.</small></span></label>
    <button className="n-primary" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check />}Save lived context</button>
  </div>
}

function EvidenceObservation({ observation, personId, onChanged }) {
  const [open, setOpen] = useState(false)
  const [evidence, setEvidence] = useState([])
  async function showEvidence() { if (!open) setEvidence(await bridge.analysis.evidence(personId, observation.evidenceRefs)); setOpen(!open) }
  async function status(next) { await bridge.analysis.observationStatus(observation.id, next); onChanged() }
  return <article className={`n-observation ${observation.userStatus}`}><div className="n-observation-top"><span>{friendly(observation.construct)}</span><b>{observation.evidenceType === 'observed_history' ? 'Observed' : 'Interpreted'} · {observation.confidence}</b></div><p>{observation.statement}</p><div className="n-observation-meta"><span>{observation.evidenceRefs.length} evidence moments</span>{observation.missing?.length > 0 && <span>Missing: {observation.missing.join(', ')}</span>}</div><div className="n-observation-actions"><button onClick={showEvidence}><Eye />{open ? 'Hide' : 'See'} evidence</button><button onClick={() => status('confirmed')}><Check />Feels true</button><button onClick={() => status('needs_context')}><CircleHelp />Needs context</button></div>{open && <div className="n-evidence-excerpts">{evidence.map((item) => <blockquote key={item.id}><time>{fullDate(item.sentAt)} · {friendly(item.context)}</time><p>{item.body || `${item.attachmentCount} attachment`}</p></blockquote>)}</div>}</article>
}

function AnalysisBoundary({ person, onClose, onComplete }) {
  const [inspect, setInspect] = useState(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { bridge.analysis.inspect(person.id).then(setInspect).catch((err) => setError(errorMessage(err))).finally(() => setBusy(false)) }, [person.id])
  async function run() { setBusy(true); setError(''); try { const result = await bridge.analysis.run({ personId: person.id, consent }); onComplete(result); onClose() } catch (err) { setError(errorMessage(err)); setBusy(false) } }
  return <div className="n-overlay"><section className="n-dialog n-analysis-dialog"><div className="n-dialog-head"><div><span>Analysis boundary</span><h2>Before Nearness reads for meaning</h2></div><button onClick={onClose} disabled={busy}><X /></button></div>{error && <Notice>{error}</Notice>}{busy && !inspect ? <div className="n-dialog-loading"><LoaderCircle className="spin" />Preparing a redacted payload…</div> : inspect && <><div className="n-analysis-summary"><div><strong>{number(inspect.coverage.selectedExcerpts)}</strong><span>selected of {number(inspect.coverage.totalVisibleMessages)} messages</span></div><div><strong>{Math.ceil(inspect.payloadBytes / 1024)} KB</strong><span>redacted payload</span></div><div><strong>{inspect.model}</strong><span>store: false</span></div></div><div className="n-redaction-list"><strong>Removed before sending</strong>{inspect.redactions.map((item) => <span key={item}><Check />{item}</span>)}</div><details className="n-payload-fold"><summary><Eye />Inspect selected redacted excerpts</summary>{inspect.excerptSample.map((item) => <blockquote key={item.id}><time>{fullDate(item.date)} · {friendly(item.direction)} · {friendly(item.context)}</time><p>{item.body || `${item.attachmentCount} attachment`}</p></blockquote>)}</details><div className="n-missing-band"><CircleHelp /><span><strong>This analysis still cannot see</strong>{inspect.coverage.missingChannels.join(', ')}.</span></div><label className="n-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>Send this redacted selection for this analysis.</strong><small>I understand this uses my configured OpenAI account. No person receives or approves the resulting private portrait.</small></span></label><div className="n-dialog-actions"><button className="n-primary" disabled={!consent || busy} onClick={run}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />}Build an evidence-bound portrait</button><button className="n-secondary" onClick={onClose}>Keep it local for now</button></div></>}</section></div>
}

function PersonPortrait({ person, onAnalyze, onChanged }) {
  return <div className="n-portrait">
    {person.portrait ? <><span className="n-kicker">Visible relationship portrait</span><blockquote>{person.portrait.headline}</blockquote><p className="n-portrait-essence">{person.portrait.essence}</p><p>{person.portrait.story}</p><div className="n-portrait-tags">{person.portrait.relationshipForms?.map((item) => <span key={item}>{friendly(item)}</span>)}{person.portrait.socialWorlds?.map((item) => <span key={item}>{friendly(item)}</span>)}</div><div className="n-coverage-note"><ShieldCheck /><span><strong>Coverage & uncertainty</strong>{person.portrait.coverageCaveat}</span></div><div className="n-observation-list">{person.observations.map((observation) => <EvidenceObservation key={observation.id} observation={observation} personId={person.id} onChanged={onChanged} />)}</div><button className="n-secondary" onClick={onAnalyze}><RefreshCw />Rebuild with current context</button></> : <div className="n-no-portrait"><StarMark size={34} /><h3>No story has been imposed on this relationship.</h3><p>Nearness already shows local timing and coverage. If you want meaning-level interpretation, inspect the redacted selection first.</p><button className="n-primary" onClick={onAnalyze}><Sparkles />Review analysis boundary</button></div>}
  </div>
}

function Signals({ person }) {
  const s = person.signals
  return <div className="n-signals"><div><span>Visible history</span><strong>{dateLabel(s.firstAt)}–{dateLabel(s.lastAt)}</strong></div><div><span>Coverage</span><strong>{friendly(s.coverage)}</strong></div><div><span>Active months</span><strong>{number(s.activeMonths)}</strong></div><div><span>Conversation episodes, 90d</span><strong>{number(s.recentEpisodeCount)}</strong></div><div><span>Episodes begun by you</span><strong>{s.initiatedByUserShare == null ? 'Unknown' : `${Math.round(s.initiatedByUserShare * 100)}%`}</strong></div><div><span>Longest visible gap</span><strong>{s.longestGapDays == null ? 'Unknown' : `${Math.round(s.longestGapDays)} days`}</strong></div><p><CircleHelp />These are communication signals, not measures of closeness or relationship quality.</p></div>
}

function PersonPanel({ personId, version, onClose, refresh }) {
  const { person, setPerson, loading } = usePerson(personId, version)
  const [tab, setTab] = useState('Portrait')
  const [analysisOpen, setAnalysisOpen] = useState(false)
  useEffect(() => setTab('Portrait'), [personId])
  async function changed(updated) { if (updated) setPerson(updated); else setPerson(await bridge.people.get(personId)); await refresh() }
  return <div className="n-drawer-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="n-person-panel">{loading || !person ? <div className="n-dialog-loading"><LoaderCircle className="spin" />Opening portrait…</div> : <><div className="n-person-head"><div className="n-person-star"><StarMark /></div><div><span>{friendly(person.primaryClass)} · {person.specificRelationship}</span><h2>{person.displayName}</h2><p>{friendly(person.closeness)} <i /> {friendly(person.trajectory)} <i /> {person.intention ? `Intention: ${person.intention}` : 'No care intention'}</p></div><button onClick={onClose}><X /></button></div><div className="n-panel-tabs">{['Portrait', 'Your context', 'Visible history'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div><div className="n-panel-body">{tab === 'Portrait' && <PersonPortrait person={person} onAnalyze={() => setAnalysisOpen(true)} onChanged={() => changed()} />}{tab === 'Your context' && <PersonContext person={person} onSaved={changed} />}{tab === 'Visible history' && <Signals person={person} />}</div>{analysisOpen && <AnalysisBoundary person={person} onClose={() => setAnalysisOpen(false)} onComplete={changed} />}</>}</aside></div>
}

function PeopleScreen({ people, onSelect }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const filtered = people.filter((person) => (filter === 'all' || person.primaryClass === filter) && `${person.displayName} ${person.specificRelationship} ${person.socialWorlds.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <main className="n-page"><div className="n-page-heading"><div><span>People, not rankings</span><h1>Every relationship has a form.</h1><p>Search the people visible in your sources, then add the context only you can know.</p></div></div><div className="n-people-toolbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a person, role, or social world" /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All bond systems</option>{CLASSES.map((item) => <option key={item} value={item}>{friendly(item)}</option>)}</select><span>{filtered.length} people · not ranked</span></div><section className="n-people-table"><div className="n-table-head"><span>Person</span><span>Worlds & form</span><span>Your placement</span><span>Visible history</span><span /></div>{filtered.map((person) => <button key={person.id} onClick={() => onSelect(person.id)}><span className="n-table-person"><i><StarMark size={13} /></i><b>{person.displayName}</b><small>{person.specificRelationship}</small></span><span><strong>{person.socialWorlds.slice(0, 2).map(friendly).join(' · ') || 'Needs context'}</strong><small>{person.forms.slice(0, 2).map(friendly).join(' · ') || 'Form unknown'}</small></span><span><strong>{friendly(person.closeness)}</strong><small>{friendly(person.trajectory)}</small></span><span><strong>{number(person.messageCount)} messages</strong><small>Last visible {fullDate(person.lastMessageAt)}</small></span><ChevronRight /></button>)}</section></main>
}

function MeScreen({ data, refresh }) {
  const profile = data.relationalSelf
  const counts = data.people.reduce((map, person) => ({ ...map, [person.primaryClass]: (map[person.primaryClass] || 0) + 1 }), {})
  return <main className="n-page"><div className="n-page-heading"><div><span>Your relational self</span><h1>{profile.currentChapter || 'The chapter you are living now.'}</h1><p>Nearness interprets every tie through definitions you can see and change.</p></div></div><div className="n-me-layout"><section className="n-self-summary"><span className="n-kicker">Your world at a glance</span><h2>{data.peopleCount} people across {Object.keys(counts).length} bond systems.</h2><div>{Object.entries(counts).map(([key, value]) => <p key={key}><span>{friendly(key)}</span><strong>{value}</strong></p>)}</div><blockquote>“A relationship is not its message count. Maintenance is judged against intention and capacity, not a universal cadence.”</blockquote></section><ProfileEditor value={profile} onSave={async (value) => { await bridge.profile.save(value); await refresh() }} /></div></main>
}

function FamilyScreen({ people, onSelect }) {
  const family = people.filter((person) => ['household_intimate', 'kin_family', 'chosen_family'].includes(person.primaryClass))
  return <main className="n-page"><div className="n-page-heading"><div><span>Kin, household & chosen family</span><h1>Family has a different grammar.</h1><p>Obligation, interdependence, lineage and chosen belonging are not collapsed into friendship cadence.</p></div></div>{family.length ? <div className="n-family-bands">{['household_intimate', 'kin_family', 'chosen_family'].map((type) => <section key={type}><span>{friendly(type)}</span>{family.filter((person) => person.primaryClass === type).map((person) => <button key={person.id} onClick={() => onSelect(person.id)}><StarMark /><strong>{person.displayName}</strong><small>{person.specificRelationship} · {friendly(person.closeness)}</small><ChevronRight /></button>)}</section>)}</div> : <div className="n-empty-state"><HeartHandshake /><h2>No one has been placed in a family system yet.</h2><p>Open a person and set their bond system. Nearness will never infer kinship from surnames or chat language.</p></div>}</main>
}

function GroupsScreen({ groups }) {
  return <main className="n-page"><div className="n-page-heading"><div><span>Group-carried connection</span><h1>Some relationships live in a circle.</h1><p>Teams, communities and family groups are relationship systems—not just containers for individual ties.</p></div></div>{groups.length ? <div className="n-groups-list">{groups.map((group, index) => <article key={group.id}><div><span>{String(index + 1).padStart(2, '0')}</span><StarMark /></div><section><small>{group.service} · {group.participantCount || 'Several'} people</small><h2>{group.title}</h2><p>{number(group.messageCount)} visible messages from {dateLabel(group.startAt)} to {dateLabel(group.endAt)}.</p></section><aside><strong>{dateLabel(group.endAt)}</strong><span>last visible</span></aside></article>)}</div> : <div className="n-empty-state"><UsersRound /><h2>No group conversations are visible yet.</h2><p>Import a WhatsApp group or select group conversations while linking Messages.</p></div>}</main>
}

function StoryScreen({ people }) {
  const active = [...people].filter((person) => person.lastMessageAt).sort((a, b) => new Date(a.lastMessageAt) - new Date(b.lastMessageAt))
  const years = [...new Set(active.map((person) => new Date(person.lastMessageAt).getFullYear()))]
  return <main className="n-page"><div className="n-page-heading"><div><span>Visible chapters</span><h1>Your life, seen through who travelled with you.</h1><p>This is a history of available traces, not a claim about when relationships began or ended.</p></div></div><div className="n-story-line">{years.map((year) => <section key={year}><time>{year}</time><i /><div>{active.filter((person) => new Date(person.lastMessageAt).getFullYear() === year).map((person) => <article key={person.id}><strong>{person.displayName}</strong><span>{friendly(person.trajectory)} · {person.socialWorlds.map(friendly).join(' + ') || 'world unknown'}</span><small>Last visible {fullDate(person.lastMessageAt)}</small></article>)}</div></section>)}</div><div className="n-missing-band"><CircleHelp /><span><strong>Important absences stay visible</strong>Calls, in-person years, lost accounts and silent-but-meaningful periods may not appear here.</span></div></main>
}

function AskScreen({ people }) {
  const [personId, setPersonId] = useState(people[0]?.id || '')
  const [question, setQuestion] = useState('What seems to carry this relationship across quiet periods?')
  const [consent, setConsent] = useState(false)
  const [answer, setAnswer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function ask(event) { event.preventDefault(); setBusy(true); setError(''); try { setAnswer(await bridge.analysis.ask({ personId, question, consent })) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) } }
  return <main className="n-page n-ask-page"><div className="n-ask-intro"><MessageCircleQuestion /><span>Evidence-bound questions</span><h1>Ask about one relationship.</h1><p>Nearness answers from a redacted selection and names what the archive cannot know.</p></div><form className="n-ask-form" onSubmit={ask}><select value={personId} onChange={(event) => { setPersonId(event.target.value); setAnswer(null) }}>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select><textarea value={question} onChange={(event) => setQuestion(event.target.value)} /><label className="n-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>Send a redacted selection for this answer.</strong><small>Names and obvious contact details are removed. Request storage is disabled.</small></span></label>{error && <Notice>{error}</Notice>}<button className="n-primary" disabled={!personId || !question || !consent || busy}>{busy ? <LoaderCircle className="spin" /> : <Send />}Ask from the evidence</button></form>{answer && <article className="n-ask-answer"><span>Concise interpretation</span><h2>{answer.answer}</h2><div><CircleHelp /><p><strong>Boundary</strong>{answer.caveat}</p></div><small>{answer.evidenceRefs.length} supporting moments · {answer.model}</small></article>}</main>
}

function CareScreen({ data, refresh, intentionsOnly = false }) {
  const [busy, setBusy] = useState('')
  async function update(id, status) { setBusy(id); await bridge.care.update(id, status); await refresh(); setBusy('') }
  const intentional = data.people.filter((person) => person.intention)
  if (intentionsOnly) return <main className="n-page"><div className="n-page-heading"><div><span>Your choices</span><h1>Only chosen relationships enter Care.</h1><p>Rest, boundaries and conclusions are valid intentions. They never generate reconnect prompts.</p></div></div><div className="n-intention-list">{intentional.map((person) => <div key={person.id}><StarMark /><strong>{person.displayName}</strong><span>{friendly(person.intention)}</span><small>{person.cadenceDays ? `Desired rhythm: about every ${person.cadenceDays} days` : 'No recurring cadence'}</small></div>)}</div></main>
  const allocated = data.care.filter((item) => item.status === 'suggested').reduce((sum, item) => sum + item.minutes, 0)
  return <main className="n-page n-care-page"><div className="n-care-opening"><div><span>Capacity-aware care</span><h1>Care, without guilt.</h1><p>You offered {data.relationalSelf.weeklyMinutes} minutes this week. Nearness has left {Math.max(0, data.relationalSelf.weeklyMinutes - allocated)} minutes intentionally unallocated.</p></div><div className="n-capacity-orbit"><strong>{allocated}</strong><span>minutes suggested</span></div></div><div className="n-care-rule"><i style={{ width: `${Math.min(100, allocated / Math.max(1, data.relationalSelf.weeklyMinutes) * 100)}%` }} /><span>{allocated} allocated · {Math.max(0, data.relationalSelf.weeklyMinutes - allocated)} protected</span></div>{data.care.length ? <div className="n-care-actions">{data.care.map((action) => <article key={action.id} className={action.status}><button className="n-care-check" disabled={busy === action.id} onClick={() => update(action.id, action.status === 'completed' ? 'suggested' : 'completed')}>{action.status === 'completed' && <Check />}</button><div><span>{action.personName} · {friendly(action.actionType)}</span><h2>{action.title}</h2><p>{action.reason}</p><small><Clock3 />{action.minutes} minutes · {action.energy} energy</small></div><button className="n-text" onClick={() => update(action.id, 'dismissed')}>Not now</button></article>)}</div> : <div className="n-empty-state"><HeartHandshake /><h2>No care prompts yet.</h2><p>Choose an intention and an optional rhythm on a person’s context page. Nearness does not manufacture urgency from silence.</p></div>}</main>
}

function SourcesPanel({ data, onClose, onImport, refresh }) {
  const [deleteText, setDeleteText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keyStatus, setKeyStatus] = useState(data.keyConfigured ? 'Protected key configured' : 'No key configured')
  async function removeSource(source) { if (!window.confirm(`Remove ${source.label} and its imported messages from this vault?`)) return; await bridge.sources.delete(source.id); await refresh() }
  async function deleteAll() { setBusy(true); setError(''); try { await bridge.privacy.deleteAll(deleteText); await refresh(); onClose() } catch (err) { setError(errorMessage(err)); setBusy(false) } }
  async function saveOrTestKey() {
    setBusy(true); setError('')
    try {
      if (apiKey) await bridge.analysis.saveKey(apiKey)
      const result = await bridge.analysis.testKey()
      setApiKey(''); setKeyStatus(`${result.model} ready`); await refresh()
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return <div className="n-drawer-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="n-sources-panel"><div className="n-dialog-head"><div><span>Data & privacy</span><h2>Your sources</h2></div><button onClick={onClose}><X /></button></div><div className="n-boundary"><LockKeyhole /><p><strong>{number(data.messageCount)} messages encrypted locally.</strong>Raw history is never included in Nearness exports unless you explicitly export your archive.</p></div><SourceButtons compact onImport={onImport} /><section className="n-source-list"><h3>Connected to this vault</h3>{data.sources.map((source) => <article key={source.id}><i>{source.type === 'whatsapp' ? <MessageSquareText /> : source.type === 'imessage' ? <Phone /> : <ContactRound />}</i><div><strong>{source.label}</strong><span>{number(source.messageCount)} messages · {source.conversationCount} conversations</span><small>{dateLabel(source.startAt)}–{dateLabel(source.endAt)} · {source.status}</small></div><button aria-label={`Delete ${source.label}`} onClick={() => removeSource(source)}><Trash2 /></button></article>)}</section><section className="n-key-settings"><h3>Privacy & AI</h3><div><KeyRound /><span><strong>{keyStatus}</strong><small>The key is protected by macOS secure storage and never included in exports.</small></span></div><label className="n-field"><span>{data.keyConfigured ? 'Replace OpenAI API key' : 'OpenAI API key'}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" autoComplete="off" /></label>{error && <Notice>{error}</Notice>}<button className="n-secondary" disabled={busy || (!apiKey && !data.keyConfigured)} onClick={saveOrTestKey}>{busy ? <LoaderCircle className="spin" /> : <ShieldCheck />}{apiKey ? 'Save and test' : 'Test protected key'}</button><p>AI is never used during import. Every portrait and answer still requires a separate payload review and consent.</p></section><section className="n-privacy-actions"><h3>Your controls</h3><button onClick={() => bridge.privacy.export()}><Download /><span><strong>Export my Nearness archive</strong><small>Readable JSON of your profile, portraits and care choices</small></span><ChevronRight /></button><div className="n-danger-zone"><strong>Delete everything on this Mac</strong><p>This removes the local vault and cannot be undone unless you made an export.</p>{error && <Notice>{error}</Notice>}<input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="Type DELETE MY NEARNESS VAULT" /><button disabled={deleteText !== 'DELETE MY NEARNESS VAULT' || busy} onClick={deleteAll}><Trash2 />Delete my vault</button></div></section></aside></div>
}

export default function ProductApp() {
  const [data, setData] = useState(null)
  const [mode, setMode] = useState('Understand')
  const [section, setSection] = useState('Atlas')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [importKind, setImportKind] = useState(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  async function refresh() { try { const next = await bridge.bootstrap(); setData(next); setVersion((value) => value + 1); setError('') } catch (err) { setError(errorMessage(err)) } }
  useEffect(() => { refresh() }, [])
  if (!data) return <LoadingScreen />
  if (!data.onboardingComplete) return <Onboarding data={data} refresh={refresh} />
  let screen
  if (mode === 'Care') screen = <CareScreen data={data} refresh={refresh} intentionsOnly={section === 'Intentions'} />
  else if (section === 'Me') screen = <MeScreen data={data} refresh={refresh} />
  else if (section === 'Atlas') screen = <Atlas people={data.people} onSelect={setSelectedPerson} />
  else if (section === 'People') screen = <PeopleScreen people={data.people} onSelect={setSelectedPerson} />
  else if (section === 'Family') screen = <FamilyScreen people={data.people} onSelect={setSelectedPerson} />
  else if (section === 'Groups') screen = <GroupsScreen groups={data.groups || []} />
  else if (section === 'Story') screen = <StoryScreen people={data.people} />
  else screen = <AskScreen people={data.people} />
  return <div className="n-app"><AppHeader mode={mode} setMode={setMode} section={section} setSection={setSection} sourceCount={data.sourceCount} onSources={() => setSourcesOpen(true)} />{error && <Notice>{error}</Notice>}{screen}{selectedPerson && <PersonPanel personId={selectedPerson} version={version} onClose={() => setSelectedPerson(null)} refresh={refresh} />}{sourcesOpen && <SourcesPanel data={data} onClose={() => setSourcesOpen(false)} onImport={(kind) => setImportKind(kind)} refresh={refresh} />}{importKind && <ImportFlow kind={importKind} onClose={() => setImportKind(null)} onChanged={refresh} />}{data.interfacePreview && <div className="n-preview-badge"><Eye />Interface preview · imports work in desktop</div>}</div>
}
