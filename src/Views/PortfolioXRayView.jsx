import React, { useState } from 'react'
import { PieChart, Pie, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { computePortfolioXRay, getRegion } from '../utils/portfolioXray'

const PALETTE = [
    '#009991', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899',
    '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#eab308', '#a855f7', '#3b82f6', '#ec4899'
]

export default function PortfolioXRayView({ etfHoldingsMap, userHoldings, currentValue }) {
    const [topLimit, setTopLimit] = useState(15)
    const [activeTab, setActiveTab] = useState('holdings') // 'holdings' | 'regions' | 'countries'

    const rawData = computePortfolioXRay(etfHoldingsMap, userHoldings, currentValue)

    // Exakte Begrenzung auf Top-N und Zusammenfassung des Rests
    const topHoldings = rawData.slice(0, topLimit)
    const restHoldings = rawData.slice(topLimit)
    const restWeight = restHoldings.reduce((sum, item) => sum + item.Weight, 0)

    const chartHoldingsData = [
        ...topHoldings.map((item, index) => ({
            name: item.Name,
            value: +item.Weight.toFixed(2),
            fill: PALETTE[index % PALETTE.length]
        })),
        ...(restWeight > 0 ? [{
            name: 'Sonstige',
            value: +restWeight.toFixed(2),
            fill: '#64748b'
        }] : [])
    ]

    const regionMap = {}
    rawData.forEach(item => {
        const region = getRegion(item.Country)
        regionMap[region] = (regionMap[region] || 0) + item.Weight
    })
    const chartRegionsData = Object.entries(regionMap).map(([name, value], index) => ({
        name,
        value: +value.toFixed(2),
        fill: PALETTE[index % PALETTE.length]
    })).sort((a, b) => b.value - a.value)

    const countryMap = {}
    rawData.forEach(item => {
        const country = item.Country || 'Unbekannt'
        countryMap[country] = (countryMap[country] || 0) + item.Weight
    })
    const chartCountriesData = Object.entries(countryMap).map(([name, value], index) => ({
        name,
        value: +value.toFixed(2),
        fill: PALETTE[index % PALETTE.length]
    })).sort((a, b) => b.value - a.value).slice(0, 15)

    const activeData = activeTab === 'holdings' ? chartHoldingsData : activeTab === 'regions' ? chartRegionsData : chartCountriesData

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, color: '#c8d4e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: 0 }}>🔬 Portfolio X-Ray (Look-Through)</h2>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Vollständige Aufschlüsselung deines Gesamtdepots</p>
                </div>

                {/* Tab-Wechsler */}
                <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }}>
                    <button onClick={() => setActiveTab('holdings')} style={{ background: activeTab === 'holdings' ? '#009991' : 'transparent', color: activeTab === 'holdings' ? '#fff' : '#64748b', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Top Aktien</button>
                    <button onClick={() => setActiveTab('regions')} style={{ background: activeTab === 'regions' ? '#009991' : 'transparent', color: activeTab === 'regions' ? '#fff' : '#64748b', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Regionen</button>
                    <button onClick={() => setActiveTab('countries')} style={{ background: activeTab === 'countries' ? '#009991' : 'transparent', color: activeTab === 'countries' ? '#fff' : '#64748b', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Länder</button>
                </div>
            </div>

            {/* Top-N Filter Knöpfe */}
            {activeTab === 'holdings' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    {[10, 15, 20, 30, 50].map(n => (
                        <button
                            key={n}
                            onClick={() => setTopLimit(n)}
                            style={{
                                background: topLimit === n ? '#009991' : '#0f1420',
                                color: topLimit === n ? '#fff' : '#93c5fd',
                                border: '1px solid #2a3a50',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 11,
                                fontWeight: topLimit === n ? 600 : 400,
                                cursor: 'pointer'
                            }}
                        >
                            Top {n}
                        </button>
                    ))}
                </div>
            )}

            {/* Chart mit funktionierendem Tooltip */}
            <div style={{ width: '100%', height: 450 }}>
                <ResponsiveContainer>
                    <PieChart>
                        <Pie
                            data={activeData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="45%"
                            outerRadius={130}
                            innerRadius={65}
                            label={false}
                            stroke="#161b27"
                            strokeWidth={2}
                        />
                        <Tooltip
                            contentStyle={{ background: '#161b27', borderColor: '#2a3a50', borderRadius: 8, color: '#fff', fontSize: 12 }}
                            formatter={(val, name) => [`${val.toFixed(2)} %`, name]}
                        />
                        <Legend
                            layout="horizontal"
                            align="center"
                            verticalAlign="bottom"
                            wrapperStyle={{ fontSize: 11, paddingTop: 20 }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}