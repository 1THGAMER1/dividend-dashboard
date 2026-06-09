/**
 * EmptyState – wird angezeigt wenn nach dem Laden keine Dividendendaten
 * vorhanden sind (leeres Portfolio, neue Verbindung, API-Fehler).
 */
export default function EmptyState({ onRefresh, loading, error }) {
  return (
    <div style={{
      minHeight: 'calc(100vh - 52px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <div style={{
        maxWidth: 480,
        width: '100%',
        background: '#161b27',
        border: '1px solid #1e2a3a',
        borderRadius: 18,
        padding: '40px 32px',
        textAlign: 'center',
      }}>

        {/* Illustration */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #0f2a3a 0%, #0d1f2d 100%)',
          border: '1px solid #1e2a3a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px auto',
          fontSize: 32,
        }}>
          📭
        </div>

        {/* Titel */}
        <h2 style={{
          fontSize: 20,
          fontWeight: 700,
          color: '#e0e6f0',
          margin: '0 0 10px 0',
          lineHeight: 1.3,
        }}>
          Noch keine Dividendendaten
        </h2>

        {/* Beschreibung */}
        <p style={{
          fontSize: 14,
          color: '#7a8ba0',
          lineHeight: 1.65,
          margin: '0 0 28px 0',
          maxWidth: 340,
          marginInline: 'auto',
        }}>
          Dein Portfolio enthält noch keine abgerechneten Dividenden — oder die Verbindung zu Parqet hat keine Daten zurückgegeben.
        </p>

        {/* Fehleranzeige */}
        {error && (
          <div style={{
            background: '#1a0a0a',
            border: '1px solid #7f1d1d',
            color: '#fca5a5',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 20,
            textAlign: 'left',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Checkliste */}
        <div style={{
          background: '#0f1420',
          border: '1px solid #1e2a3a',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 28,
          textAlign: 'left',
        }}>
          <p style={{ fontSize: 12, color: '#556070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Mögliche Ursachen
          </p>
          {[
            ['📂', 'Das Portfolio hat noch keine Dividendenzahlungen erhalten'],
            ['🔑', 'Der Parqet OAuth-Token ist abgelaufen — bitte neu anmelden'],
            ['🌐', 'Parqet API temporär nicht erreichbar (Rate-Limit / Wartung)'],
            ['⚙️', 'Die Client-ID in den Einstellungen ist nicht korrekt'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
              <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? '#1a2233' : '#009991',
            border: 'none',
            borderRadius: 10,
            color: loading ? '#7a8ba0' : '#fff',
            fontWeight: 700,
            fontSize: 15,
            padding: '13px 0',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            letterSpacing: '0.01em',
          }}
        >
          {loading ? '⟳  Wird geladen…' : '↻  Daten erneut laden'}
        </button>

        <p style={{ fontSize: 12, color: '#3d5266', marginTop: 16 }}>
          Tipp: Stelle sicher dass dein Parqet-Konto Dividenden-Aktivitäten enthält.
        </p>
      </div>
    </div>
  )
}
