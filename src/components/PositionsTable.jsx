const fmt      = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtYield = n => n != null ? (+n).toFixed(2).replace('.', ',') + ' %' : '–'

const typeLabel = (type, name = '') => {
    const n = (name || '').toUpperCase()
    if (n.endsWith('ETF') || n.includes('UCITS') || n.includes('INDEX FUND')) return 'ETF'
    if (type === 'crypto' || ['ADA','BTC','ETH','SOL','DOGE'].some(s => n.includes(s))) return 'Crypto'
    if (type === 'etf')      return 'ETF'
    if (type === 'security') return 'Aktie'
    if (type === 'fund')     return 'Fonds'
    return 'Aktie'
}

const typeColor = label => {
    if (label === 'ETF')    return { bg: '#1e3a5f', color: '#60a5fa' }
    if (label === 'Aktie')  return { bg: '#2e1b5e', color: '#a78bfa' }
    if (label === 'Crypto') return { bg: '#1e3a2e', color: '#34d399' }
    return                         { bg: '#2e2a1b', color: '#facc15' }
}

export default function PositionsTable({ byHolding = {}, kpiRange = 'all' }) {
    const now = new Date()

    const positions = Object.entries(byHolding).map(([isin, h]) => {
        let net = 0, gross = 0, tax = 0

        for (const [year, months] of Object.entries(h.monthly || {})) {
            for (let m = 0; m < 12; m++) {
                const date = new Date(+year, m, 1)
                const diff = (now - date) / 864e5
                if (kpiRange === 'ytd' && date.getFullYear() !== now.getFullYear()) continue
                if (kpiRange === '12m' && diff > 365) continue
                net   += months[m]            || 0
                gross += h.gross?.[year]?.[m] || 0
                tax   += h.tax?.[year]?.[m]   || 0
            }
        }

        tax = gross - net

        return {
            name:       h.name       || isin,
            type:       h.type       || 'security',
            ticker:     h.ticker     || null,
            yield:      h.yield      ?? null,
            assetYield: h.assetYield ?? null,
            net, gross, tax,
        }
    })
        .filter(p => p.net > 0)
        .sort((a, b) => b.net - a.net)

    return (
        <div style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d', marginBottom:20 }}>
            <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0', marginBottom:16 }}>Dividenden nach Positionen</h2>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                <tr>
                    {['Holding','Typ','Pers. Rendite','Div. Yield','Netto','Brutto'].map((h, i) => (
                        <th key={h} style={{
                            color:'#7a8ba0', fontWeight:500, padding:'6px 10px',
                            borderBottom:'1px solid #222d3d', fontSize:12,
                            textAlign: i < 2 ? 'left' : 'right'
                        }}>{h}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {positions.map(p => {
                    const label = typeLabel(p.type, p.name)
                    const { bg, color } = typeColor(label)
                    return (
                        <tr key={p.name}>
                            <td style={{ padding:'8px 10px', borderBottom:'1px solid #1a2233' }}>
                                {p.ticker
                                    ? <a
                                        href={`https://etfchecker.netlify.app/?ticker=${p.ticker}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color:'#60a5fa', textDecoration:'none' }}
                                        onMouseOver={e => e.currentTarget.style.textDecoration='underline'}
                                        onMouseOut={e  => e.currentTarget.style.textDecoration='none'}
                                    >
                                        {p.name}
                                    </a>
                                    : p.name
                                }
                            </td>
                            <td style={{ padding:'8px 10px', borderBottom:'1px solid #1a2233' }}>
                                <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, background:bg, color }}>
                                    {label}
                                </span>
                            </td>
                            <td style={{ padding:'8px 10px', borderBottom:'1px solid #1a2233', textAlign:'right', color: p.yield != null ? '#facc15' : '#7a8ba0', fontWeight:600 }}>
                                {fmtYield(p.yield)}
                            </td>
                            <td style={{ padding:'8px 10px', borderBottom:'1px solid #1a2233', textAlign:'right', color: p.assetYield != null ? '#38bdf8' : '#7a8ba0', fontWeight:600 }}>
                                {fmtYield(p.assetYield)}
                            </td>
                            <td style={{ padding:'8px 10px', borderBottom:'1px solid #1a2233', textAlign:'right', color:'#22c55e', fontWeight:600 }}>{fmt(p.net)}</td>
                            <td style={{ padding:'8px 10px', borderBottom:'1px solid #1a2233', textAlign:'right' }}>
                                <div>{fmt(p.gross)}</div>
                                <div style={{ fontSize:11, color:'#fb923c', marginTop:2 }}>-{fmt(p.tax)} Steuern</div>
                            </td>
                        </tr>
                    )
                })}
                </tbody>
            </table>
        </div>
    )
}