import { useState, useEffect, useCallback } from 'react'
import { handleCallback, isLoggedIn } from '../auth'
import { groupByYearMonth, toCumulative, buildForecast, groupByHolding } from '../dataUtils'
import { fetchDividendActivities, fetchBuyActivities, calcKpiFromActivities, fetchHoldingNames, fetchPurchaseValue, fetchPurchaseValuePerHolding, fetchCurrentValue} from '../api'

export default function useDividendData() {
    const [loggedIn,          setLoggedIn]          = useState(isLoggedIn())
    const [monthly,           setMonthly]           = useState({})
    const [cum,               setCum]               = useState({})
    const [forecastCum,       setForecastCum]       = useState({})
    const [forecastMonthly,   setForecastMonthly]   = useState({})
    const [byHolding,         setByHolding]         = useState({})
    const [forecastByHolding, setForecastByHolding] = useState({})
    const [dividendYield,     setDividendYield]     = useState({ all: 0, ytd: 0, '12m': 0 })
    const [kpi,               setKpi]               = useState({
        all:   { net:0, gross:0, tax:0, avgMonthly:0 },
        ytd:   { net:0, gross:0, tax:0, avgMonthly:0 },
        '12m': { net:0, gross:0, tax:0, avgMonthly:0 },
    })
    const [loading,     setLoading]     = useState(false)
    const [authLoading, setAuthLoading] = useState(false)
    const [lastUpdated, setLastUpdated] = useState(null)
    const [dataSource,  setDataSource]  = useState(null)
    const [error,       setError]       = useState(null)
    const [currentValue, setCurrentValue] = useState(0)

    useEffect(() => {
        if (window.location.pathname !== '/callback') return
        setAuthLoading(true)
        handleCallback()
            .then(() => { setLoggedIn(true);    setAuthLoading(false) })
            .catch(e  => { setError(e.message); setAuthLoading(false) })
    }, [])

    const loadData = useCallback(async () => {
        if (!isLoggedIn()) return
        setLoading(true); setError(null)
        try {
            const [acts, buyActs, holdingData, purchaseValue, purchaseValuePerHolding, currentVal] = await Promise.all([
                fetchDividendActivities(),
                fetchBuyActivities(),
                fetchHoldingNames(),
                fetchPurchaseValue(),
                fetchPurchaseValuePerHolding(),
                fetchCurrentValue(),
            ])
            const { names, types, tickers } = holdingData

            const m  = groupByYearMonth(acts)
            const c  = toCumulative(m)
            const fc = buildForecast(c, acts, buyActs)
            const bh = groupByHolding(acts, names, types, purchaseValuePerHolding, tickers)

            const kpiAll = calcKpiFromActivities(acts, 'all')
            const kpiYtd = calcKpiFromActivities(acts, 'ytd')
            const kpi12m = calcKpiFromActivities(acts, '12m')

            setMonthly(m)
            setCum(c)
            setCurrentValue(currentVal)
            setForecastCum(fc.cum)
            setForecastMonthly(fc.monthly)
            setByHolding(bh)
            setForecastByHolding(fc.forecastByHolding)
            setKpi({ all: kpiAll, ytd: kpiYtd, '12m': kpi12m })
            setDividendYield({
                all:   purchaseValue > 0 ? +((kpiAll.net / purchaseValue) * 100).toFixed(2) : 0,
                ytd:   purchaseValue > 0 ? +((kpiYtd.net / purchaseValue) * 100).toFixed(2) : 0,
                '12m': purchaseValue > 0 ? +((kpi12m.net / purchaseValue) * 100).toFixed(2) : 0,
            })
            setLastUpdated(new Date())
            setDataSource('live')
        } catch (e) {
            setError(e.message)
            setDataSource(null)
        } finally { setLoading(false) }
    }, [])


    useEffect(() => { if (loggedIn) loadData() }, [loggedIn, loadData])
    useEffect(() => {
        if (!loggedIn) return
        const id = setInterval(loadData, 5 * 60 * 1000)
        return () => clearInterval(id)
    }, [loggedIn, loadData])

    return {
        loggedIn, setLoggedIn,
        monthly, cum,
        forecastCum, forecastMonthly,
        byHolding, forecastByHolding,
        kpi, dividendYield,
        currentValue,
        loading, authLoading,
        lastUpdated, dataSource, error,
        loadData,
    }
}