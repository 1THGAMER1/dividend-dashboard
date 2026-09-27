import React from 'react'
import { PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = [
    '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c',
    '#facc15', '#38bdf8', '#f87171', '#4ade80', '#c084fc',
    '#2dd4bf', '#fbbf24', '#818cf8', '#fb7185', '#38a169'
]
const fmtVal = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function AssetHoldingDonut({ holdings = [] }) {
    // NUR aktive Positionen (shares > 0) und mit echtem Wert
    const activeHoldings = holdings
        .filter(item => (item.shares || 0) > 0.000001 && (item.value || 0) > 0)
        .map(item => ({
            name: item.name || item.isin,
            value: item.value || 0
        }))
        .sort((a, b) => b.value - a.value)

    if (!activeHoldings || activeHoldings.length === 0) {
        return (
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 40, textAlign: 'center', color: '#64748b' }}>
                Keine aktiven Positionen verfügbar
            </div>
        )
    }

    const totalValue = activeHoldings.reduce((sum, item) => sum + item.value, 0)
    const coloredData = activeHoldings.map((item, index) => ({
        ...item,
        fill: COLORS[index % COLORS.length]
    }))

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e0e6f0', marginBottom: 4 }}>
                📊 Verteilung nach einzelnen Werten
            </h3>
            <p style={{ color: '#7a8ba0', fontSize: 12, marginBottom: 16 }}>Nur aktive Bestände</p>

            <div style={{ width: '100%', height: 280, minWidth: 250 }}>
                <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                        <Pie
                            data={coloredData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={95}
                            paddingAngle={2}
                            stroke="#161b27"
                            strokeWidth={2}
                            isAnimationActive={false}
                        />
                        <Tooltip
                            contentStyle={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 8, color: '#e0e6f0', fontSize: 12 }}
                            formatter={(value, name) => {
                                const percent = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0
                                return [`${fmtVal(value)} (${percent.replace('.', ',')} %)`, name]
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* Kompakte, scrollbare Liste der Werte unter dem Chart statt der kaputten Legende */}
            <div style={{ marginTop: 12, maxHeight: 120, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {coloredData.map((item, idx) => {
                    const percent = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : 0
                    return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#c0ccd8' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.fill, flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                            </div>
                            <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmtVal(item.value)} ({percent.replace('.', ',')} %)</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}