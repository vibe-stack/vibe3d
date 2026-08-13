import { Check, ClipboardCopy, Copy, Layers, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatPin, formatReport, type Pin, type ReportSection } from './annotations.ts'

interface AnnotatePanelProps {
  modelId: string
  pins: readonly Pin[]
  /** Every model holding pins, so a review spanning the library copies in one go. */
  sections: readonly ReportSection[]
  activePinId: string | null
  onNoteChange(id: string, note: string): void
  onSelectPin(id: string | null): void
  onDeletePin(id: string): void
  onClear(): void
  onClose(): void
}

/**
 * How long a copy button stays in its confirmed state.
 *
 * The clipboard gives no visible feedback of its own, and a report the user is
 * about to paste into a chat is exactly the thing they need to know landed.
 */
const CONFIRM_MS = 1_600

/**
 * The Clipboard API exists only on secure origins, and the recorder is routinely
 * opened on a LAN address so a reviewer can turn the model on another machine.
 * Selecting an offscreen field is the only copy that works there, and a report
 * the user cannot take away is not a report.
 */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const carrier = document.createElement('textarea')
  carrier.value = text
  carrier.readOnly = true
  carrier.style.position = 'fixed'
  carrier.style.opacity = '0'
  document.body.append(carrier)
  carrier.select()
  const copied = document.execCommand('copy')
  carrier.remove()
  if (!copied) throw new Error('The browser refused the copy')
}

type CopyStatus = { key: string; failed: boolean } | null

const label = (status: CopyStatus, key: string, done: string, idle: string): string =>
  status?.key === key ? status.failed ? 'Copy failed' : done : idle

export function AnnotatePanel({
  modelId,
  pins,
  sections,
  activePinId,
  onNoteChange,
  onSelectPin,
  onDeletePin,
  onClear,
  onClose,
}: AnnotatePanelProps) {
  const [status, setStatus] = useState<CopyStatus>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const noteRefs = useRef(new Map<string, HTMLTextAreaElement>())

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  // A refused copy is reported the same way a successful one is. Silence would
  // be read as success, and the user would paste the wrong thing into a chat.
  const copy = useCallback((key: string, text: string) => {
    const settle = (failed: boolean) => {
      setStatus({ key, failed })
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setStatus(null), CONFIRM_MS)
    }
    void copyText(text).then(() => settle(false), (error: unknown) => {
      console.error('Unable to write the annotation report to the clipboard', error)
      settle(true)
    })
  }, [])

  // A pin dropped on the model should land the user in its note field, since
  // writing the note is the only reason the pin exists.
  useEffect(() => {
    if (activePinId) noteRefs.current.get(activePinId)?.focus()
  }, [activePinId])

  const total = sections.reduce((count, section) => count + section.pins.length, 0)
  const section: ReportSection = { id: modelId, pins }

  return (
    <section className="annotate-panel" aria-label={`Annotations on ${modelId}`}>
      <header>
        <strong>Annotations</strong>
        <span>{pins.length}</span>
        <button type="button" className="panel-icon" onClick={onClose} aria-label="Leave annotate mode">
          <X aria-hidden="true" />
        </button>
      </header>

      {pins.length === 0 && (
        <p className="annotate-hint">Click the model to drop a numbered pin, then say what is wrong with it.</p>
      )}

      <ol className="pin-list">
        {pins.map((pin, index) => (
          <li key={pin.id} className="pin-row" data-active={pin.id === activePinId}>
            <button
              type="button"
              className="pin-number"
              onClick={() => onSelectPin(pin.id)}
              aria-label={`Focus annotation ${index + 1}`}
            >
              {index + 1}
            </button>
            <div className="pin-body">
              {/* The kits batch their geometry by material, so the hit object's
                  own name is rarely the landmark. Naming the closest anchor is
                  what lets the user recognise the row as the thing they clicked;
                  the full path is one hover away. */}
              <code title={pin.hit.path}>
                {pin.hit.socket ? `near ${pin.hit.socket.name}` : pin.hit.path}
              </code>
              <small>{pin.hit.local.map((value) => value.toFixed(3)).join(', ')}</small>
              <label className="visually-hidden" htmlFor={`note-${pin.id}`}>
                Note for annotation {index + 1}
              </label>
              <textarea
                id={`note-${pin.id}`}
                ref={(node) => {
                  if (node) noteRefs.current.set(pin.id, node)
                  else noteRefs.current.delete(pin.id)
                }}
                value={pin.note}
                rows={2}
                placeholder="What is wrong here?"
                onFocus={() => onSelectPin(pin.id)}
                onChange={(event) => onNoteChange(pin.id, event.target.value)}
              />
            </div>
            <div className="pin-actions">
              <button
                type="button"
                className="panel-icon"
                onClick={() => copy(pin.id, formatPin(section, pin, index + 1))}
                aria-label={`Copy annotation ${index + 1}`}
              >
                {status?.key === pin.id && !status.failed
                  ? <Check aria-hidden="true" />
                  : <Copy aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="panel-icon"
                onClick={() => onDeletePin(pin.id)}
                aria-label={`Delete annotation ${index + 1}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <footer>
        <button
          type="button"
          className="annotate-action"
          disabled={pins.length === 0}
          onClick={() => copy('report', formatReport([section]))}
        >
          <ClipboardCopy aria-hidden="true" />
          <span>{label(status, 'report', 'Copied report', 'Copy report')}</span>
        </button>
        {total > pins.length && (
          <button
            type="button"
            className="annotate-action"
            onClick={() => copy('everything', formatReport(sections))}
          >
            <Layers aria-hidden="true" />
            <span>{label(status, 'everything', `Copied ${total}`, `Copy all ${total}`)}</span>
          </button>
        )}
        <button type="button" className="annotate-action" disabled={pins.length === 0} onClick={onClear}>
          <Trash2 aria-hidden="true" />
          <span>Clear</span>
        </button>
      </footer>

      <p className="visually-hidden" role="status">
        {status ? status.failed ? 'The copy was refused' : 'Copied to the clipboard' : ''}
      </p>
    </section>
  )
}
