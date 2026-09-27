import React from 'react'
import { PieChart, Pie, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getAssetAllocation } from '/src/dataUtils.js'

const COLORS = ['#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#facc15']

const fmtVal = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function AssetAllocationDonut({ holdings }) {
    const data = getAssetAllocation(holdings)

    if (!data || data.length === 0) {
        return (
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 30, textAlign: 'center', color: '#64748b' }}>
                Keine Allokations-Daten verfügbar
            </div>
        )
    }

    const totalValue = data.reduce((sum, item) => sum + item.value, 0)

    // Wir weisen den Datenpunkten direkt ihre Farbe zu, um Cell komplett zu umgehen
    const coloredData = data.map((item, index) => ({
        ...item,
        fill: COLORS[index % COLORS.length]
    }))

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e0e6f0', marginBottom: 16 }}>
                🍰 Vermögensaufteilung nach Asset-Klassen
            </h3>

            <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                    <PieChart>
                        <Pie
                            data={coloredData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={105}
                            paddingAngle={4}
                            stroke="#161b27"
                            strokeWidth={2}
                        />
                        <Tooltip
                            contentStyle={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 8, color: '#e0e6f0', fontSize: 12 }}
                            formatter={(value) => [fmtVal(value), 'Wert']}
                        />
                        <Legend
                            formatter={(value, entry) => {
                                const { payload } = entry
                                const percent = totalValue > 0 ? ((payload.value / totalValue) * 100).toFixed(1) : 0
                                return <span style={{ color: '#c0ccd8', fontSize: 13, marginRight: 10 }}>{value} ({percent.replace('.', ',')} %)</span>
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}