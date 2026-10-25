import React, { useState } from 'react'
import { isLoggedIn, startOAuthFlow } from '../auth'
import { syncParqetToSupabase } from '../utils/manualActivities'
import AddActivityModal from '../components/AddActivityModal.jsx'

export default function EmptyStateView({ onRefresh, loading, error }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(null)

  const parqetConnected = isLoggedIn()

  // Direkter Sync aus dem Empty-State heraus
  const handleDirectSync = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      await syncParqetToSupabase()
      if (onRefresh) await onRefresh()
    } catch (err) {
      setSyncError('Sync fehlgeschlagen: ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

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
            maxWidth: 420,
          }}>
            {parqetConnected
                ? 'Dein Parqet-Konto ist verbunden. Du kannst deine Buchungen jetzt mit 1 Klick in deine eigene Supabase-Datenbank übertragen.'
                : 'In deiner persönlichen Datenbank sind noch keine Dividenden erfasst. Du kannst Buchungen manuell anlegen oder dein Parqet-Konto für automatische Importe verknüpfen.'}
          </p>

          {/* Fehlermeldungen */}
          {(error || syncError) && (
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
                ⚠️ {syncError || error}
              </div>
          )}

          {/* Aktions-Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {/* FALL 1: Parqet ist verbunden -> Direkter Sync-Knopf! */}
            {parqetConnected && (
                <button
                    onClick={handleDirectSync}
                    disabled={syncing || loading}
                    style={{
                      width: '100%',
                      background: '#009991',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '12px 18px',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: syncing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                >
                  <span>{syncing ? '⏳' : '⚡'}</span>
                  <span>{syncing ? 'Übertrage Aktivitäten nach Supabase…' : 'Parqet-Daten jetzt in Datenbank importieren'}</span>
                </button>
            )}

            {/* FALL 2: Parqet nicht verbunden -> Verbinden anbieten */}
            {!parqetConnected && (
                <button
                    onClick={startOAuthFlow}
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
                    }}
                >
                  <span>🔗</span>
                  <span>Mit Parqet verbinden & importieren</span>
                </button>
            )}

            {/* Manuelle Buchung immer anbieten */}
            <button
                onClick={() => setShowAddModal(true)}
                style={{
                  width: '100%',
                  background: '#0f1420',
                  color: '#e0e6f0',
                  border: '1px solid #2a3a50',
                  borderRadius: 10,
                  padding: '11px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
            >
              <span>➕</span>
              <span>Aktivität manuell erfassen</span>
            </button>
          </div>

          {/* Infobox */}
          <div style={{
            background: '#0f1420',
            border: '1px solid #1e2a3a',
            borderRadius: 12,
            padding: '14px 18px',
            textAlign: 'left',
          }}>
            <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0', fontWeight: 700 }}>
              Funktionsweise
            </p>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              Alle Transaktionen werden dauerhaft in deiner privaten Datenbank gespeichert. Sobald Aktivitäten vorhanden sind, werden Dividenden, Monatsbalken und Kennzahlen automatisch berechnet.
            </div>
          </div>
        </div>

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