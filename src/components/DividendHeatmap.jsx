import { MONTHS, heatColor } from '../dataUtils'

export default function DividendHeatmap({ monthly }) {
    const years  = Object.keys(monthly).map(Number).sort()
    const cy     = new Date().getFullYear()
    const cm     = new Date().getMonth()
    const maxVal = Math.max(...years.flatMap(y => monthly[y] || []), 0.01)

    return (
        <div style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d', marginBottom:20 }}>
            <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0', marginBottom:16 }}>Dividenden Heatmap</h2>
            <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:3, fontSize:13 }}>
                    <thead>
                    <tr>
                        <th style={{ color:'#7a8ba0', textAlign:'left', padding:'4px 8px', fontSize:12, minWidth:48 }}>Jahr</th>
                        {MONTHS.map(m => <th key={m} style={{ color:'#7a8ba0', textAlign:'center', padding:'4px 6px', fontSize:12, minWidth:52 }}>{m}</th>)}
                        <th style={{ color:'#7a8ba0', textAlign:'right', padding:'4px 8px', fontSize:12, minWidth:60 }}>Σ</th>
                    </tr>
                    </thead>
                    <tbody>
                    {[...years].reverse().map(y => {
                        const row   = monthly[y] || Array(12).fill(0)
                        const total = row.reduce((a, b) => a + b, 0)
                        return (
                            <tr key={y}>
                                <td style={{ padding:'4px 8px', fontWeight:600, color:'#c8d4e0', fontSize:13 }}>{y}</td>
                                {row.map((v, i) => {
                                    const future  = y === cy && i > cm
                                    const bg      = future ? '#111827' : heatColor(v, maxVal)
                                    const textCol = v > maxVal * 0.4 ? '#fff' : v > 0 ? '#a7f3d0' : '#2d3f55'
                                    return (
                                        <td key={i} style={{ padding:'8px 4px', textAlign:'center', borderRadius:6, background:bg, fontSize:12, fontWeight:v > 0 ? 600 : 400, color:future ? '#1f2937' : textCol }}>
                                            {future ? '–' : v > 0 ? `${v.toFixed(2)}€` : '–'}
                                        </td>
                                    )
                                })}
                                <td style={{ padding:'4px 8px', textAlign:'right', fontWeight:700, color:'#22c55e', fontSize:13 }}>{total.toFixed(2)} €</td>
                            </tr>
                        )
                    })}
                    <tr style={{ borderTop:'2px solid #222d3d' }}>
                        <td style={{ padding:'8px 8px', fontWeight:700, color:'#7a8ba0', fontSize:12 }}>Σ</td>
                        {MONTHS.map((_, i) => {
                            const total = years.reduce((s, y) => s + (monthly[y]?.[i] || 0), 0)
                            return <td key={i} style={{ padding:'8px 4px', textAlign:'center', fontSize:12, fontWeight:600, color:'#60a5fa' }}>{total > 0 ? `${total.toFixed(2)}€` : '–'}</td>
                        })}
                        <td style={{ padding:'8px 8px', textAlign:'right', fontWeight:700, color:'#22c55e', fontSize:13 }}>
                            {years.reduce((s, y) => s + (monthly[y] || []).reduce((a, b) => a + b, 0), 0).toFixed(2)} €
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12 }}>
                <span style={{ color:'#4a6080', fontSize:11 }}>Wenig</span>
                {[0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map(i => (
                    <div key={i} style={{ width:20, height:12, borderRadius:3, background:heatColor(i * maxVal, maxVal) }} />
                ))}
                <span style={{ color:'#4a6080', fontSize:11 }}>Viel</span>
            </div>
        </div>
    )
}