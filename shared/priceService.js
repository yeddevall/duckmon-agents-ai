// Shared Price Fetching Service for all DUCKMON Agents
// Singleton with caching, rate limiting, and real history building
import { formatEther, parseEther } from 'viem';
import { contracts, LENS_ABI, DEXSCREENER_API } from './config.js';
import { getPublicClient } from './wallet.js';

const CACHE_TTL = 5000; // 5 seconds cache
let _cache = { data: null, timestamp: 0 };
let _lastKnownPrice = 0.000019;

export async function fetchPrice() {
    // Return cached data if fresh
    if (_cache.data && Date.now() - _cache.timestamp < CACHE_TTL) {
        return { ..._cache.data, source: 'cache' };
    }

    // Method 1: DexScreener API
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(DEXSCREENER_API, { signal: controller.signal });
        clearTimeout(timeout);

        const data = await response.json();

        if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs.find(p =>
                p.baseToken?.symbol?.toUpperCase() === 'DUCK' ||
                p.quoteToken?.symbol?.toUpperCase() === 'MON'
            ) || data.pairs[0];

            const priceNum = parseFloat(pair.priceNative || pair.priceUsd || 0);
            if (priceNum > 0) {
                const result = {
                    price: priceNum,
                    timestamp: Date.now(),
                    source: 'DexScreener',
                    volume: parseFloat(pair.volume?.h24 || 0),
                    priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
                    liquidity: parseFloat(pair.liquidity?.usd || 0),
                    marketCap: parseFloat(pair.marketCap || 0),
                    buys24h: pair.txns?.h24?.buys || 0,
                    sells24h: pair.txns?.h24?.sells || 0,
                    pairAddress: pair.pairAddress || null,
                };
                _lastKnownPrice = priceNum;
                _cache = { data: result, timestamp: Date.now() };
                return result;
            }
        }
    } catch (error) {
        // Fall through to Lens
    }

    // Method 2: Lens contract (on-chain)
    try {
        const publicClient = getPublicClient();
        const amountIn = parseEther('1');
        const result = await publicClient.readContract({
            address: contracts.LENS,
            abi: LENS_ABI,
            functionName: 'getAmountOut',
            args: [contracts.DUCK_TOKEN, amountIn, true],
        });

        const duckPerMon = Number(formatEther(result[1]));
        const priceInMon = duckPerMon > 0 ? 1 / duckPerMon : _lastKnownPrice;

        if (priceInMon < 0.0000001 || priceInMon > 1000) {
            return { price: _lastKnownPrice, timestamp: Date.now(), source: 'cached', volume: 0 };
        }

        _lastKnownPrice = priceInMon;
        const data = {
            price: priceInMon,
            timestamp: Date.now(),
            source: 'nad.fun Lens',
            volume: 0,
            priceChange24h: 0,
            liquidity: 0,
        };
        _cache = { data, timestamp: Date.now() };
        return data;
    } catch (error) {
        // Fall through to cached
    }

    // Method 3: Last known price
    if (_lastKnownPrice > 0) {
        return { price: _lastKnownPrice, timestamp: Date.now(), source: 'cached', volume: 0 };
    }

    return null;
}

// Build real price history at proper intervals
export async function buildHistory(count = 50, intervalMs = 3000, log = null) {
    const history = [];

    // First fetch to get initial price
    const initial = await fetchPrice();
    if (!initial) {
        if (log) log.error('Cannot build history - no price data available');
        return history;
    }
    history.push(initial);

    // Build history with actual time separation
    for (let i = 1; i < count; i++) {
        await new Promise(r => setTimeout(r, intervalMs));
        const data = await fetchPrice();
        if (data) {
            history.push(data);
        }
        if (log && i % 10 === 0) {
            process.stdout.write(`\r  Price history: ${i + 1}/${count} points`);
        }
    }

    if (log) {
        process.stdout.write(`\r  Price history: ${count}/${count} points\n`);
        log.success(`Collected ${history.length} data points over ${((count * intervalMs) / 1000).toFixed(0)}s`);
    }

    return history;
}

// Get bonding curve progress from Lens
export async function getBondingProgress() {
    try {
        const publicClient = getPublicClient();
        const [progress, graduated] = await Promise.all([
            publicClient.readContract({
                address: contracts.LENS,
                abi: LENS_ABI,
                functionName: 'getProgress',
                args: [contracts.DUCK_TOKEN],
            }),
            publicClient.readContract({
                address: contracts.LENS,
                abi: LENS_ABI,
                functionName: 'isGraduated',
                args: [contracts.DUCK_TOKEN],
            }),
        ]);
        return {
            progress: Number(progress) / 100, // 0-100%
            isGraduated: graduated,
        };
    } catch {
        return { progress: 0, isGraduated: false };
    }
}

export function getLastKnownPrice() {
    return _lastKnownPrice;
}
