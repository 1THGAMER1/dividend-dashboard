import React from 'react'
import PortfolioDashboard from '../components/PortfolioDashboard.jsx'
import AssetAllocationDonut from '../components/AssetAllocationDonut.jsx'
import AssetHoldingDonut from '../components/AssetHoldingDonut.jsx'
import EtfUploadWidget from "../components/EtfUploadWidget.jsx";
import HoldingDetailModal from "../components/HoldingDetailModal.jsx";

export default function PortfolioPageView({
                                              page,
                                              onNavigate,
                                              currentValue,
                                              enrichedHoldings,
                                              holdings,
                                              byHolding,
                                              performanceSeries,
                                              buyActs = [],
                                              sellActs = [],
                                              forecastByHolding = {},
                                          }) {
    const activeHoldings = enrichedHoldings || holdings
    const [selectedHolding, setSelectedHolding] = React.useState(null)

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
                        holdings={enrichedHoldings || holdings}
                        performanceSeries={performanceSeries}
                        buyActs={buyActs}
                        sellActs={sellActs}
                        byHolding={byHolding}
                        forecastByHolding={forecastByHolding}
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
                <EtfUploadWidget holdings={activeHoldings} currentValue={currentValue} onSelectHolding={setSelectedHolding} />
            )}
            {selectedHolding && (
                <HoldingDetailModal
                    holding={selectedHolding}
                    onClose={() => setSelectedHolding(null)}
                    buyActs={buyActs}
                    sellActs={sellActs}
                    byHolding={byHolding}
                    forecastByHolding={forecastByHolding}
                    range="MAX"
                    totalPortfolioValue={currentValue}
                />
            )}
        </div>
    )
}