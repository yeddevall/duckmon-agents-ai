// DUCKMON MARKET ANALYZER v3.0 - Advanced Market Intelligence & Alerts
import { contracts } from '../shared/config.js';
import { createLogger, formatPrice, formatNumber, formatUptime, getHealthBar } from '../shared/logger.js';
import { createClients, registerAgent, postSignal } from '../shared/wallet.js';
import { fetchPrice, buildHistory } from '../shared/priceService.js';
import {
    calculateRSI, calculateSMA, calculateBollingerBands,
    calculateMomentum, calculateVolatility, calculateATR,
    calculateTrendStrength, calculateFearGreedIndex, detectMarketRegime,
    calculateSupportResistance, calculateVWAP, calculateIchimokuCloud,
    calculateFibonacciLevels, generateFullAnalysis,
} from '../shared/technical-analysis.js';
import AI from '../shared/aiModule.js';

const AGENT_NAME = 'Market Analyzer v3.0';
const log = createLogger('Market');

const CONFIG = {
    ANALYSIS_INTERVAL: 900000,
    HISTORY_SIZE: 500,
    WHALE_THRESHOLD: 0.03,
    VOLATILITY_ALERT_THRESHOLD: 8,
    HEALTH_CRITICAL: 25,
    HEALTH_WARNING: 50,
};

let priceHistory = [];
let volumeHistory = [];
let isRegistered = false;

const alerts = {
    active: [],
    history: [],
    whaleCount: 0,
    volatilitySpikes: 0,
};

const performance = {
    totalAnalyses: 0,
    startTime: Date.now(),
    alertsTriggered: 0,
};

// ═══════════════════════════════════════════════════════════════════
// ALERT GENERATION ENGINE
// ═══════════════════════════════════════════════════════════════════

function detectWhaleMove(prices) {
    if (prices.length < 3) return { detected: false };

    const current = prices[prices.length - 1];
    const previous = prices[prices.length - 2];
    const change = Math.abs((current - previous) / previous);

    return {
        detected: change > CONFIG.WHALE_THRESHOLD,
        priceChange: (change * 100).toFixed(2),
        direction: current > previous ? 'BUY' : 'SELL',
        confidence: Math.min((change / CONFIG.WHALE_THRESHOLD) * 100, 100),
    };
}

function calculateHealthScore(volatility, trend, fearGreed, whaleDetected) {
    let score = 50;

    if (trend.direction === 'BULLISH') score += 15 + trend.strength * 0.1;
    else if (trend.direction === 'BEARISH') score -= 15 + trend.strength * 0.1;

    if (volatility > CONFIG.VOLATILITY_ALERT_THRESHOLD) score -= 25;
    else if (volatility > 5) score -= 10;
    else if (volatility < 2) score += 10;

    if (fearGreed > 70) score += 5;
    else if (fearGreed < 30) score -= 10;

    if (whaleDetected) score -= 10;

    return Math.max(0, Math.min(100, score));
}

