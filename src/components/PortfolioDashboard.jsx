import React from 'react'
import KpiCard from './KpiCard.jsx'

const fmt = n =>
    new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR'
    }).format(n || 0)

export default function PortfolioDashboard({
                                               currentValue,
                                               currentVal,
                                               forecast12m,
                                               holdings = []
                                           }) {
    // Fallback für den Marktwert, falls die API "currentVal" statt "currentValue" nutzt
    const displayValue = currentValue ?? currentVal ?? 0;

    // Macht sicherheitshalber aus jedem Input (String oder Number) eine echte Zahl
    const getShares = (item) => parseFloat(item.shares) || 0;

    // Filtert mit einer sehr niedrigen Grenze (1e-6), um auch kleinste Krypto-Bruchteile als "Aktiv" zu erkennen
    const activeHoldings = holdings
        .filter(item => getShares(item) > 0.000001)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

    // Alles was exakt 0 ist (oder darunter liegt), wandert in die Verkauft-Tabelle
    const soldHoldings = holdings
        .filter(item => getShares(item) <= 0.000001)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    // Fallback-Logik für Namen
    const getDisplayName = (item) => {
        // Da wir die neue Tabelle nutzen, ist item.name bereits "Bitcoin", "Solana" etc.
        return item.name || item.isin || 'Unbekanntes Asset';
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* KPI KARTEN */}
            <div className="kpi-grid">
                <KpiCard
                    label="Portfolio Marktwert"
                    value={displayValue > 0 ? fmt(displayValue) : '--- €'}
                    color="#60a5fa"
                    sub="Aktueller Gesamtwert"
                />
                <KpiCard
                    label="Aktive Positionen"
                    value={activeHoldings.length.toString()}
                    color="#a78bfa"
                    sub="Alle Assets im Depot (inkl. Krypto)"
                />
                <KpiCard
                    label="Progn. Jahresausschüttung"
                    value={fmt(forecast12m?.net ?? 0)}
                    color="#22c55e"
                    sub="Nächste 12 Monate Netto"
                />
            </div>

            {/* 1. TABELLE: AKTIVE BESTÄNDE */}
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, overflowX: 'auto' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#f1f5f9' }}>
                    💼 Aktive Bestände
                </h3>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                    <thead>
                    <tr style={{ borderBottom: '1px solid #1e2a3a', color: '#64748b', fontSize: 12 }}>
                        <th style={{ paddingBottom: 10 }}>Asset</th>
                        <th style={{ paddingBottom: 10 }}>Typ</th>
                        <th style={{ paddingBottom: 10 }}>Anteile</th>
                        <th style={{ paddingBottom: 10}}>Einstandswert</th>
                        <th style={{ paddingBottom: 10}}>Position</th>
                        <th style={{ paddingBottom: 10, textAlign: 'right' }}>Kursgewinn in %</th>
                    </tr>
                    </thead>
                    <tbody>
                    {activeHoldings.length === 0 ? (
                        <tr>
                            <td colSpan={4} style={{ padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                                Keine aktiven Bestände gefunden.
                            </td>
                        </tr>
                    ) : (
                        activeHoldings.map((item, idx) => {
                            const sharesNum = getShares(item);

                            return (
                                <tr key={item.isin || idx} style={{ borderBottom: '1px solid #0f1420' }}>
                                    <td style={{ padding: '12px 0', fontWeight: 500, color: '#e2e8f0' }}>
                                        <div>{getDisplayName(item)}</div>
                                        {item.isin && item.isin !== item.name && (
                                            <div style={{ fontSize: 11, color: '#64748b' }}>{item.isin}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 0' }}>
                      <span style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#38bdf8', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>
                        {item.type || 'N/A'}
                      </span>
                                    </td>
                                    <td style={{ padding: '12px 0', color: '#94a3b8' }}>
                                        {/* Erlaubt bis zu 8 Nachkommastellen für Kryptowährungen */}
                                        {sharesNum > 0
                                            ? sharesNum.toLocaleString('de-DE', { maximumFractionDigits: 8 })
                                            : '—'}
                                    </td>
                                    <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#f1f5f9' }}>
                                        {(item.value ?? 0) > 0 ? fmt(item.costValue) : '---'}
                                    </td>
                                    <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#f1f5f9' }}>
                                        {(item.value ?? 0) > 0 ? fmt(item.value) : '---'}
                                    </td>
                                </tr>
                            )
                        })
                    )}
                    </tbody>
                </table>
            </div>

            {/* 2. TABELLE: VERKAUFTE POSITIONEN */}
            {soldHoldings.length > 0 && (
                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, overflowX: 'auto', opacity: 0.8 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#94a3b8' }}>
                        📦 Verkaufte & Historische Positionen
                    </h3>

                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead>
                        <tr style={{ borderBottom: '1px solid #1e2a3a', color: '#64748b', fontSize: 12 }}>
                            <th style={{ paddingBottom: 10 }}>Asset</th>
                            <th style={{ paddingBottom: 10 }}>Typ</th>
                            <th style={{ paddingBottom: 10, textAlign: 'right' }}>Erlös / Status</th>
                            <span style={{ marginLeft: 8, fontSize: 12, background: '#1e2a3a', color: '#94a3b8', padding: '1px 6px', borderRadius: 4, fontStyle: 'normal' }}>Beta</span>
                        </tr>
                        </thead>
                        <tbody>
                        {soldHoldings.map((item, idx) => (
                            <tr key={item.isin || idx} style={{ borderBottom: '1px solid #161b27' }}>
                                <td style={{ padding: '12px 0', fontWeight: 500, color: '#94a3b8' }}>
                                    <div>{getDisplayName(item)}</div>
                                    {item.isin && !item.isin.startsWith('hld_') && item.isin !== item.name && (
                                        <div style={{ fontSize: 11, color: '#556070' }}>{item.isin}</div>
                                    )}
                                </td>
                                <td style={{ padding: '12px 0' }}>
                    <span style={{ background: '#161b27', border: '1px solid #1e2a3a', color: '#64748b', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>
                      {item.type || 'Aktie'}
                    </span>
                                </td>
                                {/* HIER ZEIGEN WIR JETZT DEN BERECHNETEN WERT ODER DEN FALLBACK */}
                                <td style={{ padding: '12px 0', textAlign: 'right', color: '#64748b', fontStyle: 'italic' }}>
                                    <span>Position geschlossen</span>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

        </div>
    )
}