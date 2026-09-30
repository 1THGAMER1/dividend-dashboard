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
        const symbols = (event.queryStringParameters?.symbol || event.queryStringParameters?.symbols || '').toUpperCase();

        if (!symbols) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Symbol parameter is required' })
            };
        }

        const apiKey = process.env.CMC_API_KEY;
        if (!apiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'CMC_API_KEY is not configured' })
            };
        }

        // CoinMarketCap erlaubt mehrere Symbole, getrennt durch Komma
        const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbols)}&convert=EUR`;

        const response = await fetch(url, {
            headers: {
                'X-CMC_PRO_API_KEY': apiKey,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`CoinMarketCap API returned status ${response.status}`);
        }

        const data = await response.json();
        const coinMap = {};

        // Durchlaufe alle zurückgegebenen Daten und mappe sie auf das Symbol
        if (data.data) {
            for (const [sym, coinData] of Object.entries(data.data)) {
                const quote = coinData.quote?.EUR || {};
                coinMap[sym] = {
                    name: coinData.name,
                    regularMarketPrice: quote.price || 0,
                    percentChange24h: quote.percent_change_24h || 0,
                    marketCap: quote.market_cap || 0,
                    currency: 'EUR'
                };
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ coins: coinMap })
        };

    } catch (error) {
        console.error('Error in coinmarketcap function:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to fetch crypto data',
                details: error.message
            })
        };
    }
};