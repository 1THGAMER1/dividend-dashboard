import React, { useState } from 'react'
import {PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Bar} from 'recharts'
import { computePortfolioXRay, getRegion } from '../utils/portfolioXray'

const COLORS = ['#009991', '#4f98a3', '#cedcd8', '#bb653b', '#d19900', '#006494', '#7a39bb', '#22c55e', '#3b82f6', '#f472b6']

export default function PortfolioXRayView({ etfHoldingsMap, userHoldings, currentValue }) {
    const [topLimit, setTopLimit] = useState(15)
    const [activeTab, setActiveTab] = useState('holdings') // 'holdings' | 'regions' | 'countries'

    const rawData = computePortfolioXRay(etfHoldingsMap, userHoldings, currentValue)

    const topHoldings = rawData.slice(0, topLimit)
    const restWeight = rawData.slice(topLimit).reduce((sum, item) => sum + item.Weight, 0)

    const chartHoldingsData = [
        ...topHoldings.map(item => ({ name: item.Name, value: +item.Weight.toFixed(2) })),
        ...(restWeight > 0 ? [{ name: 'Sonstige', value: +restWeight.toFixed(2) }] : [])
    ]

    const regionMap = {}
    rawData.forEach(item => {
        const region = getRegion(item.Country)
        regionMap[region] = (regionMap[region] || 0) + item.Weight
    })
    const chartRegionsData = Object.entries(regionMap).map(([name, value]) => ({ name, value: +value.toFixed(2) })).sort((a, b) => b.value - a.value)

    const countryMap = {}
    rawData.forEach(item => {
        const country = item.Country || 'Unbekannt'
        countryMap[country] = (countryMap[country] || 0) + item.Weight
    })
    const chartCountriesData = Object.entries(countryMap).map(([name, value]) => ({ name, value: +value.toFixed(2) })).sort((a, b) => b.value - a.value).slice(0, 15)

    const activeData = activeTab === 'holdings' ? chartHoldingsData : activeTab === 'regions' ? chartRegionsData : chartCountriesData

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, color: '#c8d4e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: 0 }}>🔬 Portfolio X-Ray (Look-Through)</h2>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Automatische Aggregation über Live-Depotwerte & ETF-Dateien</p>
                </div>

                <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }}>
                    <button onClick={() => setActiveTab('holdings')} style={{ background: activeTab === 'holdings' ? '#009991' : 'transparent', color: activeTab === 'holdings' ? '#fff' : '#64748b', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Top Aktien</button>
                    <button onClick={() => setActiveTab('regions')} style={{ background: activeTab === 'regions' ? '#009991' : 'transparent', color: activeTab === 'regions' ? '#fff' : '#64748b', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Regionen</button>
                    <button onClick={() => setActiveTab('countries')} style={{ background: activeTab === 'countries' ? '#009991' : 'transparent', color: activeTab === 'countries' ? '#fff' : '#64748b', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Länder</button>
                </div>
            </div>

            {activeTab === 'holdings' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    {[10, 15, 20, 30, 50].map(n => (
                        <button key={n} onClick={() => setTopLimit(n)} style={{ background: topLimit === n ? '#1e3a5f' : 'transparent', color: topLimit === n ? '#93c5fd' : '#64748b', border: '1px solid #2a3a50', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                            Top {n}
                        </button>
                    ))}
                </div>
            )}

            <div style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer>
                    <PieChart>
                        <Pie data={activeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={140} innerRadius={60} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}>
                            {activeData.map((_, index) => (
                                <Bar key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#161b27', borderColor: '#2a3a50', borderRadius: 8, color: '#fff' }} formatter={(val) => `${val.toFixed(2)} %`} />
                        <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}