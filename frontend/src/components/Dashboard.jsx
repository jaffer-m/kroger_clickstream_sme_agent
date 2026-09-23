import { isNumeric, isPercentCol } from '../lib/chartPicker.js'

function toPercent(val) {
  const s = String(val ?? '').replace('%', '').trim()
  const n = parseFloat(s)
  if (isNaN(n)) return null
  if (n <= 1 && n >= 0) return Math.round(n * 1000) / 10   // 0.809 → 80.9
  if (n <= 100) return Math.round(n * 10) / 10              // 80.9 → 80.9
  return null
}

function formatNum(val) {
  const s = String(val ?? '').replace(/,/g, '')
  const n = parseFloat(s)
  if (isNaN(n)) return val
  return n.toLocaleString()
}

const PERCENT_BAR_COLORS = ['#0056A2', '#FFD700', '#003b7a', '#7ab3e0', '#004080']

export default function Dashboard({ columns, rows }) {
  if (!columns?.length || !rows?.length) return null

  // Classify columns
  const rankIdx = columns.findIndex((c) => /rank|#/i.test(c))
  const labelIdx = columns.findIndex((c, i) => {
    if (i === rankIdx) return false
    return !isNumeric(rows[0]?.[i]) || /name|term|product|label|title|category|brand/i.test(c)
  })
  const percentCols = columns
    .map((c, i) => ({ name: c, i }))
    .filter(({ name, i }) => isPercentCol(name) && i !== rankIdx && i !== labelIdx)
  const numCols = columns
    .map((c, i) => ({ name: c, i }))
    .filter(({ name, i }) =>
      !isPercentCol(name) && i !== rankIdx && i !== labelIdx &&
      rows.some((r) => isNumeric(r[i]))
    )

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {rows.map((row, ri) => {
          const label = labelIdx >= 0 ? row[labelIdx] : `Row ${ri + 1}`
          const rank = rankIdx >= 0 ? row[rankIdx] : ri + 1

          return (
            <div
              key={ri}
              style={{
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div
                  style={{
                    background: '#0056A2',
                    color: '#fff',
                    borderRadius: 8,
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {rank}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>
                  {label}
                </div>
              </div>

              {/* Numeric stats */}
              {numCols.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {numCols.map(({ name, i }) => (
                    <div
                      key={i}
                      style={{
                        background: '#eef4fb',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: '#888' }}>{name}: </span>
                      <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{formatNum(row[i])}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Percentage bars */}
              {percentCols.map(({ name, i }, pi) => {
                const pct = toPercent(row[i])
                const color = PERCENT_BAR_COLORS[pi % PERCENT_BAR_COLORS.length]
                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        marginBottom: 3,
                        color: '#555',
                      }}
                    >
                      <span>{name}</span>
                      <span style={{ fontWeight: 600, color: '#1a1a1a' }}>
                        {pct !== null ? `${pct}%` : row[i]}
                      </span>
                    </div>
                    <div
                      style={{
                        background: '#d0e4f7',
                        borderRadius: 4,
                        height: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(pct ?? 0, 100)}%`,
                          background: color,
                          height: '100%',
                          borderRadius: 4,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
        {rows.length} result{rows.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
