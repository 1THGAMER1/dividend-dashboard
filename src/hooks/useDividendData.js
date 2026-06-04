import { useState, useEffect, useCallback } from 'react'
import { handleCallback, isLoggedIn } from '../auth'
import { groupByYearMonth, toCumulative, buildForecast, groupByHolding } from '../dataUtils'
import { fetchDividendActivities, fetchBuyActivities, calcKpiFromActivities, fetchHoldingNames, fetchPurchaseValue, fetchPurchaseValuePerHolding, fetchCurrentValue } from '../api'
import { readCache, writeCache } from '../cache'

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
    // Zeigt an ob die Daten aus dem Cache kommen und wann der Cache abläuft
    const [cacheInfo,   setCacheInfo]   = useState(null) // { cachedAt: Date } | null

    useEffect(() => {
        if (window.location.pathname !== '/callback') return
        setAuthLoading(true)
        handleCallback()
            .then(() => { setLoggedIn(true);    setAuthLoading(false) })
            .catch(e  => { setError(e.message); setAuthLoading(false) })
    }, [])

    /** Setzt alle State-Variablen aus einem fertigen Datensatz */
    const applyData = useCallback(({ m, c, fc, bh, kpiAll, kpiYtd, kpi12m, purchaseValue, currentVal }) => {
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
    }, [])

    /**
     * Holt Daten von Parqet (ignoriert Cache).
     * Schreibt Ergebnis anschließend in den Cache.
     */
    const fetchFromParqet = useCallback(async () => {
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

        const dataset = { m, c, fc, bh, kpiAll, kpiYtd, kpi12m, purchaseValue, currentVal }

        // In Cache schreiben (fire & forget — Fehler blockieren nicht den UI-Fluss)
        writeCache(dataset).catch(err => console.warn('Cache-Schreiben fehlgeschlagen:', err))

        return dataset
    }, [])

    /**
     * Haupt-Ladefunktion.
     * @param {boolean} forceRefresh  true = Cache ignorieren, direkt Parqet anfragen
     */
    const loadData = useCallback(async (forceRefresh = false) => {
        if (!isLoggedIn()) return
        setLoading(true); setError(null)
        try {
            // 1. Cache prüfen (außer bei erzwungenem Refresh)
            if (!forceRefresh) {
                const cached = await readCache()
                if (cached) {
                    applyData(cached.payload)
                    setLastUpdated(cached.cachedAt)
                    setDataSource('cache')
                    setCacheInfo({ cachedAt: cached.cachedAt })
                    setLoading(false)
                    return
                }
            }

            // 2. Frisch von Parqet holen
            const dataset = await fetchFromParqet()
            applyData(dataset)
            setLastUpdated(new Date())
            setDataSource('live')
            setCacheInfo(null)
        } catch (e) {
            setError(e.message)
            setDataSource(null)
        } finally { setLoading(false) }
    }, [applyData, fetchFromParqet])

    // Beim Login einmalig laden
    useEffect(() => { if (loggedIn) loadData() }, [loggedIn, loadData])
    // Kein automatisches 5-Minuten-Interval mehr — wird durch Cache unnötig

    return {
        loggedIn, setLoggedIn,
        monthly, cum,
        forecastCum, forecastMonthly,
        byHolding, forecastByHolding,
        kpi, dividendYield,
        currentValue,
        loading, authLoading,
        lastUpdated, dataSource, error,
        cacheInfo,
        loadData: () => loadData(true), // Manueller Refresh = immer frisch
    }
}
