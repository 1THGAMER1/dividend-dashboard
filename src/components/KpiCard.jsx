import React, { useLayoutEffect, useRef, useState } from 'react'

const MIN_REM = 1
const MAX_REM = 1.75

export default function KpiCard({ label, value, color = '#e0e6f0', sub, detail, subHighlight, onClick }) {
    const len    = typeof value === 'string' ? value.length : 0
    const isLong = len > 18
    const boxRef  = useRef(null)
    const textRef = useRef(null)
    const [fontPx, setFontPx] = useState(null)

    useLayoutEffect(() => {
        const box = boxRef.current
        const text = textRef.current
        if (!box || !text || isLong) return

        const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

        const fit = () => {
            const available = box.clientWidth
            const width = text.getBoundingClientRect().width
            const current = parseFloat(getComputedStyle(text).fontSize)
            if (!available || !width || !current) return

            // Schrift so skalieren, dass der Text die Breite ausfüllt (2 % Luft)
            const next = Math.min(
                MAX_REM * rootPx,
                Math.max(MIN_REM * rootPx, current * (available / width) * 0.98)
            )
            setFontPx(prev => (prev != null && Math.abs(prev - next) < 0.5 ? prev : next))
        }

        fit()
        const ro = new ResizeObserver(fit)
        ro.observe(box)
        return () => ro.disconnect()
    }, [value, isLong])

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
            <div style={{
                fontSize:      10,
                color:         '#556070',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
            }}>
                {label}
            </div>

            <div ref={boxRef} style={{
                fontWeight: isLong ? 600 : 700,
                color:      isLong ? '#c8d6e5' : color,
                lineHeight: isLong ? 1.35 : 1,
                margin:     '8px 0 4px 0',
                overflow:   'hidden',
                whiteSpace: isLong ? 'normal' : 'nowrap',
                wordBreak:  isLong ? 'break-word' : 'normal',
                fontSize:   isLong ? '1rem' : (fontPx ? `${fontPx}px` : '1.5rem'),
            }}>
                <span ref={textRef} style={{ display: 'inline-block' }}>
                    {value}
                </span>
            </div>

            {/* Detail + Sub */}
            <div
                className="kpi-card-footer"
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 6, flexWrap:'wrap' }}
            >
                {detail && (
                    <div style={{ fontSize:13, color:'#6a7f94', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                        <span style={{ whiteSpace:'nowrap' }}>{detail.label}</span>
                        <span style={{
                            color:        detail.color || '#7c9db5',
                            fontWeight:   700,
                            whiteSpace:   'nowrap',
                        }}>
                            {detail.value}
                        </span>
                    </div>
                )}
                {detail && sub && (
                    <div
                        className="kpi-card-dot"
                        style={{ width:4, height:4, borderRadius:'50%', background:'#2e3f52', flexShrink:0 }}
                    />
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