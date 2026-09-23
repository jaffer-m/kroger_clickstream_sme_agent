import { useState, useRef, useEffect } from 'react'
import ChatWindow from './components/ChatWindow.jsx'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const STORAGE_KEY = 'kroger_sme_chat_history'

export default function App() {
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const genieConvId = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    const completed = messages.filter((m) => !m.loading)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completed))
  }, [messages])

  // Return focus to textarea after send completes
  useEffect(() => {
    if (!loading) textareaRef.current?.focus()
  }, [loading])

  const newChat = () => {
    if (loading) return
    localStorage.removeItem(STORAGE_KEY)
    setMessages([])
    genieConvId.current = null
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const stopQuery = () => {
    abortRef.current?.abort()
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''

    if (IMAGE_TYPES.includes(file.type)) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target.result
        const base64 = dataUrl.split(',')[1]
        setAttachment({ kind: 'image', name: file.name, data: base64, mediaType: file.type, preview: dataUrl })
      }
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => setAttachment({ kind: 'file', name: file.name, content: ev.target.result })
      reader.readAsText(file)
    }
  }

  const sendMessage = async (overrideText) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return

    setInput('')
    setLoading(true)
    const snap = attachment
    setAttachment(null)

    const now = Date.now()

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: text,
        timestamp: now,
        fileName: snap?.kind === 'file' ? snap.name : null,
        imagePreview: snap?.kind === 'image' ? snap.preview : null,
        imageName: snap?.kind === 'image' ? snap.name : null,
      },
    ])

    const assistantIdx = messages.length + 1
    setMessages((prev) => [...prev, { role: 'assistant', content: '', loading: true, toolCalls: [], timestamp: now }])

    try {
      abortRef.current = new AbortController()
      const resp = await fetch('/api/chat', {
        signal: abortRef.current.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          genie_conversation_id: genieConvId.current,
          file_name: snap?.kind === 'file' ? snap.name : null,
          file_content: snap?.kind === 'file' ? snap.content : null,
          image_data: snap?.kind === 'image' ? snap.data : null,
          image_media_type: snap?.kind === 'image' ? snap.mediaType : null,
          history: messages
            .filter((m) => !m.loading && m.content)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let textContent = ''
      let toolCalls = []
      let columns = []
      let rows = []
      // Schema/list results are buffered here and only promoted to display at
      // the done event if no run_sql/ask_genie data was received — this prevents
      // intermediate get_schema calls from polluting the result panel.
      let bufferedSchemaColumns = []
      let bufferedSchemaRows = []
      let dataResultReceived = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue

          let event
          try { event = JSON.parse(raw) } catch { continue }

          if (event.type === 'tool_call') {
            toolCalls = [...toolCalls, { name: event.name, args: event.args, result: null }]
          }

          if (event.type === 'tool_result') {
            toolCalls = toolCalls.map((tc) =>
              tc.name === event.name && tc.result === null ? { ...tc, result: event.result } : tc
            )
            if ((event.name === 'run_sql' || event.name === 'ask_genie') && event.result?.columns?.length) {
              // Data result — show immediately and mark as received
              dataResultReceived = true
              columns = event.result.columns
              rows = event.result.rows ?? []
            } else if (event.name === 'get_schema' && event.result?.columns?.length) {
              // Buffer schema — only shown at done if no data result arrives
              bufferedSchemaColumns = ['Column', 'Type', 'Description']
              bufferedSchemaRows = event.result.columns.map((c) => [c.name, c.type, c.comment || ''])
            } else if (event.name === 'list_tables' && event.result?.tables?.length) {
              // Buffer table list — only shown at done if no data result arrives
              bufferedSchemaColumns = ['Table Name']
              bufferedSchemaRows = event.result.tables.map((t) => [t])
            }
            if (event.result?.genie_conversation_id) genieConvId.current = event.result.genie_conversation_id
          }

          if (event.type === 'text') textContent += event.content
          if (event.type === 'done') {
            if (event.genie_conversation_id) genieConvId.current = event.genie_conversation_id
            // Promote buffered schema only if no data came back — meaning the user
            // explicitly asked for schema/table info (not an intermediate lookup)
            if (!dataResultReceived && bufferedSchemaColumns.length) {
              columns = bufferedSchemaColumns
              rows = bufferedSchemaRows
            }
          }

          setMessages((prev) =>
            prev.map((m, i) =>
              i === assistantIdx
                ? { ...m, content: textContent, toolCalls, columns, rows, loading: event.type !== 'done' }
                : m
            )
          )
        }
      }
    } catch (err) {
      const stopped = err.name === 'AbortError'
      setMessages((prev) =>
        prev.map((m, i) =>
          i === assistantIdx
            ? { ...m, content: m.content || (stopped ? '' : `Error: ${err.message}`), loading: false }
            : m
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#f0f4fa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #003b7a 0%, #0056A2 50%, #004080 100%)',
          color: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          minHeight: 64,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg
          style={{ position: 'absolute', right: 0, top: 0, height: '100%', opacity: 0.35, pointerEvents: 'none' }}
          viewBox="0 0 320 64"
          preserveAspectRatio="xMaxYMid slice"
          width="320"
        >
          {[...Array(18)].map((_, i) => {
            const angle = (i / 18) * Math.PI - Math.PI / 2
            const x2 = 320 + Math.cos(angle) * 260
            const y2 = 32 + Math.sin(angle) * 260
            return <line key={i} x1="320" y1="32" x2={x2} y2={y2} stroke={i % 4 === 0 ? '#FFD700' : '#7ab3e0'} strokeWidth={i % 4 === 0 ? 1.5 : 0.7} />
          })}
          <circle cx="320" cy="32" r="10" fill="none" stroke="#7ab3e0" strokeWidth="2" />
          <circle cx="320" cy="32" r="4" fill="#FFD700" />
          <circle cx="180" cy="18" r="3" fill="#FFD700" />
          <circle cx="220" cy="48" r="2" fill="#FFD700" />
        </svg>

        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px', fontFamily: 'serif', flexShrink: 0 }}>
          Kroger
        </div>
        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.4)', margin: '0 20px', flexShrink: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Behavioral Analytics SME Agent
        </div>

        {messages.length > 0 && !loading && (
          <button
            onClick={newChat}
            title="Start a new conversation"
            style={{
              marginLeft: 'auto',
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 6,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              cursor: 'pointer',
              letterSpacing: '0.03em',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
          >
            + New Chat
          </button>
        )}
      </div>

      <ChatWindow messages={messages} onSuggest={(q) => sendMessage(q)} />

      {/* Input bar */}
      <div
        style={{
          background: '#fff',
          borderTop: '1px solid #e0e8f0',
          padding: '12px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {/* Attachment preview */}
        {attachment && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {attachment.kind === 'image' ? (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <img
                  src={attachment.preview}
                  alt={attachment.name}
                  style={{ height: 56, borderRadius: 8, border: '1px solid #ccc', objectFit: 'cover' }}
                />
                <span
                  onClick={() => setAttachment(null)}
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    background: '#555', color: '#fff', borderRadius: '50%',
                    width: 18, height: 18, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 11, cursor: 'pointer', fontWeight: 700,
                  }}
                >×</span>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#e3eef9', border: '1px solid #b3cfe8',
                  borderRadius: 20, padding: '3px 10px', fontSize: 13, color: '#003b7a',
                }}
              >
                <span>📎</span>
                <span>{attachment.name}</span>
                <span
                  onClick={() => setAttachment(null)}
                  style={{ cursor: 'pointer', fontWeight: 700, marginLeft: 2, color: '#888' }}
                >×</span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.json,image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Attach a file (CSV, TXT, JSON) or image"
            style={{
              background: 'none',
              border: '1px solid #d0d8e4',
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 18,
              cursor: loading ? 'default' : 'pointer',
              color: '#555',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = '#0056A2' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d0d8e4' }}
          >
            📎
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about sessions, events, orders, fulfillment…"
            rows={2}
            autoFocus
            className="chat-input"
            style={{
              flex: 1,
              resize: 'none',
              border: '1px solid #d0d8e4',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 14,
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          />

          {loading ? (
            <button
              onClick={stopQuery}
              title="Stop query"
              style={{
                background: '#fff',
                color: '#0056A2',
                border: '2px solid #0056A2',
                borderRadius: 8,
                padding: '0 16px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 10, lineHeight: 1 }}>■</span> Stop
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              style={{
                background: !input.trim() ? '#c5d5e8' : '#0056A2',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '0 20px',
                cursor: !input.trim() ? 'default' : 'pointer',
                fontWeight: 600,
                fontSize: 14,
                transition: 'background 0.15s',
              }}
            >
              Send
            </button>
          )}
        </div>

        {/* Keyboard hint */}
        <div style={{ fontSize: 11, color: '#aaa', paddingLeft: 2 }}>
          Enter to send · Shift + Enter for new line
        </div>
      </div>
    </div>
  )
}
