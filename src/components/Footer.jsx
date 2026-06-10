/**
 * Footer.jsx — Globaler Footer für alle Seiten
 * Erweiterbar: Links-Array einfach ergänzen
 */

const FOOTER_LINKS = [
  // { label: 'Datenschutz', href: '#' },
  // { label: 'Impressum',   href: '#' },
  // { label: 'GitHub',      href: 'https://github.com/...', external: true },
]

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
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-label="Dividend Dashboard" style={{ flexShrink: 0 }}>
            <rect x="2" y="10" width="3" height="8" rx="1" fill="#009991" opacity="0.7"/>
            <rect x="7" y="6" width="3" height="12" rx="1" fill="#009991" opacity="0.85"/>
            <rect x="12" y="3" width="3" height="15" rx="1" fill="#009991"/>
            <path d="M3.5 9.5 L8.5 5.5 L13.5 2.5" stroke="#22c55e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 12, color: '#2d4055', fontWeight: 500 }}>
            Dividend Dashboard
          </span>
        </div>

        {/* Center: Links (leer bis Links hinzugefügt werden) */}
        {FOOTER_LINKS.length > 0 && (
          <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {FOOTER_LINKS.map((link, i) => (
              link.external
                ? (
                  <a
                    key={i}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#3d5266', textDecoration: 'none' }}
                  >
                    {link.label}
                  </a>
                ) : (
                  <button
                    key={i}
                    onClick={() => onNavigate?.(link.href)}
                    style={{
                      background: 'none', border: 'none',
                      fontSize: 12, color: '#3d5266',
                      cursor: 'pointer', padding: 0,
                    }}
                  >
                    {link.label}
                  </button>
                )
            ))}
          </nav>
        )}

        {/* Right: Roadmap link + copyright */}
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
