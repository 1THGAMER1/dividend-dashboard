/**
 * RoadmapPage.jsx — Elegante, moderne Roadmap-Seite
 * Items können einzeln als done markiert werden direkt in den Daten.
 */

const ROADMAP = [
  {
    phase: '01',
    status: 'done',
    title: 'Foundation',
    period: 'Q2 2026',
    items: [
      { text: 'Parqet OAuth2 PKCE Integration',              done: true },
      { text: 'Dividenden-Dashboard mit KPI-Karten',         done: true },
      { text: 'Jahres- & Monatsübersicht (Chart)',           done: true },
      { text: 'Heatmap der Dividendenhistorie',              done: true },
      { text: 'Positions-Tabelle mit Prognosen',             done: true },
    ],
  },
  {
    phase: '02',
    status: 'done',
    title: 'Planning Tools',
    period: 'Q2 2026',
    items: [
      { text: 'Dividenden-Rechner (Zielplanung)',            done: true },
      { text: 'DRIP-Simulator (Reinvestitionsrechner)',      done: true },
      { text: 'Kalender-Ansicht für Zahlungstermine',       done: true },
      { text: 'Upcoming Dividends (90-Tage-Preview)',        done: true },
    ],
  },
  {
    phase: '02b',
    status: 'done',
    title: 'Sicherheit & Zuverlässigkeit',
    period: 'Q2 2026',
    items: [
      { text: 'AES-256-GCM Verschlüsselung der Client ID',  done: true },
      { text: 'JWK Key Caching (kein Re-Login nach Reload)', done: true },
      { text: 'CORS-Einschränkung & Bearer-Auth am Proxy',  done: true },
      { text: 'Access Token in sessionStorage (XSS-Schutz)', done: true },
      { text: 'Weitere kleine QoL Verbesserungen',           done: true },
    ],
  },
  {
    phase: '03',
    status: 'active',
    title: 'Portfolio Intelligence',
    period: 'Q2–Q3 2026',
    items: [
      { text: 'Steuer-Export (CSV / PDF)',                                          done: false },
      { text: 'Dividenden-Donut (Schnell sehen wer die meisten Dividenden zahlt.)', done: true  },
      { text: 'Benchmark-Vergleich (ETF vs. Portfolio)',                            done: false },
      { text: 'Inflationsbereingte Renditeansicht',                                 done: false },
    ],
  },
  {
    phase: '04',
    status: 'planned',
    title: 'Benachrichtigungen & Automatisierung',
    period: 'Q3–Q4 2026',
    items: [
      { text: 'E-Mail-Benachrichtigung bei Dividendenzahlungen', done: false },
      { text: 'Wöchentlicher Portfolio-Report per Mail',         done: false },
      { text: 'Multi-Portfolio-Unterstützung',                  done: false },
      { text: 'Browser Push-Notifications',                      done: false },
      { text: 'Automatischer Daten-Refresh (Cron)',              done: false },
    ],
  },
  {
    phase: '05',
    status: 'planned',
    title: 'Social & Sharing',
    period: '2027',
    items: [
      { text: 'Portfolio-Snapshot teilen (anonymisiert)',          done: false },
      { text: 'Community-Vergleich (anonymisiertes Ranking)',      done: false },
      { text: 'Öffentliches Dividenden-Tagebuch (opt-in)',         done: false },
    ],
  },
]

const STATUS_CONFIG = {
  done:    { label: 'Abgeschlossen', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.25)',    dot: '#22c55e' },
  active:  { label: 'In Arbeit',     color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.3)',    dot: '#38bdf8' },
  planned: { label: 'Geplant',       color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.15)', dot: '#475569' },
}

