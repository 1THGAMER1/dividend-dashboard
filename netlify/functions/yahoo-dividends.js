// Globaler Cache für das Yahoo-Sitzungsticket (überlebt mehrere Aufrufe)
let cachedCookie = null;
let cachedCrumb = null;
let crumbExpiry = 0;

async function getYahooAuth() {
    if (cachedCookie && cachedCrumb && Date.now() < crumbExpiry) {
        return { cookie: cachedCookie, crumb: cachedCrumb };
    }

    try {
        // 1. Session-Cookie von Yahoo anfordern
        const cookieRes = await fetch('https://fc.yahoo.com', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        const setCookie = cookieRes.headers.get('set-cookie');
        if (!setCookie) return null;

        const cookie = setCookie.split(';')[0];

        // 2. Passenden Crumb-Schlüssel abholen
        const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Cookie': cookie
            }
        });

        if (!crumbRes.ok) return null;
        const crumb = await crumbRes.text();
        if (!crumb || crumb.includes('<html') || crumb.length > 60) return null;

        cachedCookie = cookie;
        cachedCrumb = crumb.trim();
        crumbExpiry = Date.now() + 3600 * 1000; // 1 Stunde zwischenspeichern

        return { cookie: cachedCookie, crumb: cachedCrumb };
    } catch (err) {
        console.warn('Yahoo Auth fehlgeschlagen:', err.message);
        return null;
    }
}

