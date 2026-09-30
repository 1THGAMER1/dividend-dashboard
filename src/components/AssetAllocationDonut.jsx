import React from 'react'
import { PieChart, Pie, ResponsiveContainer } from 'recharts'
import { getAssetAllocation } from '/src/dataUtils.js'

const COLORS = ['#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#facc15']
const fmtVal = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function AssetAllocationDonut({ holdings = [], currentValue = 0 }) {
    const data = getAssetAllocation(holdings, currentValue)

    if (!data || data.length === 0) {
        return (
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 40, textAlign: 'center', color: '#64748b' }}>
                Lade Allokations-Daten…
            </div>
        )
    }

    const totalValue = data.reduce((sum, item) => sum + item.value, 0)
    const coloredData = data.map((item, index) => ({
        ...item,
        fill: COLORS[index % COLORS.length]
    }))

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 28, marginBottom: 24 }}>
            <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0', margin: 0 }}>
                    🍰 Vermögensaufteilung nach Asset-Klassen
                </h3>
                <p style={{ color: '#7a8ba0', fontSize: 13, marginTop: 4 }}>Aufteilung deines Portfolios</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>

                <div style={{ width: '100%', height: 320, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
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
                                activeIndex={-1}
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
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0', marginTop: 2 }}>{fmtVal(totalValue)}</div>
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