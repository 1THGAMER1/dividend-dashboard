export default function KpiCard({ label, value, color = '#e0e6f0', sub, detail, subHighlight, onClick }) {
    const len    = typeof value === 'string' ? value.length : 0
    const isLong = len > 18

    return (
        <div onClick={onClick} style={{
            background:     '#161b27',
            borderRadius:   12,
            padding:        '16px 20px',
            border:         '1px solid #1e2a3a',
            flex:           '1 1 160px',
            minWidth:       0,
            display:        'flex',
            flexDirection:  'column',
            justifyContent: 'space-between',
            minHeight:      110,
            cursor:         onClick ? 'pointer' : 'default',
        }}>
            {/* Label – immer oben */}
            <div style={{
                fontSize:      10,
                color:         '#556070',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
            }}>
                {label}
            </div>

            {/* Hauptwert */}
            <div style={{
                fontSize:   isLong ? 14 : 30,
                fontWeight: isLong ? 600 : 700,
                color:      isLong ? '#c8d6e5' : color,
                lineHeight: isLong ? 1.35 : 1,
                wordBreak:  'break-word',
                margin:     '8px 0 4px 0',
            }}>
                {value}
            </div>

            {/* Detail links · Sub rechts */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                {detail && (
                    <div style={{ fontSize:13, color:'#6a7f94', display:'flex', alignItems:'center', gap:6 }}>
                        <span>{detail.label}</span>
                        <span style={{
                            color:        detail.color || '#7c9db5',
                            fontWeight:   700,
                            background:   '#1e2d40',
                            borderRadius: 4,
                            padding:      '2px 7px',
                            fontSize:     13,
                        }}>
                            {detail.value}
                        </span>
                    </div>
                )}
                {detail && sub && (
                    <div style={{
                        width:           4,
                        height:          4,
                        borderRadius:    '50%',
                        background:      '#2e3f52',
                        flexShrink:      0,
                    }} />
                )}
                {sub && (
                    <div style={{
                        fontSize:   subHighlight ? 13 : 11,
                        color:      subHighlight ? '#94a3b8' : '#3d5266',
                        fontWeight: subHighlight ? 600 : 400,

                    }}>
                        {sub}
                    </div>
                )}
            </div>
        </div>
    )
}