export default function RoadmapPage() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 52px)',
      background: '#0f1420',
      paddingBottom: 80,
    }}>
      {/* Hero Header */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '56px 24px 48px',
        textAlign: 'center',
        borderBottom: '1px solid #1a2333',
      }}>
        <div style={{
          position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
          width: 480, height: 220,
          background: 'radial-gradient(ellipse at center, rgba(0,153,145,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: '#009991',
          marginBottom: 14,
        }}>Product Roadmap</p>
        <h1 style={{
          fontSize: 'clamp(1.75rem, 4vw, 3rem)',
          fontWeight: 800, color: '#e8edf5',
          lineHeight: 1.15, margin: '0 auto 16px',
          maxWidth: 640,
          letterSpacing: '-0.02em',
        }}>Was als nächstes kommt</h1>
        <p style={{
          fontSize: 15, color: '#5a7490',
          maxWidth: 480, margin: '0 auto',
          lineHeight: 1.65,
        }}>
          Transparenz über den Entwicklungsfortschritt und die geplanten Features des Dividend Dashboards.
        </p>

        <div style={{
          display: 'flex', gap: 20, justifyContent: 'center',
          marginTop: 32, flexWrap: 'wrap',
        }}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: cfg.dot,
                display: 'inline-block',
                boxShadow: key === 'active' ? `0 0 6px ${cfg.dot}` : 'none',
              }} />
              <span style={{ fontSize: 12, color: '#5a7490' }}>{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 20px 0' }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute',
            left: 32, top: 0, bottom: 0,
            width: 1,
            background: 'linear-gradient(to bottom, rgba(0,153,145,0.4), rgba(30,42,60,0.2))',
          }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {ROADMAP.map((phase, phaseIdx) => {
              const cfg      = STATUS_CONFIG[phase.status]
              const isActive = phase.status === 'active'
              const isDone   = phase.status === 'done'

              const doneCount  = phase.items.filter(it => it.done).length
              const totalCount = phase.items.length
              const progressPct = Math.round((doneCount / totalCount) * 100)
              const showProgress = !isDone && doneCount > 0

              return (
                <div key={phaseIdx} style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>

                  {/* Phase bubble */}
                  <div style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
                    <div style={{
                      width: 64, height: 64,
                      borderRadius: '50%',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(0,153,145,0.12))'
                        : isDone
                          ? 'rgba(34,197,94,0.08)'
                          : 'rgba(30,42,60,0.6)',
                      border: `1.5px solid ${cfg.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: 1,
                      boxShadow: isActive ? `0 0 20px rgba(56,189,248,0.12)` : 'none',
                    }}>
                      <span style={{ fontSize: 10, color: cfg.color, fontWeight: 700, letterSpacing: '0.05em' }}>Phase</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{phase.phase}</span>
                    </div>
                  </div>

                  {/* Card */}
                  <div style={{
                    flex: 1,
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(56,189,248,0.06), rgba(0,153,145,0.04))'
                      : isDone
                        ? 'rgba(22,27,39,0.8)'
                        : 'rgba(16,20,30,0.6)',
                    border: `1px solid ${cfg.border}`,
                    borderRadius: 16,
                    padding: '20px 24px',
                    backdropFilter: 'blur(8px)',
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#d0dae8', margin: 0 }}>{phase.title}</h2>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px',
                          borderRadius: 20, background: cfg.bg,
                          color: cfg.color, border: `1px solid ${cfg.border}`,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                          {isActive && <span style={{ marginRight: 4 }}>◉</span>}
                          {cfg.label}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: '#3d5266', fontWeight: 500 }}>{phase.period}</span>
                    </div>

                    {/* Fortschrittsbalken */}
                    {showProgress && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: '#3d5266' }}>
                            {doneCount} von {totalCount} abgeschlossen
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: doneCount === totalCount ? '#22c55e' : '#38bdf8' }}>
                            {progressPct} %
                          </span>
                        </div>
                        <div style={{ height: 4, background: '#1e2a3a', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${progressPct}%`,
                            borderRadius: 99,
                            background: doneCount === totalCount
                              ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                              : 'linear-gradient(90deg, #38bdf8, #009991)',
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                      </div>
                    )}

                    {/* Items */}
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {phase.items.map((item, itemIdx) => {
                        const isChecked = item.done
                        const checkColor = isDone ? '#22c55e' : '#38bdf8'

                        return (
                          <li key={itemIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            {/* Checkbox */}
                            <span style={{
                              flexShrink: 0, marginTop: 2,
                              width: 16, height: 16,
                              borderRadius: '50%',
                              border: isChecked ? 'none' : `1.5px solid ${cfg.border}`,
                              background: isChecked
                                ? isDone ? 'rgba(34,197,94,0.15)' : 'rgba(56,189,248,0.18)'
                                : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: isChecked && !isDone ? '0 0 6px rgba(56,189,248,0.35)' : 'none',
                            }}>
                              {isChecked && (
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                  <path d="M1.5 4l1.8 1.8L6.5 2"
                                    stroke={checkColor}
                                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </span>

                            {/* Text */}
                            <span style={{
                              fontSize: 13.5, flex: 1,
                              color: isChecked
                                ? isDone ? '#7a8fa8' : '#4a7a8a'
                                : phase.status === 'active' ? '#9ab3c8' : '#4a5e72',
                              lineHeight: 1.5,
                              textDecoration: isChecked && !isDone ? 'line-through' : 'none',
                              textDecorationColor: '#2a4a5a',
                            }}>{item.text}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p style={{
          textAlign: 'center', marginTop: 56,
          fontSize: 12, color: '#2d3f52',
          lineHeight: 1.7,
        }}>
          Diese Roadmap spiegelt den aktuellen Planungsstand wider und kann sich ändern.<br/>
          Feedback und Feature-Wünsche sind willkommen.
        </p>
      </div>
    </div>
  )
}
