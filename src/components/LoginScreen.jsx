import { useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const FEATURES = [
    { icon: '📊', title: 'Dividenden & Portfolio-Übersicht', desc: 'Alle Ausschüttungen und Bestände auf einen Blick' },
    { icon: '✍️', title: 'Manuelle Aktivitäten',            desc: 'Käufe, Verkäufe und Dividenden selbst erfassen & verwalten' },
    { icon: '🔮', title: 'Prognose & Heatmap',               desc: 'Voraussichtliche Dividenden und Monatsübersicht' },
    { icon: '📈', title: 'Unabhängige Performance',          desc: 'Wertentwicklung, TTWROR & Drawdown in Echtzeit' },
    { icon: '🔄', title: 'Optionaler Parqet-Sync',           desc: 'Verknüpfe Parqet jederzeit für automatische Importe' },
]

function ParqetLogo({ style }) {
    return (
        <svg viewBox="0 0 24 24" fill="#009991" style={style} xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5h2v5h-2zm0-7v-2h2v2h-2z" />
        </svg>
    )
}

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

        const particles = Array.from({ length: 40 }, () => ({
            x:     Math.random() * canvas.width,
            y:     Math.random() * canvas.height,
            r:     Math.random() * 2 + 1,
            vx:    (Math.random() - 0.5) * 0.4,
            vy:    (Math.random() - 0.5) * 0.4,
            alpha: Math.random() * 0.4 + 0.1,
        }))

        const nums = Array.from({ length: 15 }, () => ({
            x:     Math.random() * canvas.width,
            y:     Math.random() * canvas.height,
            val:   (Math.random() * 5).toFixed(2) + ' %',
            vy:    -(Math.random() * 0.3 + 0.1),
            alpha: Math.random() * 0.15 + 0.05,
        }))

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

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

            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx   = particles[i].x - particles[j].x
                    const dy   = particles[i].y - particles[j].y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < 120) {
                        ctx.beginPath()
                        ctx.moveTo(particles[i].x, particles[i].y)
                        ctx.lineTo(particles[i].x, particles[i].y)
                        ctx.strokeStyle = `rgba(0, 153, 145, ${0.08 * (1 - dist / 120)})`
                        ctx.lineWidth   = 1
                        ctx.stroke()
                    }
                }
            }

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

export default function LoginScreen({ onLogin, onSkipParqet, loading, error }) {
    const handleSignOut = async () => {
        await supabase.auth.signOut()
        window.location.href = '/'
    }

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

            <button
                onClick={handleSignOut}
                style={{
                    position: 'absolute', top: 16, right: 20, zIndex: 10,
                    background: 'none', border: 'none',
                    color: '#64748b', fontSize: 13, cursor: 'pointer',
                    textDecoration: 'underline', padding: 0,
                }}
            >
                Abmelden
            </button>

            <div style={{
                position:      'relative',
                zIndex:        1,
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                gap:           24,
                maxWidth:      480,
                width:         '100%',
            }}>
                {/* Logo + Titel */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 42, marginBottom: 10 }}>📈</div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e0e6f0', margin: 0 }}>
                        Willkommen im Dashboard
                    </h1>
                    <p style={{ color: '#7a8ba0', fontSize: 14, marginTop: 6 }}>
                        Wähle, wie du dein Portfolio verwalten möchtest
                    </p>
                </div>

                {/* Feature-Liste */}
                <div style={{
                    background:   '#161b27',
                    border:       '1px solid #1e2a3a',
                    borderRadius: 14,
                    padding:      '18px 22px',
                    width:        '100%',
                    display:      'flex',
                    flexDirection:'column',
                    gap:          12,
                }}>
                    {FEATURES.map(f => (
                        <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 18, lineHeight: 1.3 }}>{f.icon}</span>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#c8d4e0' }}>{f.title}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{f.desc}</div>
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

                {/* Buttons: Mit Parqet verbinden ODER Ohne Parqet starten */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* 1. Parqet Verbinden Button */}
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
                            borderRadius:    8,
                            border:          'none',
                            padding:         '12px 18px',
                            fontSize:        '15px',
                            transition:      'background-color 0.2s',
                            width:           '100%',
                        }}
                    >
                        <ParqetLogo style={{ width:'1.4em', height:'1.4em', marginBlock:'-0.2em', flexShrink:0, fill: 'white' }} />
                        {loading ? 'Verbinde…' : 'Mit Parqet verbinden'}
                    </button>

                    {/* 2. Direkter Einstieg ohne Parqet */}
                    <button
                        onClick={onSkipParqet}
                        disabled={loading}
                        style={{
                            display:         'inline-flex',
                            alignItems:      'center',
                            justifyContent:  'center',
                            backgroundColor: '#0f1420',
                            color:           '#93c5fd',
                            cursor:          'pointer',
                            fontWeight:      600,
                            borderRadius:    8,
                            border:          '1px solid #2a3a50',
                            padding:         '11px 18px',
                            fontSize:        '14px',
                            transition:      'all 0.2s',
                            width:           '100%',
                        }}
                        onMouseOver={e => e.currentTarget.style.borderColor = '#009991'}
                        onMouseOut={e => e.currentTarget.style.borderColor = '#2a3a50'}
                    >
                        ✍️ Ohne Parqet fortfahren (Manuell verwalten)
                    </button>
                </div>

                <p style={{ fontSize: 11, color: '#475569', textAlign: 'center', margin: 0 }}>
                    Du kannst Parqet auch jederzeit später in den Einstellungen verknüpfen oder trennen.
                </p>
            </div>
        </div>
    )
}