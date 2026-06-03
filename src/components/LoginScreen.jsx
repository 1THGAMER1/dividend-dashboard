import { useEffect, useRef } from 'react'

const FEATURES = [
    { icon: '📊', title: 'Dividenden-Übersicht',   desc: 'Alle Ausschüttungen auf einen Blick – monatlich, YTD oder Seit Kauf' },
    { icon: '🔮', title: 'Prognose',                desc: 'Voraussichtliche Dividenden für die nächsten 12 Monate' },
    { icon: '🗓️', title: 'Heatmap',                 desc: 'Visualisiere deine Dividenden-Monate auf einen Blick' },
    { icon: '📈', title: 'Wachstumsanalyse',        desc: 'Vergleiche dein Dividendenwachstum Jahr für Jahr' },
    { icon: '💼', title: 'Positionen',              desc: 'Rendite und Ausschüttungen pro Holding im Detail' },
    { icon: '🧮', title: 'Dividenden-Rechner',      desc: 'Wann erreichst du deine gewünschte Dividendenrendite?' },
    { icon: '➕', title: 'Und vieles mehr',         desc: 'Weitere Funktionen folgen bald!' },

]

function AnimatedBackground() {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx    = canvas.getContext('2d')
        let animId

        const resize = () => {
            canvas.width  = canvas.offsetWidth
            canvas.height = canvas.offsetHeight
        }
        resize()
        window.addEventListener('resize', resize)

        // Floating particles
        const particles = Array.from({ length: 40 }, () => ({
            x:    Math.random() * canvas.width,
            y:    Math.random() * canvas.height,
            r:    Math.random() * 2 + 1,
            vx:   (Math.random() - 0.5) * 0.4,
            vy:   (Math.random() - 0.5) * 0.4,
            alpha: Math.random() * 0.4 + 0.1,
        }))

        // Floating numbers
        const nums = Array.from({ length: 15 }, () => ({
            x:     Math.random() * canvas.width,
            y:     Math.random() * canvas.height,
            val:   (Math.random() * 5).toFixed(2) + ' %',
            vy:    -(Math.random() * 0.3 + 0.1),
            alpha: Math.random() * 0.15 + 0.05,
        }))

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            // Particles
            for (const p of particles) {
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(0, 153, 145, ${p.alpha})`
                ctx.fill()
                p.x += p.vx
                p.y += p.vy
                if (p.x < 0 || p.x > canvas.width)  p.vx *= -1
                if (p.y < 0 || p.y > canvas.height)  p.vy *= -1
            }

            // Connecting lines between nearby particles
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx   = particles[i].x - particles[j].x
                    const dy   = particles[i].y - particles[j].y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < 120) {
                        ctx.beginPath()
                        ctx.moveTo(particles[i].x, particles[i].y)
                        ctx.lineTo(particles[j].x, particles[j].y)
                        ctx.strokeStyle = `rgba(0, 153, 145, ${0.08 * (1 - dist / 120)})`
                        ctx.lineWidth   = 1
                        ctx.stroke()
                    }
                }
            }

            // Floating numbers
            for (const n of nums) {
                ctx.font      = '11px monospace'
                ctx.fillStyle = `rgba(34, 197, 94, ${n.alpha})`
                ctx.fillText(n.val, n.x, n.y)
                n.y += n.vy
                if (n.y < -20) {
                    n.y   = canvas.height + 10
                    n.x   = Math.random() * canvas.width
                    n.val = (Math.random() * 5).toFixed(2) + ' %'
                }
            }

            animId = requestAnimationFrame(draw)
        }
        draw()

        return () => {
            cancelAnimationFrame(animId)
            window.removeEventListener('resize', resize)
        }
    }, [])

    return (
        <canvas ref={canvasRef} style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
        }} />
    )
}

export default function LoginScreen({ onLogin, loading, error }) {
    return (
        <div style={{
            minHeight:      '100vh',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            background:     '#0f1420',
            position:       'relative',
            overflow:       'hidden',
            padding:        '40px 20px',
        }}>
            <AnimatedBackground />

            <div style={{
                position:      'relative',
                zIndex:        1,
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                gap:           32,
                maxWidth:      480,
                width:         '100%',
            }}>
                {/* Logo + Titel */}
                <div style={{ textAlign: 'center' }}>
                    <img
                        src="https://developer.parqet.com/img/parqet-icon-trans.svg"
                        style={{ width: 56, height: 56, marginBottom: 16 }}
                    />
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e0e6f0', margin: 0 }}>
                        Dividenden Dashboard
                    </h1>
                    <p style={{ color: '#7a8ba0', fontSize: 14, marginTop: 8 }}>
                        Dein persönliches Dividenden-Cockpit – powered by Parqet
                    </p>
                </div>

                {/* Feature-Liste */}
                <div style={{
                    background:   '#161b27',
                    border:       '1px solid #1e2a3a',
                    borderRadius: 14,
                    padding:      '20px 24px',
                    width:        '100%',
                    display:      'flex',
                    flexDirection:'column',
                    gap:          14,
                }}>
                    {FEATURES.map(f => (
                        <div key={f.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 20, lineHeight: 1.3 }}>{f.icon}</span>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#c8d4e0' }}>{f.title}</div>
                                <div style={{ fontSize: 12, color: '#556070', marginTop: 2 }}>{f.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Error */}
                {error && (
                    <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'10px 16px', borderRadius:8, fontSize:13, width:'100%' }}>
                        ⚠ {error}
                    </div>
                )}

                {/* Login Button */}
                <button
                    onClick={onLogin}
                    disabled={loading}
                    style={{
                        display:         'inline-flex',
                        alignItems:      'center',
                        justifyContent:  'center',
                        gap:             '0.5em',
                        backgroundColor: loading ? '#5bcec2' : '#009991',
                        color:           'white',
                        cursor:          loading ? 'default' : 'pointer',
                        fontWeight:      600,
                        whiteSpace:      'nowrap',
                        borderRadius:    '0.375rem',
                        border:          'none',
                        padding:         '0.625rem 1.5rem',
                        fontSize:        '1rem',
                        transition:      'background-color 0.2s',
                        width:           '100%',
                    }}
                    onMouseOver={e => { if (!loading) e.currentTarget.style.backgroundColor = '#5bcec2' }}
                    onMouseOut={e  => { if (!loading) e.currentTarget.style.backgroundColor = '#009991' }}
                >
                    <img
                        src="https://developer.parqet.com/img/parqet-icon-trans.svg"
                        alt=""
                        aria-hidden="true"
                        style={{ width:'1.6em', height:'1.6em', marginBlock:'-0.25em', flexShrink:0 }}
                    />
                    {loading ? 'Verbinde…' : 'Connect with Parqet'}
                </button>

                <p style={{ fontSize: 11, color: '#3d5266', textAlign: 'center' }}>
                    Deine Daten bleiben privat – die App liest dein Portfolio und verwendet die Daten nur zum Anzeigen der Daten.
                </p>
            </div>
        </div>
    )
}