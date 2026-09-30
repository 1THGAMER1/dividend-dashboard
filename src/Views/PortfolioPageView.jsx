import React from 'react'
import PortfolioDashboard from '../components/PortfolioDashboard.jsx'
import AssetAllocationDonut from '../components/AssetAllocationDonut.jsx'
import AssetHoldingDonut from '../components/AssetHoldingDonut.jsx'

export default function PortfolioPageView({
                                              page,
                                              currentValue,
                                              enrichedHoldings,
                                              holdings,
                                              byHolding
                                          }) {
    const activeHoldings = enrichedHoldings || holdings

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
                        byHolding={byHolding}
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
                        <AssetHoldingDonut holdings={activeHoldings} />
                        <AssetAllocationDonut holdings={activeHoldings} />
                    </div>
                </>
            )}
        </div>
    )
}