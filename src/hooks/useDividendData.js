import { useState, useEffect, useCallback } from 'react'
import { handleCallback, isLoggedIn } from '../auth'
import { groupByYearMonth, toCumulative, buildForecast, groupByHolding } from '../dataUtils'
import {
    fetchDividendActivities,
    fetchBuyActivities,
    fetchSellActivities,
    calcKpiFromActivities,
    fetchHoldingNames,
    fetchPurchaseValue,
    fetchPurchaseValuePerHolding,
    fetchCurrentValue,
    fetchYahooDividendsForHoldings,
} from '../api'
import { readCache, writeCache, readStaleCache } from '../cache'

const NO_DIVIDEND_TYPES = new Set(['crypto', 'cryptocurrency'])

export default function useDividendData() {
    const [loggedIn,          setLoggedIn]          = useState(isLoggedIn())
    const [monthly,           setMonthly]           = useState({})
    const [cum,               setCum]               = useState({})
    const [forecastCum,       setForecastCum]       = useState({})
    const [forecastMonthly,   setForecastMonthly]   = useState({})
    const [byHolding,         setByHolding]         = useState({})
    const [forecastByHolding, setForecastByHolding] = useState({})
    const [dividendYield,     setDividendYield]     = useState({ all: 0, ytd: 0, '12m': 0 })
    const [buyActs,           setBuyActs]           = useState([])
    const [holdings,          setHoldings]          = useState([])
    const [kpi,               setKpi]               = useState({
        all:   { net:0, gross:0, tax:0, avgMonthly:0 },
        ytd:   { net:0, gross:0, tax:0, avgMonthly:0 },
        '12m': { net:0, gross:0, tax:0, avgMonthly:0 },
    })
    const [loading,       setLoading]       = useState(false)
    const [authLoading,   setAuthLoading]   = useState(false)
    const [lastUpdated,   setLastUpdated]   = useState(null)
    const [dataSource,    setDataSource]    = useState(null)
    const [error,         setError]         = useState(null)
    const [currentValue,  setCurrentValue]  = useState(0)
    const [cacheInfo,     setCacheInfo]     = useState(null)

    useEffect(() => {
        if (window.location.pathname !== '/callback') return
        setAuthLoading(true)
        handleCallback()
            .then(() => { setLoggedIn(true);    setAuthLoading(false) })
            .catch(e  => { setError(e.message); setAuthLoading(false) })
    }, [])

   const applyData = useCallback((payload) => {
        const { m, c, fc, bh = {}, kpiAll, kpiYtd, kpi12m, purchaseValue, currentVal, buyActsData = [], sellActsData = [], names = {}, types = {}, tickers = {}, purchaseValuePerHolding = [] } = payload;
        
        setMonthly(m);
        setCum(c);
        setCurrentValue(currentVal);
        setForecastCum(fc.cum);
        setForecastMonthly(fc.monthly);
        setByHolding(bh);
        setForecastByHolding(fc.forecastByHolding);
        setBuyActs(buyActsData ?? []);
        setKpi({ all: kpiAll, ytd: kpiYtd, '12m': kpi12m });
        setDividendYield({
            all:   purchaseValue > 0 ? +((kpiAll.net / purchaseValue) * 100).toFixed(2) : 0,
            ytd:   purchaseValue > 0 ? +((kpiYtd.net / purchaseValue) * 100).toFixed(2) : 0,
            '12m': purchaseValue > 0 ? +((kpi12m.net / purchaseValue) * 100).toFixed(2) : 0,
        });

        // 1. DYNAMISCHES LEXIKON AUFBAUEN (Verknüpft hld_ IDs automatisch mit Tickersymbolen & Namen)
        const idMap = {};

        // A) Aus purchaseValuePerHolding Daten extrahieren
        const phArray = Array.isArray(purchaseValuePerHolding) ? purchaseValuePerHolding : Object.values(purchaseValuePerHolding || {});
        phArray.forEach(item => {
            const hId = item.holdingId || item.id;
            const symbol = item.asset?.ticker || item.asset?.isin || item.ticker || item.isin;
            const assetName = item.asset?.name || item.name;
            const assetType = item.asset?.assetType || item.type;
            if (hId && symbol) {
                idMap[hId] = { isin: symbol, name: assetName || symbol, type: assetType || 'security' };
            }
        });

        // B) Aus allen Kauf- und Verkaufsaktivitäten ergänzen
        [...(buyActsData || []), ...(sellActsData || [])].forEach(act => {
            const hId = act.holdingId;
            const symbol = act.asset?.ticker || act.asset?.isin;
            if (hId && symbol && !idMap[hId]) {
                idMap[hId] = { isin: symbol, name: symbol, type: act.holdingAssetType || 'security' };
            }
        });

        // Hilfsfunktion zum Auflösen der korrekten ID/ISIN für den Tracker
        const resolveId = (act) => {
            const rawId = act.asset?.ticker || act.asset?.isin || act.holdingId;
            if (idMap[rawId]) return idMap[rawId].isin;
            if (act.holdingId && idMap[act.holdingId]) return idMap[act.holdingId].isin;
            return rawId;
        };

        const tracker = {};

        // 2. KÄUFE VERARBEITEN
        (buyActsData || []).forEach(act => {
            const isin = resolveId(act);
            if (!isin) return;
            if (!tracker[isin]) tracker[isin] = { shares: 0, val: 0, soldValue: 0, realizedGains: 0 };
            
            tracker[isin].shares += parseFloat(String(act.shares || act.quantity || 0).replace(',', '.')) || 0;
            tracker[isin].val += parseFloat(String(act.amount || act.total || 0).replace(',', '.')) || 0;
        });

        // 3. VERKÄUFE VERARBEITEN & GEWINNE BERECHNEN
        (sellActsData || []).forEach(act => {
            const isin = resolveId(act);
            if (!isin) return;
            if (!tracker[isin]) tracker[isin] = { shares: 0, val: 0, soldValue: 0, realizedGains: 0 };
            
            const soldShares = parseFloat(String(act.shares || act.quantity || 0).replace(',', '.')) || 0;
            if (tracker[isin].shares > 0) {
                const avgPrice = tracker[isin].val / tracker[isin].shares;
                tracker[isin].shares = Math.max(0, tracker[isin].shares - soldShares);
                tracker[isin].val = Math.max(0, tracker[isin].shares * avgPrice);
            }

            tracker[isin].soldValue += parseFloat(String(act.amountNet || act.amount || 0).replace(',', '.')) || 0;
            tracker[isin].realizedGains += parseFloat(String(act.realizedGainsNet || act.realizedGains || 0).replace(',', '.')) || 0;
        });

        // 4. DASHBOARD LISTE ZUSAMMENBAUEN
        const allKeys = Array.from(new Set([
            ...Object.keys(names),
            ...Object.keys(tracker),
            ...Object.values(idMap).map(x => x.isin)
        ]));

        const list = allKeys.map(key => {
            const mapped = idMap[key] || Object.values(idMap).find(x => x.isin === key);
            
            const isin = tickers[key] || mapped?.isin || key;
            const name = names[key] || mapped?.name || key;
            const type = types[key] || mapped?.type || 'Wertpapier';

            let shares = tracker[key]?.shares || tracker[isin]?.shares || 0;
            let val = tracker[key]?.val || tracker[isin]?.val || 0;
            let soldValue = tracker[key]?.soldValue || tracker[isin]?.soldValue || 0;
            let realizedGains = tracker[key]?.realizedGains || tracker[isin]?.realizedGains || 0;

            return {
                id: key,
                name,
                isin,
                type,
                shares: shares > 0.0001 ? shares : 0,
                value: shares > 0.0001 ? val : 0,
                soldValue,
                realizedGains
            };
        });

        // Doppelte Einträge bereinigen
        const uniqueList = Array.from(new Map(list.map(item => [item.isin, item])).values());

        setHoldings(uniqueList);
    }, []);
    
    const fetchFromParqet = useCallback(async () => {
        const [acts, buyActsData, sellActsData, holdingData, purchaseValue, purchaseValuePerHolding, currentVal] = await Promise.all([
            fetchDividendActivities(),
            fetchBuyActivities(),
            fetchSellActivities(),
            fetchHoldingNames(),
            fetchPurchaseValue(),
            fetchPurchaseValuePerHolding(),
            fetchCurrentValue(),
        ])

        const { names, types, tickers } = holdingData

        const yahooByIsin = await fetchYahooDividendsForHoldings(tickers, types)

        const m  = groupByYearMonth(acts)
        const c  = toCumulative(m)
        const fc = buildForecast(c, acts, buyActsData, names, yahooByIsin, sellActsData)
        const bh = groupByHolding(acts, names, types, purchaseValuePerHolding, tickers)

        const kpiAll = calcKpiFromActivities(acts, 'all')
        const kpiYtd = calcKpiFromActivities(acts, 'ytd')
        const kpi12m = calcKpiFromActivities(acts, '12m')

        const dataset = {
            m, c, fc, bh,
            kpiAll, kpiYtd, kpi12m,
            purchaseValue, currentVal,
            buyActsData,
            sellActsData,
            rawActs: acts,
            names,
            types,
            tickers,
            purchaseValuePerHolding,
            yahooByIsin,
        }
        writeCache(dataset).catch(err => console.warn('Cache-Schreiben fehlgeschlagen:', err))
        return dataset
    }, [])

    const refreshYahooForCached = useCallback(async (cached) => {
        const payload      = cached.payload
        const tickers      = payload.tickers      || {}
        const types        = payload.types        || {}
        const rawActs      = payload.rawActs      || []
        const buyActs      = payload.buyActsData  || []
        const sellActs     = payload.sellActsData || []
        const names        = payload.names        || {}

        if (Object.keys(tickers).length === 0) return
        if (rawActs.length === 0) return

        try {
            const yahooByIsin = await fetchYahooDividendsForHoldings(tickers, types)

            const fc = buildForecast(payload.c, rawActs, buyActs, names, yahooByIsin, sellActs)
            setForecastCum(fc.cum)
            setForecastMonthly(fc.monthly)
            setForecastByHolding(fc.forecastByHolding)

            const updated = { ...payload, fc, yahooByIsin }
            writeCache(updated).catch(err => console.warn('Yahoo-Cache-Update fehlgeschlagen:', err))
        } catch (e) {
            console.warn('Yahoo-Refresh aus Cache fehlgeschlagen:', e.message)
        }
    }, [])

    const loadData = useCallback(async (forceRefresh = false) => {
        if (!isLoggedIn()) return
        setLoading(true); setError(null)
        try {
            if (!forceRefresh) {
                const cached = await readCache()
                if (cached) {
                    applyData(cached.payload)
                    setLastUpdated(cached.cachedAt)
                    setDataSource('cache')
                    setCacheInfo({ cachedAt: cached.cachedAt })
                    setLoading(false)

                    const hasRawActs = (cached.payload.rawActs?.length ?? 0) > 0

                    const cachedTypes   = cached.payload.types   || {}
                    const cachedTickers = cached.payload.tickers  || {}
                    const nonCryptoIsins = Object.keys(cachedTickers).filter(isin => {
                        const t = (cachedTypes[isin] || '').toLowerCase()
                        return !NO_DIVIDEND_TYPES.has(t)
                    })
                    const yahooCount    = Object.keys(cached.payload.yahooByIsin || {}).length
                    const expectedCount = nonCryptoIsins.length

                    const coverageOk = expectedCount === 0 || (yahooCount / expectedCount) >= 0.5
                    const needsYahooRefresh = !hasRawActs || !coverageOk

                    if (needsYahooRefresh) {
                        refreshYahooForCached(cached).catch(() => {})
                    }
                    return
                }
            }

            try {
                const dataset = await fetchFromParqet()
                applyData(dataset)
                setLastUpdated(new Date())
                setDataSource('live')
                setCacheInfo(null)
                setError(null)
            } catch (apiErr) {
                const isRateLimit = apiErr.message?.includes('429')
                if (isRateLimit) {
                    const stale = await readStaleCache()
                    if (stale) {
                        applyData(stale.payload)
                        setLastUpdated(stale.cachedAt)
                        setDataSource('stale')
                        setCacheInfo({ cachedAt: stale.cachedAt })
                        setError(
                            `⚠️ Parqet Rate-Limit aktiv — Daten vom ${stale.cachedAt.toLocaleString('de-DE')} werden angezeigt. Bitte später erneut aktualisieren.`
                        )
                    } else {
                        setError('Rate-Limit aktiv und kein Cache verfügbar. Bitte später versuchen.')
                        setDataSource(null)
                    }
                } else {
                    throw apiErr
                }
            }
        } catch (e) {
            setError(e.message)
            setDataSource(null)
        } finally { setLoading(false) }
    }, [applyData, fetchFromParqet, refreshYahooForCached])

    useEffect(() => { if (loggedIn) loadData() }, [loggedIn, loadData])

    return {
        loggedIn, setLoggedIn,
        monthly, cum,
        forecastCum, forecastMonthly,
        byHolding, forecastByHolding,
        kpi, dividendYield,
        currentValue,
        buyActs,
        holdings, // <--- Exportiert das korrekte Holdings-Array
        loading, authLoading,
        lastUpdated, dataSource, error,
        cacheInfo,
        loadData: () => loadData(true),
    }
}
