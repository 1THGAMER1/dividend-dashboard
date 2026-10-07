import React, { useState } from 'react'
import { PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts'
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

// Standard je Ansicht: true = wird ausgeblendet
const DEFAULT_FILTERS = {
    holdings: { crypto: false, commodities: false },
    regions: { crypto: true, commodities: true },
    countries: { crypto: true, commodities: true }
}

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
    const [filters, setFilters] = useState(DEFAULT_FILTERS)
    const [hideOther, setHideOther] = useState(false)
    const [showAllLegend, setShowAllLegend] = useState(false)

    const hideCrypto = filters[activeTab].crypto
    const hideCommodities = filters[activeTab].commodities
    const toggleFilter = (key) =>
        setFilters(f => ({ ...f, [activeTab]: { ...f[activeTab], [key]: !f[activeTab][key] } }))

    const allData = computePortfolioXRay(etfHoldingsMap, userHoldings, currentValue)

    // Anteile am Gesamtdepot (für die Beschriftung der Knöpfe)
    const cryptoWeight = allData.filter(i => i.Country === 'Krypto').reduce((s, i) => s + i.Weight, 0)
    const commodityWeight = allData.filter(i => i.Country === 'Rohstoffe').reduce((s, i) => s + i.Weight, 0)

    const rawData = allData.filter(i =>
        !(hideCrypto && i.Country === 'Krypto') &&
        !(hideCommodities && i.Country === 'Rohstoffe')
    )

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

    // "Sonstige" gibt es nur in Top Aktien (Rest hinter Top-N) und Regionen
    const otherAvailable = activeTab !== 'countries'
    const otherWeight = activeTab === 'holdings' ? restWeight : activeTab === 'regions' ? regionsOther : 0

    let activeData = activeTab === 'holdings' ? chartHoldingsData : activeTab === 'regions' ? chartRegionsData : chartCountriesData

    // Nach dem Ausblenden auf 100 % der sichtbaren Positionen hochrechnen
    const rescale = hideCrypto || hideCommodities || (hideOther && otherAvailable)
    const total = activeData.reduce((s, d) => s + d.value, 0)
    if (rescale && total > 0) {
        activeData = activeData.map(d => ({ ...d, value: +((d.value / total) * 100).toFixed(2) }))
    }

    // Kreis und Legende: nach Größe sortiert
    const sortedData = [...activeData].sort((a, b) => b.value - a.value)

    const LEGEND_PREVIEW = 12
    const legendItems = showAllLegend ? sortedData : sortedData.slice(0, LEGEND_PREVIEW)

    // Was steckt noch in "Global"?
    const globalAll = rawData.filter(i => String(i.Country).toUpperCase() === 'GLOBAL')
    const globalTotal = globalAll.reduce((s, i) => s + i.Weight, 0)

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 'clamp(10px, 3vw, 20px)', color: '#c8d4e0' }}>
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
                    onClick={() => toggleFilter('crypto')}
                    disabled={cryptoWeight <= 0}
                    style={toggleStyle(hideCrypto && cryptoWeight > 0, cryptoWeight <= 0)}
                    title="Krypto-Positionen aus dieser Ansicht entfernen"
                >
                    {hideCrypto && cryptoWeight > 0 ? '✓ ' : ''}Krypto ausblenden{cryptoWeight > 0 ? ` (${fmt(cryptoWeight)} %)` : ''}
                </button>
                <button
                    onClick={() => toggleFilter('commodities')}
                    disabled={commodityWeight <= 0}
                    style={toggleStyle(hideCommodities && commodityWeight > 0, commodityWeight <= 0)}
                    title="Rohstoffe (z. B. Gold) aus dieser Ansicht entfernen"
                >
                    {hideCommodities && commodityWeight > 0 ? '✓ ' : ''}Rohstoffe ausblenden{commodityWeight > 0 ? ` (${fmt(commodityWeight)} %)` : ''}
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

            <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
                <ResponsiveContainer width="100%" aspect={1}>
                    <PieChart key={[activeTab, topLimit, hideCrypto, hideCommodities, hideOther].join('-')}>
                        <Pie
                            data={sortedData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius="92%"
                            innerRadius="58%"
                            label={false}
                            stroke="#161b27"
                            strokeWidth={2}
                            isAnimationActive={false}
                        />
                        <Tooltip
                            contentStyle={{ background: '#161b27', borderColor: '#2a3a50', borderRadius: 8, color: '#fff', fontSize: 12 }}
                            formatter={(val, name) => [`${val.toFixed(2)} %`, name]}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            <ul style={{
                listStyle: 'none', margin: '16px 0 0', padding: 0,
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '6px 16px', fontSize: 11
            }}>
                {legendItems.map(d => (
                    <li key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, color: '#c8d4e0' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.fill, flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>
                {d.name}
            </span>
                        <span style={{ color: '#64748b', flexShrink: 0 }}>{fmt(d.value)} %</span>
                    </li>
                ))}
            </ul>

            {sortedData.length > LEGEND_PREVIEW && (
                <button
                    onClick={() => setShowAllLegend(v => !v)}
                    style={{ ...toggleStyle(false, false), marginTop: 12 }}
                >
                    {showAllLegend ? 'Weniger anzeigen' : `Alle ${sortedData.length} anzeigen`}
                </button>
            )}

            {globalTotal > 0 && (
                <details style={{ marginTop: 12, fontSize: 12, color: '#c8d4e0' }}>
                    <summary style={{ cursor: 'pointer', color: '#93c5fd' }}>
                        Was steckt in „Global“? ({fmt(globalTotal)} %)
                    </summary>
                    <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                        {globalAll.slice(0, 20).map(i => (
                            <div key={i.Name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <span>{i.Name}</span>
                                <span>{fmt(i.Weight)} %</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    )
}