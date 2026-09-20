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

        // 1. DYNAMISCHES ÜBERSETZUNGS-LEXIKON BAUEN
        const idDictionary = {};
        
        const addToDict = (holdingId, assetObj) => {
            if (!holdingId || !assetObj) return;
            if (!idDictionary[holdingId]) idDictionary[holdingId] = {};
            
            if (assetObj.ticker && !idDictionary[holdingId].isin) idDictionary[holdingId].isin = assetObj.ticker;
            if (assetObj.isin && !idDictionary[holdingId].isin) idDictionary[holdingId].isin = assetObj.isin;
            if (assetObj.name && !idDictionary[holdingId].name) idDictionary[holdingId].name = assetObj.name;
            if (assetObj.assetType && !idDictionary[holdingId].type) idDictionary[holdingId].type = assetObj.assetType;
        };

        // Alle Arrays scannen, um jede Erwähnung der holdingId abzufangen
        const allActivities = [...(buyActsData || []), ...(sellActsData || []), ...(payload.rawActs || [])];
        allActivities.forEach(act => addToDict(act.holdingId, act.asset));

        const holdingsArray = Array.isArray(purchaseValuePerHolding) ? purchaseValuePerHolding : Object.values(purchaseValuePerHolding || {});
        holdingsArray.forEach(pos => addToDict(pos.holdingId, pos.asset || pos));

        Object.entries(bh || {}).forEach(([key, val]) => addToDict(key, val));

        // 2. KÄUFE UND VERKÄUFE BERECHNEN
        const tracker = {};

        const getAssetId = (act) => {
            let id = act.asset?.ticker || act.asset?.isin;
            if (!id && act.holdingId) {
                id = idDictionary[act.holdingId]?.isin;
            }
            return id || act.holdingId;
        };

        (buyActsData || []).forEach(act => {
            const isin = getAssetId(act);
            if (!isin) return;
            
            if (!tracker[isin]) tracker[isin] = { shares: 0, val: 0, soldValue: 0, realizedGains: 0 };
            
            tracker[isin].shares += parseFloat(String(act.shares || act.quantity || 0).replace(',', '.')) || 0;
            tracker[isin].val += parseFloat(String(act.amount || act.total || 0).replace(',', '.')) || 0;
        });

        (sellActsData || []).forEach(act => {
            const isin = getAssetId(act);
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

        // 3. DASHBOARD LISTE ZUSAMMENBAUEN
        const allIds = Array.from(new Set([...Object.keys(names), ...Object.keys(tracker)]));

        const list = allIds.map(rawId => {
            const dict = idDictionary[rawId] || Object.values(idDictionary).find(x => x.isin === rawId) || {};
            
            const isin = tickers[rawId] || dict.isin || rawId; 
            const name = names[rawId] || dict.name || rawId;
            const isCrypto = ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA'].includes(isin) || (types[rawId] || dict.type || '').toLowerCase().includes('crypto');
            const type = types[rawId] || dict.type || (isCrypto ? 'crypto' : 'Wertpapier');

            let shares = tracker[rawId] ? tracker[rawId].shares : (tracker[isin] ? tracker[isin].shares : 0);
            let val = tracker[rawId] ? tracker[rawId].val : (tracker[isin] ? tracker[isin].val : 0);
            
            let soldValue = tracker[rawId] ? tracker[rawId].soldValue : (tracker[isin] ? tracker[isin].soldValue : 0);
            let realizedGains = tracker[rawId] ? tracker[rawId].realizedGains : (tracker[isin] ? tracker[isin].realizedGains : 0);

            // Letzter Krypto-Fallback, falls Tracker leer blieb, aber byHolding Daten hat
            if (shares === 0 && isCrypto) {
                const cryptoData = bh[rawId] || Object.values(bh).find(x => x.ticker === isin || x.name === name) || {};
                const fallbackShares = parseFloat(String(cryptoData.shares || cryptoData.amount || '0').replace(',', '.')) || 0;
                if (fallbackShares > 0) {
                    shares = fallbackShares;
                    val = parseFloat(String(cryptoData.value || cryptoData.totalValue || cryptoData.purchaseValue || '0').replace(',', '.')) || 0;
                }
            }

            return {
                id: rawId,
                name,
                isin,
                type,
                shares: shares > 0.0001 ? shares : 0, 
                value: shares > 0.0001 ? val : 0,
                soldValue,
                realizedGains
            };
        });

        // Doppelte Einträge durch unterschiedliche ID-Typen (z.B. hld_ und Ticker) bereinigen
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
