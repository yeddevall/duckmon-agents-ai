// DUCKMON SOCIAL SENTIMENT v1.0 - Social Signal & Sentiment Analysis
import { contracts, DEXSCREENER_API } from '../shared/config.js';
import { createLogger, formatPrice, formatNumber, formatUptime } from '../shared/logger.js';
import { createClients, registerAgent, postSignal } from '../shared/wallet.js';
import { fetchPrice, buildHistory } from '../shared/priceService.js';
import { calculateMomentum, calculateVolatility, calculateTrendStrength } from '../shared/technical-analysis.js';
import { sendSignal } from '../shared/websocketClient.js';
import AI from '../shared/aiModule.js';

const AGENT_NAME = 'Social Sentiment v1.0';
const log = createLogger('Sentmt');

const CONFIG = {
    CHECK_INTERVAL: 900000,     // 15 min
    HISTORY_SIZE: 100,
    BULLISH_THRESHOLD: 65,
    BEARISH_THRESHOLD: 35,
};

let priceHistory = [];
let isRegistered = false;
let previousMetrics = null;

const performance = {
    totalChecks: 0,
    signals: 0,
    startTime: Date.now(),
};

const sentiment = {
    score: 50,
    label: 'NEUTRAL',
    holderGrowth: 0,
    volumeTrend: 'FLAT',
    txActivity: 'NORMAL',
    socialMomentum: 0,
};

// ═══════════════════════════════════════════════════════════════════
// DATA COLLECTION
// ═══════════════════════════════════════════════════════════════════

