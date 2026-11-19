import { useState } from 'react'
import { Copy, X } from 'lucide-react'
import { Modal } from './App.tsx'
import { makeResearchPrompt, researchSubjects } from './presentation.ts'
import type { Country, Dataset } from './data.ts'

export default function ResearchPrompt({ countries, data, subject = 'Overview' }: { countries: Country[]; data: Dataset; subject?: string }) {
  const [show, setShow] = useState(false)
  const [topic, setTopic] = useState(subject)
  const [focus, setFocus] = useState('')
  const [status, setStatus] = useState('')
  const prompt = show ? makeResearchPrompt(countries, data, topic, focus) : ''
  return <><button className="text-button ai-prompt-trigger" onClick={() => { setTopic(subject); setStatus(''); setShow(true) }}><Copy size={14} /> Copy AI prompt</button>
    {show && <Modal label="AI research prompt" onClose={() => setShow(false)} className="prompt-dialog">
      <div className="dialog-heading"><h2>Research prompt</h2><button className="icon-button" aria-label="Close AI prompt" onClick={() => setShow(false)}><X size={18} /></button></div>
      <p className="muted">Review the selected context, then copy it into an AI tool of your choice.</p>
      <div className="prompt-fields"><label>Subject<select aria-label="Research subject" value={topic} onChange={event => { setTopic(event.target.value); setStatus('') }}>{[...new Set([subject, ...researchSubjects])].map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Optional question<input aria-label="Research focus" value={focus} maxLength={1000} placeholder="What would you like to understand?" onChange={event => { setFocus(event.target.value); setStatus('') }} /></label></div>
      <textarea className="prompt-preview" aria-label="Generated research prompt" readOnly value={prompt} />
      <div className="prompt-actions"><button className="button primary" onClick={async () => {
        try { await navigator.clipboard.writeText(prompt); setStatus('Prompt copied. Paste it into your AI tool; no conversation has been started.') }
        catch { setStatus('Clipboard unavailable. Select and copy the prompt below manually.'); const field = document.querySelector<HTMLTextAreaElement>('.prompt-preview'); field?.focus(); field?.select() }
      }}><Copy size={15} /> Copy prompt</button><p role="status">{status}</p></div>
    </Modal>}
  </>
}
