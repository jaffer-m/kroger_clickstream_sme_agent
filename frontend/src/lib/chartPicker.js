const DATE_NAME_RE = /date|day|week|month|year|time|period/i
const PERCENT_NAME_RE = /rate|pct|percent|ratio|share/i
const LABEL_NAME_RE = /name|term|product|label|title|category|brand/i

export function isNumeric(val) {
  return val !== null && val !== undefined && val !== '' &&
    !isNaN(String(val).replace(/,/g, '').replace('%', ''))
}

export function isPercentCol(name) {
  return PERCENT_NAME_RE.test(name)
}

function isDateLike(val) {
  if (val === null || val === undefined || val === '') return false
  if (isNumeric(val)) return false
  return !isNaN(Date.parse(val))
}

export function toNumber(val) {
  const s = String(val ?? '').replace(/,/g, '').replace('%', '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

export function classifyColumns(columns, rows) {
  return columns.map((name, index) => {
    const sample = rows.map((r) => r[index])
    const nonEmpty = sample.filter((v) => v !== null && v !== undefined && v !== '')
    if (!nonEmpty.length) return { name, index, kind: 'label' }

    if (DATE_NAME_RE.test(name) || nonEmpty.every(isDateLike)) {
      return { name, index, kind: 'date' }
    }
    if (nonEmpty.every(isNumeric)) {
      return { name, index, kind: isPercentCol(name) ? 'percent' : 'numeric' }
    }
    return { name, index, kind: 'label' }
  })
}

function uniqueValues(rows, index) {
  return [...new Set(rows.map((r) => r[index]))]
}

function sumsNear100(rows, index) {
  const total = rows.reduce((acc, r) => acc + (toNumber(r[index]) ?? 0), 0)
  return total >= 85 && total <= 115
}

export function binNumeric(values, bucketCount = 12) {
  const nums = values.map(toNumber).filter((n) => n !== null)
  if (!nums.length) return []

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  if (min === max) {
    return [{ label: String(min), count: nums.length, x0: min, x1: max }]
  }

  const width = (max - min) / bucketCount
  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const x0 = min + i * width
    const x1 = i === bucketCount - 1 ? max : min + (i + 1) * width
    return { x0, x1, count: 0 }
  })

  for (const n of nums) {
    let idx = Math.floor((n - min) / width)
    if (idx >= bucketCount) idx = bucketCount - 1
    if (idx < 0) idx = 0
    buckets[idx].count += 1
  }

  const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1))
  return buckets.map((b) => ({ ...b, label: `${fmt(b.x0)}–${fmt(b.x1)}` }))
}

/**
 * Decide the best chart form for a result set, or null if a chart isn't a
 * good fit (caller should fall back to the card grid / plain table).
 */
export function pickChartForm(columns, rows) {
  if (!columns?.length || !rows?.length || rows.length < 2) return null

  const cols = classifyColumns(columns, rows)
  const dateCols = cols.filter((c) => c.kind === 'date')
  const labelCols = cols.filter((c) => c.kind === 'label')
  const valueCols = cols.filter((c) => c.kind === 'numeric' || c.kind === 'percent')

  // 1. One date + 1-4 numeric/percent columns -> line chart (trend over time)
  if (dateCols.length === 1 && valueCols.length >= 1 && valueCols.length <= 4) {
    return { type: 'line', x: dateCols[0], series: valueCols }
  }

  // 2. One label + exactly one value column -> pie or bar
  if (labelCols.length === 1 && valueCols.length === 1) {
    const [value] = valueCols
    if (value.kind === 'percent' && rows.length <= 8 && sumsNear100(rows, value.index)) {
      return { type: 'pie', label: labelCols[0], value }
    }
    if (rows.length <= 30) {
      return { type: 'bar', x: labelCols[0], series: [value] }
    }
    return null
  }

  // 3. One label + 2-4 value columns, small row count -> grouped bar
  if (labelCols.length === 1 && valueCols.length >= 2 && valueCols.length <= 4 && rows.length <= 10) {
    return { type: 'bar', x: labelCols[0], series: valueCols }
  }

  // 4. Exactly 2 numeric/percent columns, no usable label/date -> scatter
  if (valueCols.length === 2 && labelCols.length <= 1 && dateCols.length === 0) {
    let group = null
    if (labelCols.length === 1 && uniqueValues(rows, labelCols[0].index).length <= 4) {
      group = labelCols[0]
    }
    return { type: 'scatter', x: valueCols[0], y: valueCols[1], group }
  }

  // 5. Single numeric/percent column, many rows, no date/label -> histogram
  if (valueCols.length === 1 && labelCols.length === 0 && dateCols.length === 0 && rows.length > 20) {
    return { type: 'histogram', value: valueCols[0] }
  }

  return null
}

export { LABEL_NAME_RE }
