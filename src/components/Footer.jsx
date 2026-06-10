/**
 * Footer.jsx — Globaler Footer für alle Seiten
 */

const FOOTER_LINKS = [
  // { label: 'Datenschutz', href: '#' },
  // { label: 'Impressum',   href: '#' },
]

function DashLogo({ size = 20 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} aria-label="Dividend Dashboard">
      <rect width="32" height="32" rx="8" fill="#0f1420"/>
      <circle cx="16" cy="16" r="12" fill="none" stroke="#1e3a2a" strokeWidth="2"/>
      <circle cx="16" cy="16" r="12" fill="none" stroke="#22c55e" strokeWidth="2"
        strokeDasharray="28 48" strokeDashoffset="0" strokeLinecap="round"/>
      <polyline points="11,19 15,13 17,16 21,10" fill="none" stroke="#4ade80"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function Footer({ onNavigate }) {
  return (
    <footer style={{
      borderTop: '1px solid #1a2333',
      background: '#0c1018',
      padding: '20px 24px',
      marginTop: 'auto',
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        {/* Left: Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DashLogo size={20} />
          <span style={{ fontSize: 12, color: '#2d4055', fontWeight: 500 }}>
            Dividend Dashboard
          </span>
        </div>

        {FOOTER_LINKS.length > 0 && (
          <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {FOOTER_LINKS.map((link, i) => (
              link.external
                ? <a key={i} href={link.href} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#3d5266', textDecoration: 'none' }}>{link.label}</a>
                : <button key={i} onClick={() => onNavigate?.(link.href)}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: '#3d5266', cursor: 'pointer', padding: 0 }}>
                    {link.label}
                  </button>
            ))}
          </nav>
        )}

        {/* Right: Roadmap + copyright */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => onNavigate?.('roadmap')}
            style={{
              background: 'none', border: 'none',
              fontSize: 12, color: '#3d5266',
              cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#009991'}
            onMouseLeave={e => e.currentTarget.style.color = '#3d5266'}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 10.5 L6.5 2 L11 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.5 7.5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Roadmap
          </button>
          <span style={{ fontSize: 11, color: '#1e2d3d' }}>
            © {new Date().getFullYear()} Dividend Dashboard
          </span>
        </div>
      </div>
    </footer>
  )
}
