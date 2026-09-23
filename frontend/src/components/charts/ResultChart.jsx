import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  CartesianGrid, XAxis, YAxis, ZAxis,
  Tooltip, Legend,
} from 'recharts'
import { toNumber, binNumeric } from '../../lib/chartPicker.js'
import { CATEGORICAL, SEQUENTIAL_HUE, CHROME } from './palette.js'

const CHART_HEIGHT = 300

function formatValue(n) {
  if (n === null || n === undefined || isNaN(n)) return n
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function truncate(label, max = 18) {
  const s = String(label ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: CHROME.surface,
        border: `1px solid ${CHROME.gridline}`,
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      {label !== undefined && (
        <div style={{ color: CHROME.secondaryInk, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: CHROME.primaryInk }}>{formatValue(p.value)}</span>
          <span style={{ color: CHROME.secondaryInk }}>{p.name}</span>
        </div>
      ))}
    </div>
  )
}

const axisProps = {
  stroke: CHROME.axis,
  tick: { fill: CHROME.mutedText, fontSize: 11 },
  tickLine: false,
}

export default function ResultChart({ form, columns, rows }) {
  if (!form) return null

  if (form.type === 'line') {
    const data = rows.map((r) => {
      const point = { [form.x.name]: r[form.x.index] }
      for (const s of form.series) point[s.name] = toNumber(r[s.index])
      return point
    })
    const multi = form.series.length > 1

    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={CHROME.gridline} vertical={false} />
          <XAxis dataKey={form.x.name} {...axisProps} tickFormatter={(v) => truncate(v, 12)} />
          <YAxis {...axisProps} width={56} tickFormatter={formatValue} />
          <Tooltip content={<ChartTooltip />} />
          {multi && <Legend wrapperStyle={{ fontSize: 12, color: CHROME.secondaryInk }} />}
          {form.series.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={multi ? CATEGORICAL[i % CATEGORICAL.length] : SEQUENTIAL_HUE}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: CHROME.surface }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (form.type === 'bar') {
    let data = rows.map((r) => {
      const point = { [form.x.name]: r[form.x.index] }
      for (const s of form.series) point[s.name] = toNumber(r[s.index])
      return point
    })
    const multi = form.series.length > 1
    if (!multi) {
      data = [...data].sort((a, b) => (b[form.series[0].name] ?? 0) - (a[form.series[0].name] ?? 0))
    }

    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={CHROME.gridline} vertical={false} />
          <XAxis dataKey={form.x.name} {...axisProps} tickFormatter={(v) => truncate(v, 14)} interval={0} angle={data.length > 8 ? -20 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 50 : 30} />
          <YAxis {...axisProps} width={56} tickFormatter={formatValue} />
          <Tooltip content={<ChartTooltip />} />
          {multi && <Legend wrapperStyle={{ fontSize: 12, color: CHROME.secondaryInk }} />}
          {form.series.map((s, i) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={multi ? CATEGORICAL[i % CATEGORICAL.length] : SEQUENTIAL_HUE}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (form.type === 'pie') {
    const data = rows
      .map((r) => ({ name: r[form.label.index], value: toNumber(r[form.value.index]) }))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    const total = data.reduce((acc, d) => acc + (d.value ?? 0), 0)

    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <PieChart margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: CHROME.secondaryInk }} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={0}
            outerRadius={100}
            label={({ value }) => (total > 0 && value / total >= 0.08 ? `${Math.round((value / total) * 100)}%` : '')}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} stroke={CHROME.surface} strokeWidth={2} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (form.type === 'scatter') {
    if (form.group) {
      const groups = [...new Set(rows.map((r) => r[form.group.index]))]
      return (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={CHROME.gridline} />
            <XAxis dataKey="x" name={form.x.name} type="number" {...axisProps} tickFormatter={formatValue} />
            <YAxis dataKey="y" name={form.y.name} type="number" {...axisProps} width={56} tickFormatter={formatValue} />
            <ZAxis range={[64, 64]} />
            <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Legend wrapperStyle={{ fontSize: 12, color: CHROME.secondaryInk }} />
            {groups.map((g, i) => (
              <Scatter
                key={g}
                name={g}
                data={rows
                  .filter((r) => r[form.group.index] === g)
                  .map((r) => ({ x: toNumber(r[form.x.index]), y: toNumber(r[form.y.index]) }))}
                fill={CATEGORICAL[i % CATEGORICAL.length]}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      )
    }

    const data = rows.map((r) => ({ x: toNumber(r[form.x.index]), y: toNumber(r[form.y.index]) }))
    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={CHROME.gridline} />
          <XAxis dataKey="x" name={form.x.name} type="number" {...axisProps} tickFormatter={formatValue} />
          <YAxis dataKey="y" name={form.y.name} type="number" {...axisProps} width={56} tickFormatter={formatValue} />
          <ZAxis range={[64, 64]} />
          <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={SEQUENTIAL_HUE} stroke={CHROME.surface} strokeWidth={2} />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  if (form.type === 'histogram') {
    const values = rows.map((r) => r[form.value.index])
    const buckets = binNumeric(values, 12)

    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={buckets} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={CHROME.gridline} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis {...axisProps} width={44} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="count" name={form.value.name} fill={SEQUENTIAL_HUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return null
}
