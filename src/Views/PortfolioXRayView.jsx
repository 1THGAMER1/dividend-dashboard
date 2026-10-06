import React, { useState } from 'react'
import { PieChart, Pie, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { computePortfolioXRay, getRegion } from '../utils/portfolioXray'

const PALETTE = [
    '#009991', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899',
    '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#eab308', '#a855f7', '#3b82f6', '#ec4899'
]

const TABS = [
    ['holdings', 'Top Aktien'],
    ['regions', 'Regionen'],
    ['countries', 'Länder']
]

const tabStyle = (active) => ({
    background: active ? '#009991' : 'transparent',
    color: active ? '#fff' : '#64748b',
    border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
})

const toggleStyle = (active, disabled) => ({
    background: active ? '#009991' : '#0f1420',
    color: active ? '#fff' : '#93c5fd',
    border: '1px solid #2a3a50', borderRadius: 6, padding: '4px 10px', fontSize: 11,
    fontWeight: active ? 600 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1
})

const fmt = (n) => n.toFixed(1).replace('.', ',')

export default function PortfolioXRayView({ etfHoldingsMap, userHoldings, currentValue }) {
    const [topLimit, setTopLimit] = useState(15)
    const [activeTab, setActiveTab] = useState('holdings')
    const [hideCrypto, setHideCrypto] = useState(false)
    const [hideOther, setHideOther] = useState(false)

    const allData = computePortfolioXRay(etfHoldingsMap, userHoldings, currentValue)

    // Krypto-Anteil (am Gesamtdepot) und optionales Ausblenden
    const cryptoWeight = allData.filter(i => i.Country === 'Krypto').reduce((s, i) => s + i.Weight, 0)
    const rawData = hideCrypto ? allData.filter(i => i.Country !== 'Krypto') : allData

    // --- Top Aktien ---
    const topHoldings = rawData.slice(0, topLimit)
    const restWeight = rawData.slice(topLimit).reduce((sum, item) => sum + item.Weight, 0)
    const chartHoldingsData = [
        ...topHoldings.map((item, index) => ({
            name: item.Name,
            value: +item.Weight.toFixed(2),
            fill: PALETTE[index % PALETTE.length]
        })),
        ...(restWeight > 0 && !hideOther ? [{ name: 'Sonstige', value: +restWeight.toFixed(2), fill: '#64748b' }] : [])
    ]

    // --- Regionen ---
    const regionMap = {}
    rawData.forEach(item => {
        const region = getRegion(item.Country)
        regionMap[region] = (regionMap[region] || 0) + item.Weight
    })
    const regionsOther = regionMap['Sonstige'] || 0
    const chartRegionsData = Object.entries(regionMap)
        .filter(([name]) => !(hideOther && name === 'Sonstige'))
        .map(([name, value], index) => ({ name, value: +value.toFixed(2), fill: PALETTE[index % PALETTE.length] }))
        .sort((a, b) => b.value - a.value)

    // --- Länder ---
    const countryMap = {}
    rawData.forEach(item => {
        const country = item.Country || 'Unbekannt'
        countryMap[country] = (countryMap[country] || 0) + item.Weight
    })
    const chartCountriesData = Object.entries(countryMap)
        .map(([name, value], index) => ({ name, value: +value.toFixed(2), fill: PALETTE[index % PALETTE.length] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15)

    // "Sonstige" gibt es nur in Top Aktien (Rest hinter Top-N) und Regionen (nicht zuordenbare Länder)
    const otherAvailable = activeTab !== 'countries'
    const otherWeight = activeTab === 'holdings' ? restWeight : activeTab === 'regions' ? regionsOther : 0

    let activeData = activeTab === 'holdings' ? chartHoldingsData : activeTab === 'regions' ? chartRegionsData : chartCountriesData

    // Nach dem Ausblenden auf 100 % der sichtbaren Positionen hochrechnen
    const rescale = hideCrypto || (hideOther && otherAvailable)
    const total = activeData.reduce((s, d) => s + d.value, 0)
    if (rescale && total > 0) {
        activeData = activeData.map(d => ({ ...d, value: +((d.value / total) * 100).toFixed(2) }))
    }

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, color: '#c8d4e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: 0 }}>🔬 Portfolio X-Ray (Look-Through)</h2>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Vollständige Aufschlüsselung deines Gesamtdepots</p>
                </div>

                <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }}>
                    {TABS.map(([id, label]) => (
                        <button key={id} onClick={() => setActiveTab(id)} style={tabStyle(activeTab === id)}>{label}</button>
                    ))}
                </div>
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {activeTab === 'holdings' && [10, 15, 20, 30, 50].map(n => (
                    <button key={n} onClick={() => setTopLimit(n)} style={toggleStyle(topLimit === n, false)}>
                        Top {n}
                    </button>
                ))}

                <span style={{ flex: 1 }} />

                <button
                    onClick={() => setHideCrypto(v => !v)}
                    disabled={cryptoWeight <= 0}
                    style={toggleStyle(hideCrypto, cryptoWeight <= 0)}
                    title="Krypto-Positionen aus der Auswertung entfernen"
                >
                    {hideCrypto ? '✓ ' : ''}Krypto ausblenden{cryptoWeight > 0 ? ` (${fmt(cryptoWeight)} %)` : ''}
                </button>
                <button
                    onClick={() => setHideOther(v => !v)}
                    disabled={!otherAvailable}
                    style={toggleStyle(hideOther && otherAvailable, !otherAvailable)}
                    title={otherAvailable ? 'Das Feld "Sonstige" entfernen' : 'In der Länder-Ansicht gibt es kein Feld "Sonstige"'}
                >
                    {hideOther && otherAvailable ? '✓ ' : ''}Sonstige ausblenden{otherAvailable && otherWeight > 0 ? ` (${fmt(otherWeight)} %)` : ''}
                </button>
            </div>

            {rescale && (
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
                    Anteile beziehen sich auf die sichtbaren Positionen (Summe = 100 %).
                </p>
            )}

            <div style={{ width: '100%', height: 450 }}>
                <ResponsiveContainer>
                    <PieChart key={activeTab + topLimit + hideCrypto + hideOther}>
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
                            isAnimationActive={false}
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