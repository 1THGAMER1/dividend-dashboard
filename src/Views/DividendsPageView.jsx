import React, { useEffect, useMemo, useState } from 'react'
import UpcomingDividends from "../components/UpcomingDividends.jsx"
import DividendCalendar from "../components/DividendCalendar.jsx"
import DividendCalculator from '../pages/DividendCalculator'
import DripSimulator from '../pages/DripSimulator'
import EmptyStateView from "./EmptyStateView.jsx"
import { fetchAllDbActivities } from '../utils/manualActivities'

export default function DividendsPageView({
                                              page,
                                              portfolioData,
                                              forecastByHolding,
                                              byHolding,
                                              monthly,
                                              loadData,
                                              loading,
                                              error,
                                              activities = []
                                          }) {
    const [dbActivities, setDbActivities] = useState([])
    const [dbLoading, setDbLoading] = useState(false)

    useEffect(() => {
        if (page !== 'calendar' || Object.keys(monthly || {}).length > 0 || activities.length > 0) return

        let cancelled = false
        setDbLoading(true)
        fetchAllDbActivities()
            .then(data => {
                if (!cancelled) setDbActivities(data || [])
            })
            .catch(fetchError => {
                if (!cancelled) console.warn('Kalenderdaten aus Supabase konnten nicht geladen werden:', fetchError.message)
            })
            .finally(() => {
                if (!cancelled) setDbLoading(false)
            })

        return () => { cancelled = true }
    }, [page, monthly, activities])

    const effectiveActivities = activities.length > 0 ? activities : dbActivities

    const hasDividendData = useMemo(() => {
        const hasMonthly = Boolean(monthly && Object.keys(monthly).length > 0)
        if (hasMonthly) return true

        const hasManualDivs = Array.isArray(effectiveActivities) && effectiveActivities.some(a =>
            String(a.type).toLowerCase() === 'dividend' && (Number(a.amount) > 0 || Number(a.amountNet) > 0)
        )
        return hasManualDivs
    }, [monthly, effectiveActivities])

    const safePortfolioData = useMemo(() => {
        if (portfolioData && portfolioData.currentValue > 0) {
            return portfolioData
        }

        let totalVal = portfolioData?.currentValue || 0
        let totalDivs = portfolioData?.totalDividendsNet || 0

        if (byHolding && Object.keys(byHolding).length > 0) {
            Object.values(byHolding).forEach(h => {
                totalVal += (Number(h.currentValue) || Number(h.value) || 0)
                totalDivs += (Number(h.totalNet) || Number(h.total) || 0)
            })
        }

        const divYield = totalVal > 0 ? (totalDivs / totalVal) : (portfolioData?.dividendYield || 0.03)

        return {
            currentValue: totalVal,
            totalDividendsNet: totalDivs,
            dividendYield: divYield,
            forecastDividendYield: portfolioData?.forecastDividendYield || divYield,
            cagrTotal: portfolioData?.cagrTotal || 0,
        }
    }, [portfolioData, byHolding])

    if (page === 'calculator') return <DividendCalculator portfolioData={safePortfolioData} />
    if (page === 'drip')       return <DripSimulator portfolioData={safePortfolioData} />

    if (page === 'calendar') {
        return (
            <div>
                <div style={{ marginBottom: 16 }}>
                    <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0', margin: 0 }}>
                        🗓 Kalender & Nächste Zahlungen
                    </h1>
                    <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 4 }}>
                        Prognose basierend auf deinen Vorjahresdaten und Ausschüttungsterminen
                    </p>
                </div>

                {!hasDividendData && (loading || dbLoading) ? (
                    <div style={{ color: '#7a8ba0', fontSize: 13, padding: 20 }}>
                        Lade Kalenderdaten aus Supabase…
                    </div>
                ) : !hasDividendData ? (
                    <EmptyStateView onRefresh={loadData} loading={loading} error={error} />
                ) : (
                    <>
                        <UpcomingDividends
                            forecastByHolding={forecastByHolding || {}}
                            byHolding={byHolding || {}}
                            days={90}
                        />
                        <DividendCalendar
                            forecastByHolding={forecastByHolding || {}}
                            byHolding={byHolding || {}}
                            monthly={monthly || {}}
                            activities={effectiveActivities}
                        />
                    </>
                )}
            </div>
        )
    }

    return null
}