import React, { useEffect, useMemo, useState } from 'react'
import PortfolioDashboard from '../components/PortfolioDashboard.jsx'
import AssetAllocationDonut from '../components/AssetAllocationDonut.jsx'
import AssetHoldingDonut from '../components/AssetHoldingDonut.jsx'
import EtfUploadWidget from "../components/EtfUploadWidget.jsx"
import HoldingDetailModal from "../components/HoldingDetailModal.jsx"
import StockDetailView from './StockDetailView.jsx'
import ActivitiesView from './ActivitiesView.jsx'
import { fetchAllDbActivities } from '../utils/manualActivities'

export default function PortfolioPageView({
                                              page,
                                              onNavigate,
                                              currentValue,
                                              enrichedHoldings,
                                              holdings,
                                              byHolding,
                                              performanceSeries,
                                              activities,
                                              activitiesComplete,
                                              lastUpdated,
                                              onRefreshActivities,
                                              buyActs = [],
                                              sellActs = [],
                                              forecastByHolding = {},
                                          }) {
    const [dbActivities, setDbActivities] = useState([])
    const [dbLoading, setDbLoading] = useState(false)
    const [dbLoaded, setDbLoaded] = useState(false)

    useEffect(() => {
        if (page !== 'portfolio-overview' || dbLoaded || (enrichedHoldings?.length || holdings?.length)) return

        let cancelled = false
        setDbLoading(true)
        fetchAllDbActivities()
            .then(data => {
                if (!cancelled) setDbActivities(data || [])
            })
            .catch(error => {
                if (!cancelled) console.warn('Manuelle Bestände konnten nicht geladen werden:', error.message)
            })
            .finally(() => {
                if (!cancelled) {
                    setDbLoading(false)
                    setDbLoaded(true)
                }
            })

        return () => { cancelled = true }
    }, [page, dbLoaded, enrichedHoldings?.length, holdings?.length])

    const manualHoldings = useMemo(() => {
        const result = {}
        dbActivities.forEach(activity => {
            const type = String(activity.type || '').toLowerCase()
            const key = activity.isin || activity.name || 'Unbekannt'
            const shares = Number(activity.shares) || 0
            const amount = Number(activity.amount) || 0
            const item = (result[key] ||= {
                id: key,
                isin: activity.isin || key,
                name: activity.name || activity.isin || 'Unbekanntes Asset',
                type: activity.assetType || 'Security',
                shares: 0,
                value: 0,
                costValue: 0,
                realizedGain: 0,
                dividends: 0,
            })

            if (type === 'buy' || type === 'transfer_in') {
                item.shares += shares
                if (type === 'buy') item.costValue += amount
            } else if (type === 'sell' || type === 'transfer_out') {
                const sold = Math.min(shares, item.shares)
                item.shares -= sold
                if (item.shares + sold > 0) {
                    item.costValue *= item.shares / (item.shares + sold)
                }
                if (type === 'sell') item.realizedGain += amount
            } else if (type === 'dividend') {
                item.dividends += Number(activity.amountNet ?? amount) || 0
            }
        })

        return Object.values(result).map(item => ({
            ...item,
            shares: +item.shares.toFixed(6),
            value: +item.costValue.toFixed(2),
            costValue: +item.costValue.toFixed(2),
            realizedGain: +item.realizedGain.toFixed(2),
            dividends: +item.dividends.toFixed(2),
        }))
    }, [dbActivities])

    const manualMode = !enrichedHoldings?.length && !holdings?.length
    const activeHoldings = enrichedHoldings?.length ? enrichedHoldings : holdings?.length ? holdings : manualHoldings
    const displayValue = currentValue > 0
        ? currentValue
        : activeHoldings.reduce((sum, item) => sum + (Number(item.value) || 0), 0)
    const [selectedHolding, setSelectedHolding] = useState(null)
    const [fullDetailStock, setFullDetailStock] = useState(null)

    // Wenn der Nutzer im Modal auf "Vollansicht ↗" geklickt hat:
    if (fullDetailStock) {
        return (
            <StockDetailView
                stock={fullDetailStock}
                onBack={() => setFullDetailStock(null)}
                allHoldings={activeHoldings}
                buyActs={buyActs}
                sellActs={sellActs}
                byHolding={byHolding}
                totalPortfolioValue={currentValue}
            />
        )
    }

    return (
        <div>
            {page === 'portfolio-overview' && dbLoading && manualMode ? (
                <div style={{ color: '#7a8ba0', fontSize: 13, padding: 20 }}>Lade Bestände aus Supabase…</div>
            ) : page === 'portfolio-overview' && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>💼 Portfolio Bestände</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Echtzeit-Depotwerte & Positionen</p>
                    </div>

                    <PortfolioDashboard
                        currentValue={displayValue}
                        holdings={activeHoldings}
                        performanceSeries={performanceSeries}
                        buyActs={buyActs}
                        sellActs={sellActs}
                        byHolding={byHolding}
                        forecastByHolding={forecastByHolding}
                        onOpenFullDetail={(item) => setFullDetailStock(item)}
                    />
                </>
            )}

            {page === 'portfolio-assets' && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>🍰 Asset Allokation</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Aufteilung deiner echten Depotwerte nach Klassen</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <AssetHoldingDonut holdings={activeHoldings} onNavigate={onNavigate} />
                        <AssetAllocationDonut holdings={activeHoldings} />
                    </div>
                </>
            )}

            {page === 'portfolio-xray' && (
                <EtfUploadWidget
                    holdings={activeHoldings}
                    currentValue={currentValue}
                    onSelectHolding={setSelectedHolding}
                />
            )}

            {page === 'portfolio-activities' && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>📋 Aktivitäten</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Alle Käufe, Verkäufe, Dividenden und weitere Buchungen</p>
                    </div>
                    <ActivitiesView
                        holdings={holdings}
                        enrichedHoldings={enrichedHoldings}
                        activities={activities}
                        complete={activitiesComplete}
                        lastUpdated={lastUpdated}
                        onRefresh={onRefreshActivities}
                    />
                </>
            )}

            {/* Modal für X-Ray Aufrufe */}
            {selectedHolding && (
                <HoldingDetailModal
                    holding={selectedHolding}
                    onClose={() => setSelectedHolding(null)}
                    allHoldings={activeHoldings}
                    buyActs={buyActs}
                    sellActs={sellActs}
                    byHolding={byHolding}
                    forecastByHolding={forecastByHolding}
                    range="MAX"
                    totalPortfolioValue={currentValue}
                    onOpenFullDetail={(item) => {
                        setSelectedHolding(null)
                        setFullDetailStock(item)
                    }}
                />
            )}
        </div>
    )
}