import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import PortfolioDashboard from '../components/PortfolioDashboard.jsx'
import AssetAllocationDonut from '../components/AssetAllocationDonut.jsx'
import AssetHoldingDonut from '../components/AssetHoldingDonut.jsx'

export default function SharedPortfolioView({ sharedToken }) {
    const [sharedData, setSharedData] = useState(null)
    const [sharedLoading, setSharedLoading] = useState(true)
    const [sharedTab, setSharedTab] = useState('overview')

    useEffect(() => {
        async function loadShared() {
            const { data } = await supabase
                .from('shared_portfolios')
                .select('portfolio_data')
                .eq('share_token', sharedToken)
                .single()

            if (data) {
                setSharedData(data.portfolio_data)
            }
            setSharedLoading(false)
        }
        loadShared()
    }, [sharedToken])

    if (sharedLoading) {
        return (
            <div style={{ minHeight: '100vh', background: '#0f1420', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e0e6f0' }}>
                Geteiltes Portfolio wird geladen…
            </div>
        )
    }

    if (!sharedData) {
        return <div style={{ color: '#fff', textAlign: 'center', padding: 50 }}>Portfolio nicht gefunden oder Link abgelaufen.</div>
    }

    return (
        <div style={{ minHeight: '100vh', background: '#0f1420', color: '#c8d4e0', padding: 20 }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                {/* Header mit Tabs für Bestände & Allokation */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, background: '#161b27', padding: '16px 20px', borderRadius: 16, border: '1px solid #1e2a3a', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h2 style={{ fontSize: 18, color: '#f1f5f9', margin: 0 }}>📊 Anonymes Portfolio</h2>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Read-Only Ansicht</p>
                    </div>

                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }}>
                            <button
                                onClick={() => setSharedTab('overview')}
                                style={{
                                    background: sharedTab === 'overview' ? '#009991' : 'transparent',
                                    color: sharedTab === 'overview' ? '#ffffff' : '#64748b',
                                    border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12,
                                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                💼 Bestände
                            </button>
                            <button
                                onClick={() => setSharedTab('assets')}
                                style={{
                                    background: sharedTab === 'assets' ? '#009991' : 'transparent',
                                    color: sharedTab === 'assets' ? '#ffffff' : '#64748b',
                                    border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12,
                                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                🍰 Allokation (Pie)
                            </button>
                        </div>

                        <a href="/public" style={{ background: '#1e3a5f', color: '#93c5fd', padding: '8px 14px', borderRadius: 8, fontSize: 12, textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Eigenes Dashboard
                        </a>
                    </div>
                </div>

                {/* Inhalt je nach gewähltem Tab */}
                {sharedTab === 'overview' ? (
                    <PortfolioDashboard
                        currentValue={sharedData.currentValue}
                        forecast12m={{ net: sharedData.kpi?.['all']?.net || 0 }}
                        holdings={sharedData.holdings || []}
                        byHolding={sharedData.byHolding || {}}
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <AssetHoldingDonut holdings={sharedData.holdings || []} />
                        <AssetAllocationDonut holdings={sharedData.holdings || []} currentValue={sharedData.currentValue || 0} />
                    </div>
                )}
            </div>
        </div>
    )
}