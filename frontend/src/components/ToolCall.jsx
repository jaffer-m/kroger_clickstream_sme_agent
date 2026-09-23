const TOOL_LABELS = {
  ask_genie:   '🔮 Genie',
  run_sql:     '🗄️ SQL',
  list_tables: '📋 List Tables',
  get_schema:  '📐 Get Schema',
}

export default function ToolCall({ name, args, result }) {
  const label = TOOL_LABELS[name] ?? name
  const hasData = result?.columns?.length > 0

  return (
    <details
      style={{
        background: '#f0f4fa',
        border: '1px solid #b3cfe8',
        borderLeft: '3px solid #0056A2',
        borderRadius: 6,
        padding: '4px 8px',
        marginBottom: 4,
        fontSize: 13,
      }}
    >
      <summary style={{ cursor: 'pointer', color: '#0056A2', fontWeight: 500 }}>
        {label}
        {args?.query
          ? ` — ${args.query.slice(0, 60)}${args.query.length > 60 ? '…' : ''}`
          : args?.question
          ? ` — ${args.question.slice(0, 60)}${args.question.length > 60 ? '…' : ''}`
          : ''}
        {hasData ? ` (${result.rows?.length ?? 0} rows)` : ''}
      </summary>

      {args?.query && (
        <pre style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 8,
          borderRadius: 4,
          overflowX: 'auto',
          fontSize: 12,
          margin: '6px 0',
        }}>
          {args.query}
        </pre>
      )}

      {result?.error && (
        <div style={{ color: '#b91c1c', padding: '4px 0', fontSize: 12 }}>Error: {result.error}</div>
      )}
      {result?.reply && (
        <div style={{ color: '#333', padding: '4px 0' }}>{result.reply}</div>
      )}
      {result?.tables && (
        <div style={{ color: '#333', padding: '4px 0' }}>{result.tables.join(', ')}</div>
      )}
    </details>
  )
}
