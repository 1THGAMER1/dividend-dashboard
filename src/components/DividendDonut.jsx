import { useState, useRef } from 'react'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'

// Farbpalette für Positionen
const PALETTE = [
  '#22c55e','#3b82f6','#a78bfa','#f472b6','#fb923c','#facc15',
  '#34d399','#60a5fa','#c084fc','#fb7185','#38bdf8','#4ade80',
  '#818cf8','#e879f9','#fbbf24','#2dd4bf','#f97316','#a3e635',
]

const TAX_COLOR = '#ef4444'

function buildSlices(positions, showTax) {
  const slices = []

  if (showTax) {
    // Jede Position mit Netto-Betrag + eine extra Steuer-Scheibe
    let totalTax = 0
    positions.forEach((p, i) => {
      if (p.net > 0) slices.push({ label: p.name, value: p.net, color: PALETTE[i % PALETTE.length], isTax: false })
      totalTax += p.tax
    })
    if (totalTax > 0) slices.push({ label: 'Steuern', value: totalTax, color: TAX_COLOR, isTax: true })
  } else {
    positions.forEach((p, i) => {
      if (p.net > 0) slices.push({ label: p.name, value: p.net, color: PALETTE[i % PALETTE.length], isTax: false })
    })
  }

  const total = slices.reduce((s, sl) => s + sl.value, 0)
  return { slices, total }
}

function polarToXY(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToXY(cx, cy, r, startAngle)
  const end   = polarToXY(cx, cy, r, endAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`
}

export default function DividendDonut({ byHolding = {}, kpiRange = 'all' }) {
  const [showTax,    setShowTax]    = useState(false)
  const [hovered,   setHovered]    = useState(null)
  const [tooltip,   setTooltip]    = useState(null)
  const svgRef = useRef(null)

  const now = new Date()

  // Positionen analog zu PositionsTable berechnen
  const positions = Object.entries(byHolding).map(([isin, h]) => {
    let net = 0, gross = 0, tax = 0
    for (const [year, months] of Object.entries(h.monthly || {})) {
      for (let m = 0; m < 12; m++) {
        const date = new Date(+year, m, 1)
        const diff = (now - date) / 864e5
        if (kpiRange === 'ytd' && date.getFullYear() !== now.getFullYear()) continue
        if (kpiRange === '12m' && diff > 365) continue
        net   += months[m]            || 0
        gross += h.gross?.[year]?.[m] || 0
        tax   += h.tax?.[year]?.[m]   || 0
      }
    }
    tax = gross - net
    return { isin, name: h.name || isin, net, gross, tax }
  })
    .filter(p => p.net > 0)
    .sort((a, b) => b.net - a.net)

  const { slices, total } = buildSlices(positions, showTax)
  if (total === 0 || slices.length === 0) return null

  const CX = 110, CY = 110, R = 88, INNER = 54
  const STROKE = R - INNER
  const CIRCUMFERENCE = 2 * Math.PI * (INNER + STROKE / 2)

  // Winkel für SVG-Pfade berechnen
  let cursor = 0
  const arcs = slices.map(sl => {
    const angle = (sl.value / total) * 360
    const arc = { ...sl, startAngle: cursor, endAngle: cursor + angle }
    cursor += angle
    return arc
  })

  const hovSlice = hovered !== null ? arcs[hovered] : null
  const centerLabel = hovSlice
    ? { name: hovSlice.label, value: fmt(hovSlice.value), pct: ((hovSlice.value / total) * 100).toFixed(1) + ' %' }
    : { name: 'Gesamt', value: fmt(total), pct: slices.length + ' Positionen' }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#c8d4e0', margin: 0 }}>Dividenden nach Positionen</h2>
        <button
          onClick={() => setShowTax(v => !v)}
          style={{
            background: showTax ? '#2d0a0a' : 'transparent',
            border: `1px solid ${showTax ? '#ef4444' : '#2a3a50'}`,
            color: showTax ? '#f87171' : '#556070',
            borderRadius: 20, padding: '4px 12px',
            fontSize: 12, cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          {showTax ? '✕ Steuer ausblenden' : '+ Steuer anzeigen'}
        </button>
      </div>

      <div style={{
        background: '#161b27', borderRadius: 12, border: '1px solid #222d3d',
        padding: '20px 16px', display: 'flex', gap: 24,
        flexWrap: 'wrap', alignItems: 'flex-start',
      }}>

        {/* Donut SVG */}
        <div style={{ flexShrink: 0, margin: '0 auto' }}>
          <svg ref={svgRef} width={220} height={220} viewBox="0 0 220 220">
            {arcs.map((arc, i) => {
              const isHov = hovered === i
              const gap   = 1.2 // Grad Abstand zwischen Scheiben
              const s = arc.startAngle + gap / 2
              const e = arc.endAngle   - gap / 2
              if (e <= s) return null
              const d = describeArc(CX, CY, INNER + STROKE / 2, s, e)
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={isHov ? STROKE + 6 : STROKE}
                  strokeLinecap="round"
                  style={{ cursor: 'pointer', transition: 'stroke-width 0.15s, opacity 0.15s', opacity: hovered !== null && !isHov ? 0.35 : 1 }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
              )
            })}

            {/* Mittelbeschriftung */}
            <text x={CX} y={CY - 10} textAnchor="middle" fill="#e0e6f0" fontSize="13" fontWeight="700">
              {centerLabel.value}
            </text>
            <text x={CX} y={CY + 8} textAnchor="middle" fill="#7a8ba0" fontSize="10">
              {centerLabel.pct}
            </text>
            <text x={CX} y={CY + 22} textAnchor="middle" fill="#556070" fontSize="9"
              style={{ maxWidth: 80 }}
            >
              {centerLabel.name.length > 16 ? centerLabel.name.slice(0, 15) + '…' : centerLabel.name}
            </text>
          </svg>
        </div>

        {/* Legende */}
        <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
          {arcs.map((arc, i) => {
            const pct = ((arc.value / total) * 100).toFixed(1)
            const isHov = hovered === i
            return (
              <div
                key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 8px', borderRadius: 6,
                  background: isHov ? '#1e2a3a' : 'transparent',
                  cursor: 'default', transition: 'background 0.15s',
                  opacity: hovered !== null && !isHov ? 0.45 : 1,
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: 3, background: arc.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#c8d4e0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {arc.label}
                </span>
                <span style={{ fontSize: 11, color: '#7a8ba0', whiteSpace: 'nowrap' }}>{pct} %</span>
                <span style={{ fontSize: 12, color: arc.isTax ? '#f87171' : '#22c55e', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>
                  {fmt(arc.value)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
