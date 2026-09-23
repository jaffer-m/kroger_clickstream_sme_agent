import { useState, useEffect, useCallback } from 'react'

const EVENT_COLORS = {
  chat_request:        { bg: '#e3eef9', border: '#0056A2', text: '#003b7a' },
  tool_call:           { bg: '#f0f4fa', border: '#7ab3e0', text: '#0056A2' },
  tool_result:         { bg: '#f5faf0', border: '#82c45a', text: '#2d6a0a' },
  llm_usage:           { bg: '#faf8f0', border: '#c8a84b', text: '#7a5c00' },
  chat_done:           { bg: '#eef4ff', border: '#003b7a', text: '#003b7a' },
  chat_request_failed: { bg: '#fff0f0', border: '#c00', text: '#900' },
}

const EVENT_ICONS = {
  chat_request:        '💬',
  tool_call:           '🔧',
  tool_result:         '📊',
  llm_usage:           '🤖',
  chat_done:           '✅',
  chat_request_failed: '❌',
}

function formatTs(ts) {
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return ts }
}

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 600,
      padding: '1px 7px',
      borderRadius: 10,
      background: color.bg,
      border: `1px solid ${color.border}`,
      color: color.text,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

function EventCard({ entry, expanded, onToggle }) {
  const colors = EVENT_COLORS[entry.event] || { bg: '#f8f8f8', border: '#ccc', text: '#333' }
  const icon = EVENT_ICONS[entry.event] || '📋'
  const { ts, event, request_id, ...rest } = entry

  // Build a concise summary line
  let summary = ''
  if (event === 'chat_request') summary = rest.message || ''
  else if (event === 'tool_call') summary = rest.query || rest.question || (rest.args ? JSON.stringify(rest.args).slice(0, 120) : '')
  else if (event === 'tool_result') summary = rest.error ? `ERROR: ${rest.error}` : `${rest.row_count ?? rest.total ?? ''} rows`
  else if (event === 'llm_usage') summary = `in:${rest.usage?.input_tokens ?? 0} out:${rest.usage?.output_tokens ?? 0} cache_r:${rest.usage?.cache_read_input_tokens ?? 0} ~$${rest.estimated_cost_usd ?? 0}`
  else if (event === 'chat_done') summary = `${rest.turns} turn(s) · ~$${rest.total_estimated_cost_usd ?? 0} · ${rest.final_answer?.slice(0, 80) || ''}`

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: 6,
        marginBottom: 6,
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
          background: expanded ? colors.bg : '#fff',
          transition: 'background 0.1s',
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <Badge label={event} color={colors} />
        {rest.tool && (
          <span style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>{rest.tool}</span>
        )}
        <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>{formatTs(ts)}</span>
        {request_id && (
          <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', flexShrink: 0 }}>
            #{request_id}
          </span>
        )}
        <span style={{ flex: 1, fontSize: 12, color: rest.error ? '#c00' : '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </span>
        <span style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: '10px 14px', background: colors.bg }}>
          <pre style={{
            margin: 0,
            fontSize: 12,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: '#222',
            maxHeight: 400,
            overflowY: 'auto',
          }}>
            {JSON.stringify(rest, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

const EVENT_TYPES = ['all', 'chat_request', 'tool_call', 'tool_result', 'llm_usage', 'chat_done', 'chat_request_failed']

export default function AuditViewer() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('all')
  const [limit, setLimit] = useState(200)
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit })
      if (eventFilter !== 'all') params.set('event', eventFilter)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/audit?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setEntries(data.entries)
      setTotal(data.total)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [limit, eventFilter, search])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(fetchLogs, 5000)
    return () => clearInterval(id)
  }, [autoRefresh, fetchLogs])

  // Group consecutive entries by request_id for visual separation
  const grouped = entries.reduce((acc, entry, i) => {
    const prev = entries[i - 1]
    if (!prev || prev.request_id !== entry.request_id) acc.push([])
    acc[acc.length - 1].push({ entry, idx: i })
    return acc
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #003b7a 0%, #0056A2 50%, #004080 100%)',
        color: '#fff',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        minHeight: 64,
      }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px', fontFamily: 'serif', flexShrink: 0 }}>Kroger</div>
        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Audit Log</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {loading ? 'Loading…' : `${entries.length} of ${total} entries`}
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: '#7ab3e0' }}
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={fetchLogs}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600,
              padding: '5px 12px', cursor: 'pointer',
            }}
          >↻ Refresh</button>
          <a
            href="/"
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600,
              padding: '5px 12px', textDecoration: 'none',
            }}
          >← Chat</a>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e0e8f0',
        padding: '10px 20px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <input
          type="text"
          placeholder="Search (request_id, query text, error…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 220, border: '1px solid #d0d8e4', borderRadius: 6,
            padding: '6px 10px', fontSize: 13, fontFamily: 'inherit',
          }}
        />
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          style={{ border: '1px solid #d0d8e4', borderRadius: 6, padding: '6px 10px', fontSize: 13, background: '#fff' }}
        >
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t === 'all' ? 'All events' : t}</option>)}
        </select>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{ border: '1px solid #d0d8e4', borderRadius: 6, padding: '6px 10px', fontSize: 13, background: '#fff' }}
        >
          {[50, 100, 200, 500].map((n) => <option key={n} value={n}>Last {n}</option>)}
        </select>
        <button
          onClick={() => setExpandedIdx(null)}
          style={{
            border: '1px solid #d0d8e4', borderRadius: 6, padding: '6px 10px',
            fontSize: 12, background: '#fff', cursor: 'pointer', color: '#555',
          }}
        >Collapse all</button>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #c00', borderRadius: 6, padding: '10px 14px', color: '#900', marginBottom: 12 }}>
            Error loading logs: {error}
          </div>
        )}

        {!loading && entries.length === 0 && !error && (
          <div style={{ textAlign: 'center', color: '#888', marginTop: 60, fontSize: 14 }}>
            No audit entries found.{search || eventFilter !== 'all' ? ' Try clearing the filters.' : ' Start chatting to generate logs.'}
          </div>
        )}

        {grouped.map((group, gi) => {
          const reqId = group[0]?.entry?.request_id
          const question = group.find((g) => g.entry.event === 'chat_request')?.entry?.message
          return (
            <div key={gi} style={{ marginBottom: 16 }}>
              {/* Request group header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 6, paddingLeft: 4,
              }}>
                <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>#{reqId}</span>
                {question && (
                  <span style={{ fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {question.slice(0, 120)}
                  </span>
                )}
              </div>
              {group.map(({ entry, idx }) => (
                <EventCard
                  key={idx}
                  entry={entry}
                  expanded={expandedIdx === idx}
                  onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
