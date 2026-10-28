import React, { useMemo } from 'react'
import { PieChart, Pie, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = [
    '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c',
    '#facc15', '#38bdf8', '#f87171', '#4ade80', '#c084fc',
    '#2dd4bf', '#fbbf24', '#818cf8', '#fb7185', '#38a169'
]
const fmtVal = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function AssetHoldingDonut({ holdings = [], currentValue = 0, compact = false, onNavigate }) {
    // Aktive Positionen mit Marktwert (Zahlen erzwingen: Strings würden sich beim Addieren aneinanderhängen)
    const activeHoldings = useMemo(() => {
        return (holdings || [])
            .map(item => ({
                name: item.name || item.isin,
                value: Number(item.value) || 0,
                shares: parseFloat(item.shares) || 0,
            }))
            .filter(item => item.shares > 0.000001 && item.value > 0)
            .map(({ name, value }) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
    }, [holdings])

    const holdingsSum = useMemo(
        () => activeHoldings.reduce((sum, item) => sum + item.value, 0),
        [activeHoldings]
    )

    // Übergebener Gesamtwert (Chart-Wert), der Rest über den Positionen ist Guthaben/Sonstiges
    const given = Number(currentValue) || 0
    const cash = given > holdingsSum + 0.5 ? given - holdingsSum : 0
    const totalValue = holdingsSum + cash                  // Basis für die Prozente
    const shownTotal = given > 0 ? given : totalValue      // Zahl in der Mitte: genau der übergebene Wert
    console.log('Donut: ', {holdingsSum, currentValue, shownTotal})
    const coloredData = useMemo(() => {
        const list = activeHoldings.map((item, index) => ({ ...item, fill: COLORS[index % COLORS.length] }))
        if (cash > 0) list.push({ name: 'Cash / Sonstiges', value: +cash.toFixed(2), fill: '#64748b' })
        return list
    }, [activeHoldings, cash])

    if (activeHoldings.length === 0 && cash <= 0) {
        return (
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 30, textAlign: 'center', color: '#64748b', height: '100%', boxSizing: 'border-box' }}>
                Keine aktiven Positionen verfügbar
            </div>
        )
    }

    const eurTotal = Math.round(shownTotal).toLocaleString('de-DE') + ' €'

    // 1. KOMPAKTE ANSICHT (für die große Dashboard-Karte)
    if (compact) {
        return (
            <div style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{ width: '100%', maxWidth: 280, height: 240, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload
                                        const pct = totalValue > 0 ? ((data.value / totalValue) * 100).toFixed(1).replace('.', ',') : '0'
                                        return (
                                            <div style={{ background: '#1e2a3a', border: '1px solid #2a3a50', padding: '6px 10px', borderRadius: 8, color: '#e0e6f0', fontSize: 12 }}>
                                                <div style={{ fontWeight: 600 }}>{data.name}</div>
                                                <div style={{ color: '#38bdf8', marginTop: 2 }}>{fmtVal(data.value)} ({pct} %)</div>
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />
                            <Pie
                                data={coloredData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={105}
                                paddingAngle={2}
                                stroke="#161b27"
                                strokeWidth={2}
                                isAnimationActive={false}
                                startAngle={90}
                                endAngle={-270}
                            />
                        </PieChart>
                    </ResponsiveContainer>

                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: 11, color: '#7a8ba0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Gesamtwert</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{eurTotal}</div>
                    </div>
                </div>
            </div>
        )
    }
    // 2. VOLLSTÄNDIGE ANSICHT (für die Allokation-Seite)
const handleGoToXray = () => onNavigate?.('portfolio-xray')
    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 'clamp(16px, 3vw, 28px)', marginBottom: 24 }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 20
            }}>
                <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0', margin: 0 }}>
                        📊 Verteilung nach einzelnen Werten
                    </h3>
                    <p style={{ color: '#7a8ba0', fontSize: 13, marginTop: 4 }}>Aktuelle Allokation deiner aktiven Bestände</p>
                </div>

                {/* Direkter Sprung zur X-Ray Analyse */}
                <button
                    onClick={handleGoToXray}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#0f1420',
                        color: '#38bdf8',
                        border: '1px solid #1e2a3a',
                        borderRadius: 8,
                        padding: '7px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#1a2233'
                        e.currentTarget.style.borderColor = '#38bdf8'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#0f1420'
                        e.currentTarget.style.borderColor = '#1e2a3a'
                    }}
                >
                    <span>X-Ray Analyse</span>
                    <span style={{ fontSize: 14 }}>→</span>
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
                <div style={{ width: '100%', height: 320, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload
                                        return (
                                            <div style={{ background: '#1e2a3a', border: '1px solid #2a3a50', padding: '8px 12px', borderRadius: 8, color: '#e0e6f0', fontSize: 12 }}>
                                                <div style={{ fontWeight: 600 }}>{data.name}</div>
                                                <div style={{ color: '#38bdf8', marginTop: 2 }}>{fmtVal(data.value)}</div>
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />
                            <Pie
                                data={coloredData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={85}
                                outerRadius={125}
                                paddingAngle={3}
                                stroke="#161b27"
                                strokeWidth={3}
                                isAnimationActive={false}
                                startAngle={90}
                                endAngle={-270}
                            />
                        </PieChart>
                    </ResponsiveContainer>

                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: 12, color: '#7a8ba0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gesamtwert</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0', marginTop: 2 }}>{fmtVal(shownTotal)}</div>
                    </div>
                </div>

                <div style={{ width: '100%', maxHeight: 220, overflowY: 'auto', paddingRight: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {coloredData.map((item, idx) => {
                        const percent = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : 0
                        return (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: 13,
                                color: '#d0dce8',
                                background: '#10141f',
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: '1px solid #1a2233'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', marginRight: 12 }}>
                                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: item.fill, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center' }}>
                                    <span style={{ color: '#7a8ba0', fontSize: 12 }}>{percent.replace('.', ',')} %</span>
                                    <span style={{ fontWeight: 600, color: '#e0e6f0', minWidth: 80, textAlign: 'right' }}>{fmtVal(item.value)}</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}