async function fetchSocialMetrics() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(DEXSCREENER_API, { signal: controller.signal });
        clearTimeout(timeout);

        const data = await response.json();

        if (!data.pairs || data.pairs.length === 0) return null;

        const pair = data.pairs.find(p =>
            p.baseToken?.symbol?.toUpperCase() === 'DUCK'
        ) || data.pairs[0];

        return {
            price: parseFloat(pair.priceNative || 0),
            volume24h: parseFloat(pair.volume?.h24 || 0),
            volume6h: parseFloat(pair.volume?.h6 || 0),
            volume1h: parseFloat(pair.volume?.h1 || 0),
            priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
            priceChange6h: parseFloat(pair.priceChange?.h6 || 0),
            priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
            buys24h: pair.txns?.h24?.buys || 0,
            sells24h: pair.txns?.h24?.sells || 0,
            buys6h: pair.txns?.h6?.buys || 0,
            sells6h: pair.txns?.h6?.sells || 0,
            buys1h: pair.txns?.h1?.buys || 0,
            sells1h: pair.txns?.h1?.sells || 0,
            liquidity: parseFloat(pair.liquidity?.usd || 0),
            marketCap: parseFloat(pair.marketCap || 0),
            pairCreatedAt: pair.pairCreatedAt || 0,
            timestamp: Date.now(),
        };
    } catch (error) {
        log.warning(`Social metrics fetch error: ${error.message}`);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════
// SENTIMENT SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════

function calculateSentimentScore(metrics, prices) {
    let score = 50;
    const components = {};

    // 1. Buy/Sell Ratio Analysis (weight: 25%)
    const buySellRatio24h = metrics.buys24h / (metrics.sells24h || 1);
    const buySellRatio1h = metrics.buys1h / (metrics.sells1h || 1);

    let buySellScore = 50;
    if (buySellRatio24h > 2) buySellScore += 20;
    else if (buySellRatio24h > 1.5) buySellScore += 15;
    else if (buySellRatio24h > 1.1) buySellScore += 5;
    else if (buySellRatio24h < 0.5) buySellScore -= 20;
    else if (buySellRatio24h < 0.7) buySellScore -= 15;
    else if (buySellRatio24h < 0.9) buySellScore -= 5;

    // 1h ratio for recency
    if (buySellRatio1h > 2) buySellScore += 10;
    else if (buySellRatio1h < 0.5) buySellScore -= 10;

    components.buySell = Math.max(0, Math.min(100, buySellScore));

    // 2. Volume Trend Analysis (weight: 25%)
    let volumeScore = 50;
    if (metrics.volume1h > 0 && metrics.volume6h > 0) {
        const hourlyAvg6h = metrics.volume6h / 6;
        const volumeAcceleration = metrics.volume1h / (hourlyAvg6h || 1);

        if (volumeAcceleration > 3) volumeScore += 25;
        else if (volumeAcceleration > 2) volumeScore += 15;
        else if (volumeAcceleration > 1.3) volumeScore += 5;
        else if (volumeAcceleration < 0.3) volumeScore -= 15;
        else if (volumeAcceleration < 0.5) volumeScore -= 10;
    }
    components.volume = Math.max(0, Math.min(100, volumeScore));

    // 3. Price Momentum (weight: 25%)
    let momentumScore = 50;
    if (prices.length >= 10) {
        const mom = calculateMomentum(prices);
        const trend = calculateTrendStrength(prices);

        if (mom > 5) momentumScore += 20;
        else if (mom > 2) momentumScore += 10;
        else if (mom < -5) momentumScore -= 20;
        else if (mom < -2) momentumScore -= 10;

        if (trend.direction === 'BULLISH') momentumScore += trend.strength * 0.15;
        else if (trend.direction === 'BEARISH') momentumScore -= trend.strength * 0.15;
    }
    components.momentum = Math.max(0, Math.min(100, momentumScore));

    // 4. Transaction Activity (weight: 25%)
    let activityScore = 50;
    const totalTxs24h = metrics.buys24h + metrics.sells24h;
    const totalTxs1h = metrics.buys1h + metrics.sells1h;

    if (totalTxs1h > 50) activityScore += 20;
    else if (totalTxs1h > 20) activityScore += 10;
    else if (totalTxs1h < 3) activityScore -= 15;

    // Activity acceleration
    if (previousMetrics) {
        const prevTotalTxs = (previousMetrics.buys24h || 0) + (previousMetrics.sells24h || 0);
        if (prevTotalTxs > 0) {
            const txGrowth = (totalTxs24h - prevTotalTxs) / prevTotalTxs;
            if (txGrowth > 0.2) activityScore += 10;
            else if (txGrowth < -0.2) activityScore -= 10;
        }
    }
    components.activity = Math.max(0, Math.min(100, activityScore));

    // Weighted average
    score = Math.round(
        components.buySell * 0.25 +
        components.volume * 0.25 +
        components.momentum * 0.25 +
        components.activity * 0.25
    );

    // Determine label
    let label;
    if (score >= 75) label = 'VERY BULLISH';
    else if (score >= CONFIG.BULLISH_THRESHOLD) label = 'BULLISH';
    else if (score <= 25) label = 'VERY BEARISH';
    else if (score <= CONFIG.BEARISH_THRESHOLD) label = 'BEARISH';
    else label = 'NEUTRAL';

    // Volume trend label
    let volumeTrend = 'FLAT';
    if (components.volume >= 65) volumeTrend = 'RISING';
    else if (components.volume <= 35) volumeTrend = 'FALLING';

    // TX activity label
    let txActivity = 'NORMAL';
    if (totalTxs1h > 50) txActivity = 'HIGH';
    else if (totalTxs1h > 100) txActivity = 'VERY_HIGH';
    else if (totalTxs1h < 5) txActivity = 'LOW';

    return {
        score,
        label,
        components,
        volumeTrend,
        txActivity,
        buySellRatio24h,
        buySellRatio1h,
        totalTxs24h,
        totalTxs1h,
    };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ANALYSIS LOOP
// ═══════════════════════════════════════════════════════════════════

async function runAnalysis() {
    log.separator();
    log.info('Running sentiment analysis...');

    const socialMetrics = await fetchSocialMetrics();
    if (!socialMetrics) { log.error('No social data'); return null; }

    priceHistory.push(socialMetrics.price);
    if (priceHistory.length > CONFIG.HISTORY_SIZE) priceHistory = priceHistory.slice(-CONFIG.HISTORY_SIZE);

    const result = calculateSentimentScore(socialMetrics, priceHistory);
    performance.totalChecks++;

    // Update global sentiment
    sentiment.score = result.score;
    sentiment.label = result.label;
    sentiment.volumeTrend = result.volumeTrend;
    sentiment.txActivity = result.txActivity;
    sentiment.socialMomentum = result.components.momentum;

    // AI Enhancement
    let aiSentiment = null;
    if (AI.isAIEnabled()) {
        try {
            aiSentiment = await AI.generateSentimentAnalysis({
                sentimentScore: result.score,
                buySellRatio: result.buySellRatio24h,
                volumeTrend: result.volumeTrend,
                txActivity: result.txActivity,
                priceChange24h: socialMetrics.priceChange24h,
                priceChange1h: socialMetrics.priceChange1h,
                volume24h: socialMetrics.volume24h,
                totalTxs24h: result.totalTxs24h,
                marketCap: socialMetrics.marketCap,
            });
            if (aiSentiment) {
                log.ai(`AI Sentiment: ${aiSentiment.sentiment || result.label} (${aiSentiment.confidence || 'N/A'}%)`);
            }
        } catch (err) {
            log.warning(`AI unavailable: ${err.message}`);
        }
    }

    // Display
    log.banner('DUCKMON SOCIAL SENTIMENT v1.0', aiSentiment ? 'AI-ENHANCED' : null);
    console.log(`  Price:         ${formatPrice(socialMetrics.price)} MON`);
    console.log(`  Market Cap:    $${formatNumber(socialMetrics.marketCap)}`);
    log.separator();

    const sentimentBar = getHealthBar(result.score);
    console.log(`  SENTIMENT:     ${sentimentBar} ${result.score}/100 (${result.label})`);
    log.separator();

    console.log('  COMPONENTS:');
    console.log(`    Buy/Sell:    ${result.components.buySell}/100 (Ratio: ${result.buySellRatio24h.toFixed(2)})`);
    console.log(`    Volume:      ${result.components.volume}/100 (Trend: ${result.volumeTrend})`);
    console.log(`    Momentum:    ${result.components.momentum}/100`);
    console.log(`    Activity:    ${result.components.activity}/100 (${result.txActivity})`);
    log.separator();

    console.log('  TRANSACTION DATA:');
    console.log(`    24h Buys:    ${socialMetrics.buys24h} | Sells: ${socialMetrics.sells24h}`);
    console.log(`    1h Buys:     ${socialMetrics.buys1h} | Sells: ${socialMetrics.sells1h}`);
    console.log(`    Volume 24h:  $${formatNumber(socialMetrics.volume24h)}`);
    console.log(`    Volume 1h:   $${formatNumber(socialMetrics.volume1h)}`);

    console.log('  PRICE CHANGES:');
    console.log(`    1h:  ${socialMetrics.priceChange1h >= 0 ? '+' : ''}${socialMetrics.priceChange1h.toFixed(2)}%`);
    console.log(`    6h:  ${socialMetrics.priceChange6h >= 0 ? '+' : ''}${socialMetrics.priceChange6h.toFixed(2)}%`);
    console.log(`    24h: ${socialMetrics.priceChange24h >= 0 ? '+' : ''}${socialMetrics.priceChange24h.toFixed(2)}%`);

    if (aiSentiment) {
        log.separator();
        console.log('  AI ANALYSIS:');
        console.log(`    Sentiment:   ${aiSentiment.sentiment || 'N/A'}`);
        console.log(`    Confidence:  ${aiSentiment.confidence || 'N/A'}%`);
        console.log(`    Narrative:   ${aiSentiment.narrative || 'N/A'}`);
    }
    log.separator();

    console.log(`  Stats: ${performance.totalChecks} checks | ${performance.signals} signals`);
    console.log(`  Uptime: ${formatUptime(Date.now() - performance.startTime)}`);

    // Post to blockchain
    if (isRegistered) {
        const signalType = result.score >= CONFIG.BULLISH_THRESHOLD ? 'BUY' :
            result.score <= CONFIG.BEARISH_THRESHOLD ? 'SELL' : 'HOLD';
        const confidence = Math.round(Math.min(50 + Math.abs(result.score - 50) * 0.8, 95));

        const reason = [
            `SENTIMENT`,
            `Score:${result.score}/100`,
            `B/S:${result.buySellRatio24h.toFixed(1)}`,
            `Vol:${result.volumeTrend}`,
            `TX:${result.txActivity}`,
            result.label,
            aiSentiment ? `AI:${aiSentiment.sentiment || 'N/A'}` : null,
        ].filter(Boolean).join(' | ');

        if (confidence >= 55) {
            await postSignal(signalType, confidence, socialMetrics.price, reason, log);
            performance.signals++;
        }
    }

    // Send to ws-server for frontend
    try {
        await sendSignal({
            agentName: AGENT_NAME,
            type: result.score >= CONFIG.BULLISH_THRESHOLD ? 'BUY' :
                result.score <= CONFIG.BEARISH_THRESHOLD ? 'SELL' : 'HOLD',
            confidence: Math.round(Math.min(50 + Math.abs(result.score - 50) * 0.8, 95)),
            price: socialMetrics.price,
            category: 'sentiment',
            sentimentScore: result.score,
            sentimentLabel: result.label,
            components: result.components,
            buySellRatio24h: result.buySellRatio24h,
            volumeTrend: result.volumeTrend,
            txActivity: result.txActivity,
            priceChanges: {
                '1h': socialMetrics.priceChange1h,
                '6h': socialMetrics.priceChange6h,
                '24h': socialMetrics.priceChange24h,
            },
            volume24h: socialMetrics.volume24h,
            marketCap: socialMetrics.marketCap,
            aiSentiment: aiSentiment || null,
        });
    } catch (e) { /* ws-server may be offline */ }

    previousMetrics = socialMetrics;
    return { sentiment: result, aiSentiment };
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DUCKMON SOCIAL SENTIMENT v1.0                      ║
║      Social Signal & Sentiment Analysis                      ║
║              Powered by Monad                                ║
╚══════════════════════════════════════════════════════════════╝`);

    log.info(`Starting ${AGENT_NAME}...`);

    const { account } = createClients();
    if (account) log.success(`Wallet: ${account.address.slice(0, 10)}...`);
    isRegistered = await registerAgent(AGENT_NAME, log);

    await runAnalysis();

    setInterval(async () => {
        try { await runAnalysis(); }
        catch (err) { log.error(`Analysis error: ${err.message}`); }
    }, CONFIG.CHECK_INTERVAL);

    log.success('Social Sentiment monitoring!');
}

export { runAnalysis, performance, sentiment };
main().catch(console.error);