function generateAlerts(health, volatility, whale, trend, sr, currentPrice, regime) {
    const newAlerts = [];

    if (health < CONFIG.HEALTH_CRITICAL) {
        newAlerts.push({ level: 'CRITICAL', type: 'HEALTH', message: `Market health critical: ${health.toFixed(0)}%` });
    } else if (health < CONFIG.HEALTH_WARNING) {
        newAlerts.push({ level: 'WARNING', type: 'HEALTH', message: `Market health declining: ${health.toFixed(0)}%` });
    }

    if (volatility > CONFIG.VOLATILITY_ALERT_THRESHOLD) {
        newAlerts.push({ level: 'WARNING', type: 'VOLATILITY', message: `High volatility: ${volatility.toFixed(2)}%` });
        alerts.volatilitySpikes++;
    }

    if (whale.detected) {
        newAlerts.push({ level: 'WARNING', type: 'WHALE', message: `Whale ${whale.direction}: ${whale.priceChange}% move` });
        alerts.whaleCount++;
    }

    if (sr.support > 0 && currentPrice < sr.support * 1.02) {
        newAlerts.push({ level: 'INFO', type: 'SUPPORT', message: `Approaching support: ${sr.support.toFixed(8)} MON` });
    }
    if (sr.resistance > 0 && currentPrice > sr.resistance * 0.98) {
        newAlerts.push({ level: 'INFO', type: 'RESISTANCE', message: `Approaching resistance: ${sr.resistance.toFixed(8)} MON` });
    }

    if (regime === 'VOLATILE_CHOPPY') {
        newAlerts.push({ level: 'WARNING', type: 'REGIME', message: 'Volatile choppy market detected - high risk' });
    }

    return newAlerts;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ANALYSIS LOOP
// ═══════════════════════════════════════════════════════════════════

async function runAnalysis() {
    log.separator();
    log.info('Running advanced market analysis...');

    const priceData = await fetchPrice();
    if (!priceData) { log.error('No price data'); return null; }

    priceHistory.push(priceData.price);
    volumeHistory.push(priceData.volume || 0);
    if (priceHistory.length > CONFIG.HISTORY_SIZE) {
        priceHistory = priceHistory.slice(-CONFIG.HISTORY_SIZE);
        volumeHistory = volumeHistory.slice(-CONFIG.HISTORY_SIZE);
    }

    const currentPrice = priceData.price;

    // Full technical analysis from shared library
    const fullAnalysis = priceHistory.length >= 30
        ? generateFullAnalysis(priceHistory, volumeHistory)
        : null;

    const volatility = calculateVolatility(priceHistory);
    const trend = calculateTrendStrength(priceHistory);
    const fearGreed = calculateFearGreedIndex(priceHistory, volumeHistory);
    const regime = detectMarketRegime(priceHistory, volumeHistory);
    const sr = calculateSupportResistance(priceHistory, volumeHistory);
    const whale = detectWhaleMove(priceHistory);
    const health = calculateHealthScore(volatility, trend, fearGreed, whale.detected);
    const momentum = calculateMomentum(priceHistory);
    const rsi = calculateRSI(priceHistory);
    const atr = calculateATR(priceHistory);
    const fib = calculateFibonacciLevels(priceHistory);

    // Bollinger & Ichimoku
    const bb = priceHistory.length >= 20 ? calculateBollingerBands(priceHistory) : null;
    const ichimoku = priceHistory.length >= 52 ? calculateIchimokuCloud(priceHistory) : null;

    // Generate alerts
    const newAlerts = generateAlerts(health, volatility, whale, trend, sr, currentPrice, regime);
    for (const alert of newAlerts) {
        alerts.active.push(alert);
        alerts.history.push(alert);
        performance.alertsTriggered++;
    }
    if (alerts.active.length > 10) alerts.active = alerts.active.slice(-10);

    performance.totalAnalyses++;

    // AI Enhancement
    let aiAnalysis = null;
    if (AI.isAIEnabled() && fullAnalysis) {
        try {
            log.ai('Requesting AI market analysis...');
            aiAnalysis = await AI.generateMarketAnalysis({
                price: currentPrice,
                priceChange24h: priceData.priceChange24h || 0,
                volume24h: priceData.volume || 0,
                rsi,
                macd: fullAnalysis.macd.histogram,
                macdSignal: fullAnalysis.macd.signal,
                bollingerPosition: bb ? bb.percentB : 50,
                momentum,
                volatility,
                stochasticRSI: fullAnalysis.stochasticRSI,
                ichimoku: ichimoku ? { signal: ichimoku.signal } : { signal: 'N/A' },
                regime,
            });
            if (aiAnalysis) {
                log.ai(`AI: ${aiAnalysis.signal} (${aiAnalysis.confidence}%) - ${aiAnalysis.sentiment || 'N/A'}`);
            }
        } catch (err) {
            log.warning(`AI unavailable: ${err.message}`);
        }
    }

    // Display
    log.banner('DUCKMON MARKET ANALYZER v3.0 - Intelligence Report', aiAnalysis ? 'AI-ENHANCED' : null);
    console.log(`  Price:       ${formatPrice(currentPrice)} MON`);
    console.log(`  Health:      ${getHealthBar(health)} ${health.toFixed(0)}%`);
    log.separator();

    console.log('  MARKET METRICS:');
    console.log(`    Trend:       ${trend.direction} (${trend.strength.toFixed(1)}%)`);
    console.log(`    Volatility:  ${volatility.toFixed(2)}%`);
    console.log(`    Momentum:    ${momentum > 0 ? '+' : ''}${momentum.toFixed(2)}%`);
    console.log(`    RSI:         ${rsi.toFixed(1)}`);
    console.log(`    ATR:         ${atr.toFixed(8)}`);
    console.log(`    Fear/Greed:  ${fearGreed} (${fearGreed >= 60 ? 'Greed' : fearGreed <= 40 ? 'Fear' : 'Neutral'})`);
    console.log(`    Regime:      ${regime}`);
    if (bb) console.log(`    Bollinger:   %B=${bb.percentB.toFixed(1)} BW=${bb.bandwidth.toFixed(2)}`);
    if (ichimoku) console.log(`    Ichimoku:    ${ichimoku.signal}`);
    log.separator();

    console.log('  KEY LEVELS:');
    console.log(`    Support:     ${sr.support.toFixed(8)} MON`);
    console.log(`    Resistance:  ${sr.resistance.toFixed(8)} MON`);
    if (fib) {
        console.log(`    Fib 38.2%:   ${fib.level_38_2.toFixed(8)} MON`);
        console.log(`    Fib 61.8%:   ${fib.level_61_8.toFixed(8)} MON`);
    }

    if (aiAnalysis) {
        log.separator();
        console.log('  AI ANALYSIS:');
        console.log(`    Signal:      ${aiAnalysis.signal} (${aiAnalysis.confidence}%)`);
        console.log(`    Sentiment:   ${aiAnalysis.sentiment || 'N/A'}`);
        console.log(`    Support:     ${aiAnalysis.support || 'N/A'}`);
        console.log(`    Resistance:  ${aiAnalysis.resistance || 'N/A'}`);
        console.log(`    Risk/Reward: ${aiAnalysis.riskReward || 'N/A'}`);
    }
    log.separator();

    // Display alerts
    if (newAlerts.length > 0) {
        console.log('  ALERTS:');
        for (const alert of newAlerts) {
            log.alert(`[${alert.level}] ${alert.message}`);
        }
        log.separator();
    }

    if (whale.detected) {
        console.log(`  WHALE DETECTED: ${whale.direction} pressure (${whale.priceChange}% move)`);
        log.separator();
    }

    console.log(`  Stats: ${performance.totalAnalyses} analyses | ${alerts.whaleCount} whales | ${alerts.volatilitySpikes} vol spikes`);
    console.log(`  Uptime: ${formatUptime(Date.now() - performance.startTime)}`);

    // Post best signal to blockchain
    if (isRegistered && fullAnalysis) {
        const signalType = trend.direction === 'BULLISH' ? 'BUY' : trend.direction === 'BEARISH' ? 'SELL' : 'HOLD';
        const confidence = Math.round(Math.min(50 + trend.strength * 0.5, 95));

        if (confidence >= 55) {
            const reason = [
                `Health:${health.toFixed(0)}%`,
                `RSI:${rsi.toFixed(0)}`,
                `F&G:${fearGreed}`,
                `Regime:${regime}`,
                aiAnalysis ? `AI:${aiAnalysis.signal}` : null,
            ].filter(Boolean).join(' | ');

            await postSignal(signalType, confidence, currentPrice, reason, log);
        }
    }

    return { health, volatility, trend, whale, regime, fearGreed, alerts: newAlerts, aiAnalysis };
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DUCKMON MARKET ANALYZER v3.0                       ║
║      Advanced Market Intelligence & Alerts                   ║
║              Powered by Monad                                ║
╚══════════════════════════════════════════════════════════════╝`);

    log.info(`Starting ${AGENT_NAME}...`);
    log.info(`DUCK Token: ${contracts.DUCK_TOKEN.slice(0, 10)}...`);
    log.info(`Interval: ${CONFIG.ANALYSIS_INTERVAL / 1000}s`);

    const { account } = createClients();
    if (account) log.success(`Wallet: ${account.address.slice(0, 10)}...`);
    isRegistered = await registerAgent(AGENT_NAME, log);

    log.info('Building price history...');
    const history = await buildHistory(60, 3000, log);
    priceHistory = history.map(d => d.price);
    volumeHistory = history.map(d => d.volume || 0);

    await runAnalysis();

    setInterval(async () => {
        try { await runAnalysis(); }
        catch (err) { log.error(`Analysis loop error: ${err.message}`); }
    }, CONFIG.ANALYSIS_INTERVAL);

    log.success('Agent running!');
}

export { runAnalysis, performance, alerts };
main().catch(console.error);
