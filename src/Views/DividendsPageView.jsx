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
        if (!['calendar', 'calculator', 'drip'].includes(page) || Object.keys(monthly || {}).length > 0 || activities.length > 0) return

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

    const manualPortfolioData = useMemo(() => {
        if (effectiveActivities.length === 0) return null

        const shares = {}
        const cost = {}
        const dividends = []
        const annualDividends = {}
        const dividendPerShare = {}

        effectiveActivities
            .slice()
            .sort((a, b) => new Date(a.date || a.datetime || 0) - new Date(b.date || b.datetime || 0))
            .forEach(activity => {
                const type = String(activity.type || '').toLowerCase()
                const key = activity.isin || activity.name || 'Unbekannt'
                const quantity = Number(activity.shares) || 0
                const amount = Number(activity.amountNet ?? activity.amount) || 0

                if (['buy', 'transfer_in'].includes(type)) {
                    shares[key] = (shares[key] || 0) + quantity
                    cost[key] = (cost[key] || 0) + (type === 'buy' ? amount : 0)
                } else if (['sell', 'transfer_out'].includes(type)) {
                    shares[key] = Math.max(0, (shares[key] || 0) - quantity)
                } else if (type === 'dividend') {
                    const date = new Date(activity.date || activity.datetime || 0)
                    if (!Number.isNaN(date.getTime())) {
                        dividends.push({ date, amount })
                        annualDividends[date.getFullYear()] = (annualDividends[date.getFullYear()] || 0) + amount
                        if (quantity > 0) {
                            const month = date.getMonth()
                            dividendPerShare[key] = { ...(dividendPerShare[key] || {}), [month]: amount / quantity }
                        }
                    }
                }
            })

        const now = new Date()
        const currentValue = Object.keys(shares).reduce((sum, key) => sum + (shares[key] || 0) * ((cost[key] || 0) / Math.max(shares[key] || 1, 1)), 0)
        const since = new Date(now.getFullYear(), now.getMonth() - 11, 1)
        const totalDividendsNet = dividends
            .filter(item => item.date >= since)
            .reduce((sum, item) => sum + item.amount, 0)
        let forecastDividend = 0
        for (let offset = 1; offset <= 12; offset++) {
            const month = (now.getMonth() + offset) % 12
            Object.keys(shares).forEach(key => {
                forecastDividend += (dividendPerShare[key]?.[month] || 0) * (shares[key] || 0)
            })
        }

        const dividendYield = currentValue > 0 ? totalDividendsNet / currentValue : 0
        const dividendYears = Object.keys(annualDividends)
            .map(Number)
            .filter(year => annualDividends[year] >= 1)
            .sort((a, b) => a - b)
        let cagrTotal = null
        if (dividendYears.length >= 2) {
            const firstYear = dividendYears[0]
            const lastYear = dividendYears[dividendYears.length - 1]
            const yearSpan = lastYear - firstYear
            if (yearSpan > 0 && annualDividends[firstYear] > 0) {
                cagrTotal = +((Math.pow(
                    annualDividends[lastYear] / annualDividends[firstYear],
                    1 / yearSpan
                ) - 1) * 100).toFixed(1)
            }
        }
        return {
            currentValue,
            totalDividendsNet,
            dividendYield,
            forecastDividendYield: currentValue > 0 ? forecastDividend / currentValue : 0,
            cagrTotal,
        }
    }, [effectiveActivities])

    const safePortfolioData = useMemo(() => {
        if (manualPortfolioData && (!portfolioData || portfolioData.currentValue <= 0)) {
            return manualPortfolioData
        }
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
    }, [portfolioData, byHolding, manualPortfolioData])

    if (page === 'calculator') {
        if (dbLoading) return <div style={{ color: '#7a8ba0', fontSize: 13, padding: 20 }}>Lade Rechnerdaten aus Supabase…</div>
        return <DividendCalculator portfolioData={safePortfolioData} />
    }
    if (page === 'drip') {
        if (dbLoading) return <div style={{ color: '#7a8ba0', fontSize: 13, padding: 20 }}>Lade DRIP-Daten aus Supabase…</div>
        return <DripSimulator portfolioData={safePortfolioData} />
    }

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
                            activities={effectiveActivities}
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