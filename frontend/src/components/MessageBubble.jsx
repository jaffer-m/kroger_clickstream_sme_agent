import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import ResultPanel from './ResultPanel.jsx'

const TOOL_STATUS = {
  list_tables: 'Connecting to mart — listing tables',
  get_schema:  'Fetching table schema',
  run_sql:     'Executing SQL query against the mart',
  ask_genie:   'Querying Genie',
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function stripMarkdownTables(text) {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('|'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function LoadingStatus({ toolCalls }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    setElapsed(0)
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const active = toolCalls?.find((tc) => tc.result === null)
  const done   = toolCalls?.filter((tc) => tc.result !== null).length ?? 0
  const total  = toolCalls?.length ?? 0

  let statusText = 'Thinking…'
  if (active) statusText = TOOL_STATUS[active.name] ?? `Running ${active.name}`
  else if (total > 0 && done === total) statusText = 'Processing results'

  return (
    <div style={{
      marginTop: 8,
      background: '#eef4fb',
      border: '1px solid #b3cfe8',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div className="loading-bar" />
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="working-dots"><span /><span /><span /></span>
          <span style={{ fontSize: 13, color: '#0056A2', fontWeight: 500 }}>{statusText}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#999', flexWrap: 'wrap' }}>
          <span>⏱ {elapsed}s</span>
          {total > 0 && (
            <span>✓ {done}/{total} step{total !== 1 ? 's' : ''}</span>
          )}
          {active?.args?.query && (
            <span style={{ color: '#0056A2', fontStyle: 'italic', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {active.args.query.slice(0, 80)}{active.args.query.length > 80 ? '…' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentAvatar() {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #003b7a 0%, #0056A2 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: '-0.5px',
      boxShadow: '0 2px 8px rgba(0, 86, 162, 0.3)',
      userSelect: 'none',
    }}>K</div>
  )
}

function UserAvatar() {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: '#004080',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
      userSelect: 'none',
    }}>YOU</div>
  )
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const time = formatTime(message.timestamp)

  if (isUser) {
    return (
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: '75%' }}>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
            You{time ? ` · ${time}` : ''}
          </div>
          <div style={{
            background: '#0056A2',
            color: '#fff',
            borderRadius: '16px 16px 4px 16px',
            padding: '10px 14px',
            boxShadow: '0 2px 10px rgba(0, 86, 162, 0.2)',
            lineHeight: 1.6,
            fontSize: 14,
          }}>
            {message.imagePreview && (
              <div style={{ marginBottom: 8 }}>
                <img src={message.imagePreview} alt={message.imageName}
                  style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, display: 'block' }} />
              </div>
            )}
            {message.fileName && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(255,255,255,0.15)', borderRadius: 12,
                padding: '2px 8px', fontSize: 12, marginBottom: 6,
              }}>
                📎 {message.fileName}
              </div>
            )}
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
          </div>
        </div>
        <UserAvatar />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-start' }}>
      <AgentAvatar />
      <div style={{ flex: 1, minWidth: 0, maxWidth: 'calc(100% - 44px)' }}>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
          SME Agent{time ? ` · ${time}` : ''}
        </div>
        <div style={{
          background: '#fff',
          border: '1px solid #e4e8f0',
          borderRadius: '0 16px 16px 16px',
          padding: '12px 16px',
          boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        }}>
          {message.content && (
            <div className="md" style={{ lineHeight: 1.65 }}>
              <Markdown>{stripMarkdownTables(message.content)}</Markdown>
            </div>
          )}
          {message.columns?.length > 0 && (
            <ResultPanel columns={message.columns} rows={message.rows} />
          )}
          {!message.loading && message.durationSec != null && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#bbb' }}>
              ⏱ {message.durationSec.toFixed(1)}s
            </div>
          )}
          {message.loading && <LoadingStatus toolCalls={message.toolCalls} />}
        </div>
      </div>
    </div>
  )
}
