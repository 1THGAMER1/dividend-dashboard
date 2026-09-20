import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export default function useDividendData() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [monthly, setMonthly] = useState({})
  const [cum, setCum] = useState({})
  const [forecastCum, setForecastCum] = useState({})
  const [forecastMonthly, setForecastMonthly] = useState({})
  const [byHolding, setByHolding] = useState({})
  const [forecastByHolding, setForecastByHolding] = useState({})
  const [holdings, setHoldings] = useState([])
  const [kpi, setKpi] = useState({})
  const [dividendYield, setDividendYield] = useState({})
  const [currentValue, setCurrentValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [dataSource, setDataSource] = useState('cache')
  const [error, setError] = useState(null)

  const processParqetData = (data) => {
    if (!data) return

    if (data.totalValue || data.currentValue) {
      setCurrentValue(data.totalValue || data.currentValue)
    }

    if (Array.isArray(data.holdings)) {
      setHoldings(data.holdings)
    } else if (Array.isArray(data.positions)) {
      setHoldings(data.positions)
    } else {
      setHoldings([])
    }

    if (data.monthly) setMonthly(data.monthly)
    if (data.cum) setCum(data.cum)
    if (data.forecastCum) setForecastCum(data.forecastCum)
    if (data.forecastMonthly) setForecastMonthly(data.forecastMonthly)
    if (data.byHolding) setByHolding(data.byHolding)
    if (data.forecastByHolding) setForecastByHolding(data.forecastByHolding)
    if (data.kpi) setKpi(data.kpi)
    if (data.dividendYield) setDividendYield(data.dividendYield)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user

      if (!user) {
        setLoggedIn(false)
        setLoading(false)
        setAuthLoading(false)
        return
      }

      setLoggedIn(true)
      setAuthLoading(false)

      const { data, error: cacheErr } = await supabase
        .from('parqet_cache')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cacheErr) throw cacheErr

      if (data?.data) {
        processParqetData(data.data)
        if (data.updated_at) {
          setLastUpdated(new Date(data.updated_at))
        }
        setDataSource('cache')
      } else {
        setDataSource('empty')
      }
    } catch (err) {
      console.error('Fehler beim Laden der Daten:', err)
      setError(err.message)
      setDataSource('error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  return {
    loggedIn,
    monthly,
    cum,
    forecastCum,
    forecastMonthly,
    byHolding,
    forecastByHolding,
    holdings,
    kpi,
    dividendYield,
    currentValue,
    loading,
    authLoading,
    lastUpdated,
    dataSource,
    error,
    loadData,
  }
}
