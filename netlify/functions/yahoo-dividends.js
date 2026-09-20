import fetch from 'node-fetch';

export const handler = async function(event, context) {
    // CORS Header definieren
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handling für Preflight-Requests (OPTIONS)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        const symbol = event.queryStringParameters?.symbol;
        const range = event.queryStringParameters?.range || '5y';
        const interval = event.queryStringParameters?.interval || '1mo';

        if (!symbol) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Symbol parameter is required' })
            };
        }

        // Input-Validierung zum Schutz vor ungültigen Zeichen
        if (!/^[A-Za-z0-9.-]+$/.test(symbol)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid symbol format' })
            };
        }

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
        
        // Prüfen ob Daten vorhanden sind
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

        // Dividenden extrahieren und verarbeiten
        let dividends = [];
        if (events && events.dividends) {
            dividends = Object.values(events.dividends).map(div => ({
                amount: div.amount,
                date: new Date(div.date * 1000).toISOString().split('T')[0],
                timestamp: div.date
            })).sort((a, b) => b.timestamp - a.timestamp);
        }

        // Zusätzliche Metriken berechnen (z.B. Jahressummen)
        const currentYear = new Date().getFullYear();
        const yearlyTotals = {};

        dividends.forEach(div => {
            const year = new Date(div.timestamp * 1000).getFullYear();
            yearlyTotals[year] = (yearlyTotals[year] || 0) + div.amount;
        });

        const responseData = {
            symbol: meta.symbol,
            currency: meta.currency,
            instrumentType: meta.instrumentType,
            regularMarketPrice: meta.regularMarketPrice,
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