export const handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const searchQuery = event.queryStringParameters?.q || event.queryStringParameters?.search;
        if (searchQuery) {
            try {
                const searchRes = await fetch(
                    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchQuery)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`,
                    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
                );
                if (!searchRes.ok) throw new Error('Yahoo Search HTTP ' + searchRes.status);
                const searchData = await searchRes.json();
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ quotes: searchData.quotes || [] })
                };
            } catch (err) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: err.message, quotes: [] })
                };
            }
        }

        let symbol = event.queryStringParameters?.symbol || event.queryStringParameters?.ticker;

        if (!symbol) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Symbol parameter is required' })
            };
        }

        const ISIN_MAPPING = {
            'JE00B588CD74': 'SGBS.MI',
        };

        if (ISIN_MAPPING[symbol]) {
            symbol = ISIN_MAPPING[symbol];
        } else {
            const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/;
            if (ISIN_REGEX.test(symbol)) {
                try {
                    const searchRes = await fetch(
                        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}`,
                        {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }
                        }
                    );

                    if (searchRes.ok) {
                        const searchData = await searchRes.json();
                        if (searchData.quotes && searchData.quotes.length > 0) {
                            const quotes = searchData.quotes;
                            const validQuotes = quotes.filter(q => {
                                const type = (q.quoteType || '').toUpperCase();
                                return type === 'ETF' || type === 'EQUITY' || type === 'MUTUALFUND';
                            });

                            let bestMatch = validQuotes.find(q =>
                                q.symbol?.endsWith('.DE') ||
                                q.symbol?.endsWith('.F') ||
                                q.symbol?.endsWith('.PA') ||
                                q.symbol?.endsWith('.AS')
                            );

                            if (!bestMatch && validQuotes.length > 0) bestMatch = validQuotes[0];
                            if (!bestMatch) bestMatch = quotes[0];
                            if (bestMatch?.symbol) symbol = bestMatch.symbol;
                        }
                    }
                } catch (e) {
                    console.warn('ISIN-Suche fehlgeschlagen:', e.message);
                }
            }
        }

        if (!/^[A-Za-z0-9.-]+$/.test(symbol)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid symbol format' })
            };
        }

        const range = event.queryStringParameters?.range || 'max';
        const interval = event.queryStringParameters?.interval || '1mo';

        const chartUrl =
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
            `?range=${encodeURIComponent(range)}` +
            `&interval=${encodeURIComponent(interval)}` +
            '&events=div%7Csplit';

        const response = await fetch(chartUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Yahoo Finance API returned status ${response.status}`);
        }

        const data = await response.json();
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'No data found for this symbol' })
            };
        }

        const result = data.chart.result[0];
        const meta = result.meta || {};
        const events = result.events || {};

        let marketPrice = meta.regularMarketPrice ?? null;
        let currency = (meta.currency || 'EUR').toUpperCase();

        let dividends = [];
        if (events.dividends) {
            dividends = Object.values(events.dividends)
                .map(div => ({
                    amount: Number(div.amount) || 0,
                    date: new Date(div.date * 1000).toISOString().split('T')[0],
                    timestamp: div.date
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
        }

        const splits = Object.values(events.splits || {})
            .map(split => {
                let ratio = null;
                const numerator = Number(split.numerator);
                const denominator = Number(split.denominator);
                if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
                    ratio = numerator / denominator;
                } else if (typeof split.splitRatio === 'string') {
                    const match = split.splitRatio.match(/([\d.]+)\s*:\s*([\d.]+)/);
                    if (match && Number(match[2]) !== 0) {
                        ratio = Number(match[1]) / Number(match[2]);
                    }
                }
                return {
                    date: split.date ? new Date(split.date * 1000).toISOString().split('T')[0] : null,
                    ratio
                };
            })
            .filter(split => split.date && Number.isFinite(split.ratio) && split.ratio > 0 && split.ratio !== 1)
            .sort((a, b) => a.date.localeCompare(b.date));

        // Kurshistorie
        let history = [];
        const timestamps = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];
        history = timestamps
            .map((t, i) => ({ d: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }))
            .filter(p => p.close != null && Number.isFinite(p.close));

        // ── FUNDAMENTALDATEN MIT AUTH-CRUMB ABFRAGEN ─────────────────────────
        let fundamentals = {
            peRatio: meta.trailingPE ?? null,
            forwardPE: meta.forwardPE ?? null,
            marketCap: meta.marketCap ?? null,
            dividendYield: null,
            payoutRatio: null,
            beta: null,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
            previousClose: meta.chartPreviousClose ?? null,
            sector: null,
            industry: null,
            summary: null,
        };

        const wantDetails = event.queryStringParameters?.details === '1';
        if (wantDetails) {
            const auth = await getYahooAuth();
            if (auth) {
                try {
                    const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,assetProfile&crumb=${encodeURIComponent(auth.crumb)}`;
                    const sumRes = await fetch(summaryUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'Cookie': auth.cookie,
                            'Accept': 'application/json'
                        }
                    });

                    if (sumRes.ok) {
                        const sumData = await sumRes.json();
                        const qRes = sumData?.quoteSummary?.result?.[0] || {};
                        const sd = qRes.summaryDetail || {};
                        const ks = qRes.defaultKeyStatistics || {};
                        const ap = qRes.assetProfile || {};

                        fundamentals = {
                            peRatio: sd.trailingPE?.raw ?? fundamentals.peRatio,
                            forwardPE: sd.forwardPE?.raw ?? fundamentals.forwardPE,
                            marketCap: sd.marketCap?.raw ?? fundamentals.marketCap,
                            dividendYield: sd.dividendYield?.raw ?? null,
                            payoutRatio: sd.payoutRatio?.raw ?? null,
                            beta: sd.beta?.raw ?? ks.beta?.raw ?? null,
                            fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh?.raw ?? fundamentals.fiftyTwoWeekHigh,
                            fiftyTwoWeekLow: sd.fiftyTwoWeekLow?.raw ?? fundamentals.fiftyTwoWeekLow,
                            previousClose: sd.previousClose?.raw ?? fundamentals.previousClose,
                            sector: ap.sector || null,
                            industry: ap.industry || null,
                            summary: ap.longBusinessSummary || null,
                        };
                    }
                } catch (err) {
                    console.warn('QuoteSummary Abruf fehlgeschlagen:', err.message);
                }
            }

            // Fallback: Dividendenrendite aus den letzten 12 Monaten berechnen, falls noch null
            if (fundamentals.dividendYield == null && marketPrice) {
                const oneYearAgo = (Date.now() / 1000) - (365 * 86400);
                const last12mDivs = dividends.filter(d => d.timestamp >= oneYearAgo).reduce((s, d) => s + d.amount, 0);
                if (last12mDivs > 0) {
                    fundamentals.dividendYield = last12mDivs / marketPrice;
                }
            }
        }

        // Jahresdividenden berechnen
        const yearlyTotals = {};
        dividends.forEach(div => {
            const year = new Date(div.timestamp * 1000).getFullYear();
            yearlyTotals[year] = (yearlyTotals[year] || 0) + div.amount;
        });

        // Währungsumrechnung
        if (currency !== 'EUR') {
            try {
                const fxSymbol = currency === 'USD' ? 'EURUSD=X' : `${currency}EUR=X`;
                const fxUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fxSymbol)}?range=1d&interval=1d`;
                const fxRes = await fetch(fxUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                if (fxRes.ok) {
                    const fxData = await fxRes.json();
                    const fxRate = fxData.chart?.result?.[0]?.meta?.regularMarketPrice;
                    if (fxRate && fxRate > 0) {
                        const conversionRate = currency === 'USD' ? 1 / fxRate : fxRate;
                        if (marketPrice != null) marketPrice *= conversionRate;
                        dividends = dividends.map(div => ({ ...div, amount: div.amount * conversionRate }));
                        history = history.map(p => ({ ...p, close: p.close * conversionRate }));
                        for (const year of Object.keys(yearlyTotals)) yearlyTotals[year] *= conversionRate;
                        if (fundamentals.marketCap) fundamentals.marketCap *= conversionRate;
                        if (fundamentals.fiftyTwoWeekHigh) fundamentals.fiftyTwoWeekHigh *= conversionRate;
                        if (fundamentals.fiftyTwoWeekLow) fundamentals.fiftyTwoWeekLow *= conversionRate;
                        if (fundamentals.previousClose) fundamentals.previousClose *= conversionRate;
                        currency = 'EUR';
                    }
                }
            } catch (e) {
                console.warn(`FX-Umrechnung für ${currency} fehlgeschlagen:`, e.message);
            }
        }

        const responseData = {
            symbol: meta.symbol || symbol,
            resolvedTicker: symbol,
            currency,
            instrumentType: meta.instrumentType,
            regularMarketPrice: marketPrice,
            fiftyTwoWeekHigh: fundamentals.fiftyTwoWeekHigh ?? meta.fiftyTwoWeekHigh ?? null,
            fiftyTwoWeekLow: fundamentals.fiftyTwoWeekLow ?? meta.fiftyTwoWeekLow ?? null,
            previousClose: fundamentals.previousClose ?? meta.chartPreviousClose ?? null,
            dividends,
            splits,
            history,
            yearlyTotals,
            fundamentals,
            totalDividendsCount: dividends.length,
            lastDividend: dividends.length > 0 ? dividends[0] : null
        };

        return { statusCode: 200, headers, body: JSON.stringify(responseData) };
    } catch (error) {
        console.error('Error in yahoo-dividends function:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch dividend data', details: error.message })
        };
    }
};