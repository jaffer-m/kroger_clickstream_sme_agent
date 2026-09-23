import { useState } from 'react'
import Dashboard from './Dashboard.jsx'
import DataTable from './DataTable.jsx'
import ResultChart from './charts/ResultChart.jsx'
import { pickChartForm } from '../lib/chartPicker.js'

function detectDateRange(columns, rows) {
  if (!columns?.length || !rows?.length) return null

  // Find the first column that looks like a date but isn't a metric
  const dateColIdx = columns.findIndex((c) =>
    /date|_dt$|period|week|month|year/i.test(c) &&
    !/count|num|qty|revenue|amount|rate|pct|percent|key|id$/i.test(c)
  )
  if (dateColIdx === -1) return null

  const values = rows
    .map((r) => r[dateColIdx])
    .filter((v) => v && typeof v === 'string' && /^\d{4}/.test(v))
    .sort()

  if (!values.length) return null
  const from = values[0]
  const to = values[values.length - 1]
  return from === to ? { from, to: null } : { from, to }
}

function formatDateLabel(v) {
  // Try to make ISO dates more readable: 2024-01-15 → Jan 15, 2024
  const m = v && v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return v
  const d = new Date(v + 'T00:00:00')
  return isNaN(d) ? v : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ResultPanel({ columns, rows }) {
  const [showTable, setShowTable] = useState(false)
  if (!columns?.length || !rows?.length) return null

  const form = pickChartForm(columns, rows)
  const dateRange = detectDateRange(columns, rows)

  return (
    <div style={{ marginTop: 12 }}>
      {/* Date range chip */}
      {dateRange && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#eef4fb', border: '1px solid #b3cfe8',
          borderRadius: 20, padding: '3px 12px', fontSize: 12, color: '#003b7a',
          marginBottom: 10, fontWeight: 500,
        }}>
          📅 {dateRange.to
            ? `${formatDateLabel(dateRange.from)} – ${formatDateLabel(dateRange.to)}`
            : formatDateLabel(dateRange.from)}
        </div>
      )}

      {form
        ? <ResultChart form={form} columns={columns} rows={rows} />
        : <Dashboard columns={columns} rows={rows} />}

      <button
        onClick={() => setShowTable((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          color: '#0056A2',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          padding: '4px 0',
          marginTop: 4,
          opacity: 0.8,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
      >
        {showTable ? '▾ Hide table' : '▸ View as table'}
      </button>

      {showTable && <DataTable columns={columns} rows={rows} />}
    </div>
  )
}
