import React, { useState } from 'react'
import { isLoggedIn, startOAuthFlow } from '../auth'
import AddActivityModal from './AddActivityModal.jsx'

export default function EmptyStateView({ onRefresh, loading, error }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const parqetConnected = isLoggedIn()

  return (
      <div style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '30px 16px',
      }}>
        <div style={{
          maxWidth: 520,
          width: '100%',
          background: '#161b27',
          border: '1px solid #1e2a3a',
          borderRadius: 20,
          padding: 'clamp(28px, 4vw, 40px) clamp(20px, 3vw, 32px)',
          textAlign: 'center',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
        }}>

          {/* Icon */}
          <div style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            background: 'rgba(0, 153, 145, 0.12)',
            border: '1px solid rgba(0, 153, 145, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
            fontSize: 30,
          }}>
            💰
          </div>

          {/* Titel */}
          <h2 style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#f1f5f9',
            margin: '0 0 10px 0',
          }}>
            Noch keine Dividendendaten
          </h2>

          {/* Beschreibung */}
          <p style={{
            fontSize: 14,
            color: '#7a8ba0',
            lineHeight: 1.6,
            margin: '0 auto 24px auto',
            maxWidth: 400,
          }}>
            {parqetConnected
                ? 'Dein Parqet-Portfolio ist verbunden, enthält aber für diesen Zeitraum noch keine verbuchten Dividendenzahlungen.'
                : 'In deiner persönlichen Datenbank sind noch keine Dividenden erfasst. Du kannst deine Buchungen manuell pflegen oder Parqet für automatische Importe verknüpfen.'}
          </p>

          {/* Fehleranzeige (falls tatsächlich ein technischer Fehler vorliegt) */}
          {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
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

          {/* Aktions-Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {/* 1. Manuelle Aktivität anlegen */}
            <button
                onClick={() => setShowAddModal(true)}
                style={{
                  width: '100%',
                  background: '#009991',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 18px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'background 0.2s',
                }}
            >
              <span>➕</span>
              <span>Dividende / Aktivität manuell erfassen</span>
            </button>

            {/* 2. Wenn Parqet noch nicht verknüpft ist: Verknüpfen-Button */}
            {!parqetConnected && (
                <button
                    onClick={startOAuthFlow}
                    style={{
                      width: '100%',
                      background: '#0f1420',
                      color: '#38bdf8',
                      border: '1px solid #2a3a50',
                      borderRadius: 10,
                      padding: '11px 18px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'border-color 0.2s',
                    }}
                    onMouseOver={e => e.currentTarget.style.borderColor = '#38bdf8'}
                    onMouseOut={e => e.currentTarget.style.borderColor = '#2a3a50'}
                >
                  <span>🔗</span>
                  <span>Mit Parqet verknüpfen</span>
                </button>
            )}

            {/* 3. Wenn Parqet verknüpft ist: Aktualisieren-Button */}
            {parqetConnected && onRefresh && (
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    style={{
                      width: '100%',
                      background: '#0f1420',
                      color: '#93c5fd',
                      border: '1px solid #2a3a50',
                      borderRadius: 10,
                      padding: '11px 18px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                >
                  {loading ? '⟳ Wird geladen…' : '↻ Daten von Parqet aktualisieren'}
                </button>
            )}
          </div>

          {/* Nützliche Tipps / Info-Box */}
          <div style={{
            background: '#0f1420',
            border: '1px solid #1e2a3a',
            borderRadius: 12,
            padding: '14px 18px',
            textAlign: 'left',
          }}>
            <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0', fontWeight: 700 }}>
              Hinweise
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#94a3b8' }}>
                <span>💡</span>
                <span>Dividenden werden automatisch berücksichtigt, sobald die Zahlungen in deinen Aktivitäten gebucht sind.</span>
              </div>
              {parqetConnected && (
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#94a3b8' }}>
                    <span>🔄</span>
                    <span>Neue Abrechnungen aus deinem Broker synchronisierst du per Klick auf „Aktualisieren“.</span>
                  </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal zum manuellen Hinzufügen von Aktivitäten */}
        <AddActivityModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onSuccess={() => {
              setShowAddModal(false)
              onRefresh?.()
            }}
        />
      </div>
  )
}