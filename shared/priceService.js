// Shared Price Fetching Service for all DUCKMON Agents
// Singleton with caching, rate limiting, and real history building
import { formatEther, parseEther } from 'viem';
import { contracts, LENS_ABI, DEXSCREENER_API } from './config.js';
import { getPublicClient } from './wallet.js';

const CACHE_TTL = 5000; // 5 seconds cache

// Per-token caches
const _caches = new Map(); // tokenAddress -> { data, timestamp }
let _lastKnownPrice = 0.000019;

function getCache(tokenAddress) {
    const key = (tokenAddress || contracts.DUCK_TOKEN).toLowerCase();
    return _caches.get(key) || { data: null, timestamp: 0 };
}

function setCache(tokenAddress, data) {
    const key = (tokenAddress || contracts.DUCK_TOKEN).toLowerCase();
    _caches.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch price for any token on Monad
 * @param {string} [tokenAddress] - Token contract address (defaults to DUCK_TOKEN)
 * @returns {Promise<Object|null>} Price data object
 */
export async function fetchPrice(tokenAddress) {
    const address = tokenAddress || contracts.DUCK_TOKEN;
    const isDuck = address.toLowerCase() === contracts.DUCK_TOKEN.toLowerCase();

    // Return cached data if fresh
    const cache = getCache(address);
    if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
        return { ...cache.data, source: 'cache' };
    }

    // Method 1: DexScreener API (works for any token)
    try {
        const apiUrl = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeout);

        const data = await response.json();

        if (data.pairs && data.pairs.length > 0) {
            // Find the best pair (highest liquidity)
            const pair = data.pairs.sort((a, b) =>
                (parseFloat(b.liquidity?.usd || 0)) - (parseFloat(a.liquidity?.usd || 0))
            )[0];

            const priceNum = parseFloat(pair.priceNative || pair.priceUsd || 0);
            if (priceNum > 0) {
                const result = {
                    price: priceNum,
                    priceUsd: parseFloat(pair.priceUsd || 0),
                    priceNative: parseFloat(pair.priceNative || 0),
                    timestamp: Date.now(),
                    source: 'DexScreener',
                    volume: parseFloat(pair.volume?.h24 || 0),
                    priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
                    priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
                    priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
                    liquidity: parseFloat(pair.liquidity?.usd || 0),
                    marketCap: parseFloat(pair.marketCap || pair.fdv || 0),
                    buys24h: pair.txns?.h24?.buys || 0,
                    sells24h: pair.txns?.h24?.sells || 0,
                    buys1h: pair.txns?.h1?.buys || 0,
                    sells1h: pair.txns?.h1?.sells || 0,
                    pairAddress: pair.pairAddress || null,
                    tokenSymbol: pair.baseToken?.symbol || 'UNKNOWN',
                    tokenName: pair.baseToken?.name || 'Unknown Token',
                    tokenAddress: address,
                };
                if (isDuck) _lastKnownPrice = priceNum;
                setCache(address, result);
                return result;
            }
        }
    } catch (error) {
        // Fall through to Lens (only for DUCK)
    }

    // Method 2: Lens contract (on-chain, only for DUCK/nad.fun tokens)
    if (isDuck) {
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
                return { price: _lastKnownPrice, timestamp: Date.now(), source: 'cached', volume: 0, tokenAddress: address };
            }

            _lastKnownPrice = priceInMon;
            const data = {
                price: priceInMon,
                timestamp: Date.now(),
                source: 'nad.fun Lens',
                volume: 0,
                priceChange24h: 0,
                liquidity: 0,
                tokenAddress: address,
            };
            setCache(address, data);
            return data;
        } catch (error) {
            // Fall through to cached
        }
    }

    // Method 3: Last known price (only for DUCK)
    if (isDuck && _lastKnownPrice > 0) {
        return { price: _lastKnownPrice, timestamp: Date.now(), source: 'cached', volume: 0, tokenAddress: address };
    }

    return null;
}

/**
 * Build real price history at proper intervals
 * @param {string} [tokenAddress] - Token contract address (defaults to DUCK_TOKEN)
 * @param {number} [count=50] - Number of data points
 * @param {number} [intervalMs=3000] - Interval between data points
 * @param {Object} [log=null] - Logger object
 */
export async function buildHistory(tokenAddress, count = 50, intervalMs = 3000, log = null) {
    const history = [];

    // First fetch to get initial price
    const initial = await fetchPrice(tokenAddress);
    if (!initial) {
        if (log) log.error('Cannot build history - no price data available');
        return history;
    }
    history.push(initial);

    // Build history with actual time separation
    for (let i = 1; i < count; i++) {
        await new Promise(r => setTimeout(r, intervalMs));
        const data = await fetchPrice(tokenAddress);
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

// Get bonding curve progress from Lens (supports any nad.fun token)
export async function getBondingProgress(tokenAddress) {
    const address = tokenAddress || contracts.DUCK_TOKEN;
    try {
        const publicClient = getPublicClient();
        const [progress, graduated] = await Promise.all([
            publicClient.readContract({
                address: contracts.LENS,
                abi: LENS_ABI,
                functionName: 'getProgress',
                args: [address],
            }),
            publicClient.readContract({
                address: contracts.LENS,
                abi: LENS_ABI,
                functionName: 'isGraduated',
                args: [address],
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
