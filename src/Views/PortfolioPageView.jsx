import React, { useState } from 'react'
import PortfolioDashboard from '../components/PortfolioDashboard.jsx'
import AssetAllocationDonut from '../components/AssetAllocationDonut.jsx'
import AssetHoldingDonut from '../components/AssetHoldingDonut.jsx'
import EtfUploadWidget from "../components/EtfUploadWidget.jsx"
import HoldingDetailModal from "../components/HoldingDetailModal.jsx"
import StockDetailView from './StockDetailView.jsx'
import ActivitiesView from './ActivitiesView.jsx'

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
    const activeHoldings = enrichedHoldings || holdings
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
            {page === 'portfolio-overview' && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>💼 Portfolio Bestände</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Echtzeit-Depotwerte & Positionen</p>
                    </div>

                    <PortfolioDashboard
                        currentValue={currentValue}
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