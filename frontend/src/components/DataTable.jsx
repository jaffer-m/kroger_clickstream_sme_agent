const MAX_ROWS = 200

export default function DataTable({ columns, rows }) {
  if (!columns?.length || !rows?.length) return null

  const displayed = rows.slice(0, MAX_ROWS)
  const truncated = rows.length > MAX_ROWS

  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  background: '#0056A2',
                  color: '#fff',
                  padding: '6px 12px',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#f0f4fa' : '#fff' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '5px 12px', borderBottom: '1px solid #e0e0e0' }}>
                  {cell ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        {truncated ? `Showing ${MAX_ROWS} of ${rows.length} rows` : `${rows.length} row${rows.length !== 1 ? 's' : ''}`}
      </div>
    </div>
  )
}
