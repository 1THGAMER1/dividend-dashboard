import React, { useEffect, useMemo, useState } from 'react'
import PortfolioDashboard from '../components/PortfolioDashboard.jsx'
import AssetAllocationDonut from '../components/AssetAllocationDonut.jsx'
import AssetHoldingDonut from '../components/AssetHoldingDonut.jsx'
import EtfUploadWidget from "../components/EtfUploadWidget.jsx"
import HoldingDetailModal from "../components/HoldingDetailModal.jsx"
import StockDetailView from './StockDetailView.jsx'
import ActivitiesView from './ActivitiesView.jsx'
import { fetchAllDbActivities } from '../utils/manualActivities'
import { fetchCurrentPrice, fetchHoldingHistory } from '../api.js'

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
    const [manualPrices, setManualPrices] = useState({})
    const [manualHistories, setManualHistories] = useState({})

    useEffect(() => {
        if (!['portfolio-overview', 'portfolio-assets', 'portfolio-xray'].includes(page) ||
            dbLoaded ||
            (enrichedHoldings?.length || holdings?.length)) return

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

    useEffect(() => {
        if (dbActivities.length === 0) return

        const keys = [...new Set(
            dbActivities
                .filter(activity => ['buy', 'transfer_in'].includes(String(activity.type || '').toLowerCase()))
                .map(activity => activity.isin || activity.name)
                .filter(Boolean)
        )]
        let cancelled = false
        Promise.all(keys.map(async key => [key, await fetchCurrentPrice(key)]))
            .then(entries => {
                if (!cancelled) setManualPrices(Object.fromEntries(entries.filter(([, price]) => price > 0)))
            })
            .catch(error => console.warn('Manuelle Kurse konnten nicht geladen werden:', error.message))

        return () => { cancelled = true }
    }, [dbActivities])

    useEffect(() => {
        if (dbActivities.length === 0) return

        const keys = [...new Set(
            dbActivities
                .filter(activity => ['buy', 'transfer_in'].includes(String(activity.type || '').toLowerCase()))
                .map(activity => activity.isin || activity.name)
                .filter(Boolean)
        )]
        let cancelled = false
        Promise.all(keys.map(async key => [key, await fetchHoldingHistory(key)]))
            .then(entries => {
                if (!cancelled) {
                    setManualHistories(Object.fromEntries(
                        entries.filter(([, result]) => result?.history?.length > 0)
                    ))
                }
            })
            .catch(error => console.warn('Historische Kurse konnten nicht geladen werden:', error.message))

        return () => { cancelled = true }
    }, [dbActivities])

    const manualHoldings = useMemo(() => {
        const result = {}
        const chronological = dbActivities
            .slice()
            .sort((a, b) => new Date(a.date || a.datetime || 0) - new Date(b.date || b.datetime || 0))

        chronological.forEach(activity => {
            const type = String(activity.type || '').toLowerCase()
            const key = String(activity.isin || activity.name || 'Unbekannt').trim().toUpperCase()
            const shares = Number(activity.shares) || 0
            const amount = Number(activity.amount ?? activity.amountNet) || 0
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
                const averageCost = item.shares > 0 ? item.costValue / item.shares : 0
                const soldCost = averageCost * sold
                item.shares = Math.max(0, item.shares - sold)
                item.costValue = Math.max(0, item.costValue - soldCost)
                if (type === 'sell') item.realizedGain += amount - soldCost
            } else if (type === 'dividend') {
                item.dividends += Number(activity.amountNet ?? amount) || 0
            }
        })

        return Object.values(result).map(item => {
            const price = Number(manualPrices[item.isin]) || Number(manualPrices[item.name]) || 0
            const value = price > 0 ? item.shares * price : item.costValue
            return {
            ...item,
            shares: +item.shares.toFixed(6),
            value: +value.toFixed(2),
            costValue: +item.costValue.toFixed(2),
            realizedGain: +item.realizedGain.toFixed(2),
            dividends: +item.dividends.toFixed(2),
            }
        }).filter(item => item.shares > 0.000001 || item.dividends > 0 || item.realizedGain !== 0)
    }, [dbActivities, manualPrices])

    const manualMode = !enrichedHoldings?.length && !holdings?.length
    const activeHoldings = enrichedHoldings?.length ? enrichedHoldings : holdings?.length ? holdings : manualHoldings
    const manualTradeActivities = useMemo(() => dbActivities
        .filter(activity => ['buy', 'sell'].includes(String(activity.type || '').toLowerCase()))
        .map(activity => ({
            ...activity,
            _type: String(activity.type).toUpperCase(),
            datetime: activity.datetime || activity.date,
            amount: Number(activity.amount ?? activity.amountNet) || 0,
            asset: {
                ...(activity.asset || {}),
                isin: activity.isin || activity.asset?.isin,
                symbol: activity.isin || activity.asset?.symbol,
                name: activity.name || activity.asset?.name,
            },
        })), [dbActivities])
    const effectiveBuyActs = manualMode
        ? manualTradeActivities.filter(activity => activity._type === 'BUY')
        : buyActs
    const effectiveSellActs = manualMode
        ? manualTradeActivities.filter(activity => activity._type === 'SELL')
        : sellActs
    const manualValue = activeHoldings.reduce((sum, item) => sum + (Number(item.value) || 0), 0)
    const displayValue = manualMode
        ? manualValue
        : (currentValue > 0 ? currentValue : manualValue)
    const manualPerformanceSeries = useMemo(() => {
        if (dbActivities.length === 0 || Object.keys(manualHistories).length === 0) return []

        const activitiesByDate = dbActivities
            .map(activity => ({
                ...activity,
                date: new Date(activity.date || activity.datetime || 0),
            }))
            .filter(activity => !Number.isNaN(activity.date.getTime()))
            .sort((a, b) => a.date - b.date)
        const firstDate = activitiesByDate[0]?.date
        if (!firstDate) return []

        const priceRows = Object.entries(manualHistories).map(([rawKey, result]) => ({
            key: String(rawKey).trim().toUpperCase(),
            rows: (result.history || [])
                .map(row => ({ date: String(row.d).slice(0, 10), close: Number(row.close) || 0 }))
                .filter(row => row.close > 0)
                .sort((a, b) => a.date.localeCompare(b.date)),
        })).filter(item => item.rows.length > 0)
        if (priceRows.length === 0) return []

        const dates = [...new Set(priceRows.flatMap(item => item.rows.map(row => row.date))
            .filter(date => date >= firstDate.toISOString().slice(0, 10)))]
        const balances = {}
        const priceIndexes = Object.fromEntries(priceRows.map(item => [item.key, 0]))
        let activityIndex = 0
        let cash = 0
        let invested = 0
        const series = []

        dates.forEach(date => {
            const dayEnd = new Date(`${date}T23:59:59.999Z`)
            while (activityIndex < activitiesByDate.length && activitiesByDate[activityIndex].date <= dayEnd) {
                const activity = activitiesByDate[activityIndex++]
                const type = String(activity.type || '').toLowerCase()
                const key = String(activity.isin || activity.name || 'Unbekannt').trim().toUpperCase()
                const shares = Number(activity.shares) || 0
                const amount = Number(activity.amount ?? activity.amountNet) || 0
                const position = (balances[key] ||= { shares: 0, cost: 0 })

                if (type === 'buy') {
                    position.shares += shares
                    position.cost += amount
                    cash -= amount
                    invested += amount
                } else if (type === 'transfer_in') {
                    position.shares += shares
                    position.cost += amount
                    invested += Math.max(0, amount)
                } else if (type === 'sell' || type === 'transfer_out') {
                    const sold = Math.min(shares, position.shares)
                    const averageCost = position.shares > 0 ? position.cost / position.shares : 0
                    position.shares -= sold
                    position.cost = Math.max(0, position.cost - averageCost * sold)
                    if (type === 'sell') cash += amount
                } else if (type === 'dividend' || type === 'interest') {
                    cash += Number(activity.amountNet ?? amount) || 0
                } else if (type === 'deposit') {
                    cash += amount
                    invested += amount
                } else if (type === 'withdrawal') {
                    cash -= amount
                    invested = Math.max(0, invested - amount)
                }
            }

            let marketValue = 0
            priceRows.forEach(({ key, rows }) => {
                const position = balances[key]
                if (!position || position.shares <= 0) return
                while (priceIndexes[key] + 1 < rows.length && rows[priceIndexes[key] + 1].date <= date) {
                    priceIndexes[key] += 1
                }
                const close = rows[priceIndexes[key]]?.close || 0
                marketValue += position.shares * close
            })
            const value = marketValue + cash
            series.push({ d: `${date}T12:00:00.000Z`, v: +value.toFixed(2), c: +invested.toFixed(2) })
        })

        return series.filter(point => point.v > 0 || point.c > 0)
    }, [dbActivities, manualHistories])
    const effectivePerformanceSeries = manualMode
        ? manualPerformanceSeries
        : (performanceSeries?.length ? performanceSeries : manualPerformanceSeries)
    const [selectedHolding, setSelectedHolding] = useState(null)
    const [fullDetailStock, setFullDetailStock] = useState(null)

    // Wenn der Nutzer im Modal auf "Vollansicht ↗" geklickt hat:
    if (fullDetailStock) {
        return (
            <StockDetailView
                stock={fullDetailStock}
                onBack={() => setFullDetailStock(null)}
                allHoldings={activeHoldings}
                buyActs={effectiveBuyActs}
                sellActs={effectiveSellActs}
                byHolding={byHolding}
                totalPortfolioValue={displayValue}
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
                        performanceSeries={effectivePerformanceSeries}
                        buyActs={effectiveBuyActs}
                        sellActs={effectiveSellActs}
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
                    currentValue={displayValue}
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
                    buyActs={effectiveBuyActs}
                    sellActs={effectiveSellActs}
                    byHolding={byHolding}
                    forecastByHolding={forecastByHolding}
                    range="MAX"
                    totalPortfolioValue={displayValue}
                    onOpenFullDetail={(item) => {
                        setSelectedHolding(null)
                        setFullDetailStock(item)
                    }}
                />
            )}
        </div>
    )
}