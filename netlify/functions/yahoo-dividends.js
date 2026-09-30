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
        let symbol = event.queryStringParameters?.symbol || event.queryStringParameters?.ticker;

        if (!symbol) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Symbol parameter is required' })
            };
        }

        // --- AUTOMATISCHER ISIN-ZU-TICKER-FALLBACK ---
        const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/;
        if (ISIN_REGEX.test(symbol)) {
            try {
                const searchRes = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const searchData = await searchRes.json();
                if (searchData.quotes && searchData.quotes.length > 0) {
                    symbol = searchData.quotes[0].symbol;
                }
            } catch (e) {
                console.warn('ISIN-Suche in Netlify-Function fehlgeschlagen:', e.message);
            }
        }
        // ---------------------------------------------

        if (!/^[A-Za-z0-9.-]+$/.test(symbol)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid symbol format' })
            };
        }

        const range = event.queryStringParameters?.range || '5y';
        const interval = event.queryStringParameters?.interval || '1mo';
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=div`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
        const meta = result.meta;
        const events = result.events;

        let marketPrice = meta.regularMarketPrice;
        let currency = meta.currency || 'EUR';

        // USD zu EUR Umrechnung falls nötig
        if (currency === 'USD') {
            try {
                const fxRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d', {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                const fxData = await fxRes.json();
                const eurUsdRate = fxData.chart?.result?.[0]?.meta?.regularMarketPrice;
                if (eurUsdRate && eurUsdRate > 0) {
                    marketPrice = marketPrice / eurUsdRate;
                    currency = 'EUR';
                }
            } catch (e) {
                console.warn('Wechselkurs-Abfrage fehlgeschlagen:', e.message);
            }
        }

        let dividends = [];
        if (events && events.dividends) {
            dividends = Object.values(events.dividends).map(div => ({
                amount: div.amount,
                date: new Date(div.date * 1000).toISOString().split('T')[0],
                timestamp: div.date
            })).sort((a, b) => b.timestamp - a.timestamp);
        }

        const yearlyTotals = {};
        dividends.forEach(div => {
            const year = new Date(div.timestamp * 1000).getFullYear();
            yearlyTotals[year] = (yearlyTotals[year] || 0) + div.amount;
        });

        const responseData = {
            symbol: meta.symbol,
            resolvedTicker: symbol,
            currency: currency,
            instrumentType: meta.instrumentType,
            regularMarketPrice: marketPrice,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
            dividends: dividends,
            yearlyTotals: yearlyTotals,
            totalDividendsCount: dividends.length,
            lastDividend: dividends.length > 0 ? dividends[0] : null
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        console.error('Error in yahoo-dividends function:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to fetch dividend data',
                details: error.message
            })
        };
    }
};