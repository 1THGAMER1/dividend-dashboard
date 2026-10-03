import React from 'react'
import UpcomingDividends from "../components/UpcomingDividends.jsx";
import DividendCalendar from "../components/DividendCalendar.jsx";
import DividendCalculator from '../pages/DividendCalculator'
import DripSimulator from '../pages/DripSimulator'
import EmptyStateView from "./EmptyStateView.jsx";

export default function DividendsPageView({
                                              page,
                                              portfolioData,
                                              forecastByHolding,
                                              byHolding,
                                              monthly,
                                              loadData,
                                              loading,
                                              error
                                          }) {
    if (page === 'calculator') return <DividendCalculator portfolioData={portfolioData} />
    if (page === 'drip')       return <DripSimulator portfolioData={portfolioData} />

    if (page === 'calendar') {
        return (
            <div>
                <div style={{ marginBottom: 16 }}>
                    <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>🗓 Kalender & Nächste Zahlungen</h1>
                    <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 4 }}>Prognose basierend auf Vorjahresdaten</p>
                </div>
                {Object.keys(monthly || {}).length === 0 ? (
                    <EmptyStateView onRefresh={loadData} loading={loading} error={error} />
                ) : (
                    <>
                        <UpcomingDividends forecastByHolding={forecastByHolding} byHolding={byHolding} days={90} />
                        <DividendCalendar forecastByHolding={forecastByHolding} byHolding={byHolding} monthly={monthly} />
                    </>
                )}
            </div>
        )
    }

    return null
}