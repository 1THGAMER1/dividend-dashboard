import React from 'react'
import { PieChart, Pie, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = [
    '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c',
    '#facc15', '#38bdf8', '#f87171', '#4ade80', '#c084fc',
    '#2dd4bf', '#fbbf24', '#818cf8', '#fb7185', '#38a169'
]
const fmtVal = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function AssetHoldingDonut({ holdings = [] }) {
    const activeHoldings = holdings
        .filter(item => (item.shares > 0 || item.shares === 0) && (item.value || 0) > 0)
        .map(item => ({
            name: item.name || item.isin,
            value: item.value || 0
        }))
        .sort((a, b) => b.value - a.value)

    if (!activeHoldings || activeHoldings.length === 0) {
        return (
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 40, textAlign: 'center', color: '#64748b' }}>
                Lade Positions-Daten…
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
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e0e6f0', marginBottom: 16 }}>
                📊 Verteilung nach einzelnen Werten
            </h3>

            <div style={{ width: '100%', height: 280, minHeight: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={coloredData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={65}
                            outerRadius={105}
                            paddingAngle={3}
                            stroke="#161b27"
                            strokeWidth={2}
                            isAnimationActive={false}
                        />
                        <Tooltip
                            contentStyle={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 8, color: '#e0e6f0', fontSize: 12 }}
                            formatter={(value) => [fmtVal(value), 'Einstandswert']}
                        />
                        <Legend
                            formatter={(value, entry) => {
                                const { payload } = entry
                                const percent = totalValue > 0 ? ((payload.value / totalValue) * 100).toFixed(1) : 0
                                return <span style={{ color: '#c0ccd8', fontSize: 12, marginRight: 10 }}>{value} ({percent.replace('.', ',')} %)</span>
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}