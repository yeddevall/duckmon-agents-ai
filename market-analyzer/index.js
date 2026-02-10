import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { monadMainnet, contracts, LENS_ABI } from './config.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                      📊 DUCKMON MARKET ANALYZER v2.0                         ║
// ║                  Advanced Market Intelligence & Alerts                        ║
// ║                           Powered by Monad                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const DUCK_TOKEN = contracts.DUCK_TOKEN;
const AGENT_NAME = 'Market Analyzer v2.0';
const AGENT_VERSION = '2.0.0';

// Configuration
const CONFIG = {
    ANALYSIS_INTERVAL: 900000,         // 15 minutes
    HISTORY_SIZE: 500,
    WHALE_THRESHOLD: 0.03,             // 3% sudden move = whale
    VOLATILITY_ALERT_THRESHOLD: 0.08,  // 8% volatility
    HEALTH_CRITICAL: 25,
    HEALTH_WARNING: 50,
};

// State
let priceHistory = [];
let volumeHistory = [];
let demoMode = false;
let lastRealPrice = 0.000019;

// Alert tracking
const alerts = {
    active: [],
    history: [],
    whaleCount: 0,
    volatilitySpikes: 0,
    healthAlerts: 0,
};

// Market metrics
const metrics = {
    currentHealth: 50,
    volatility: 0,
    trend: 'NEUTRAL',
    trendStrength: 0,
    support: 0,
    resistance: 0,
    fearGreedIndex: 50,
    momentum: 0,
};

// Performance
const performance = {
    totalAnalyses: 0,
    startTime: Date.now(),
    alertsTriggered: 0,
};

// Agent state
const agentState = {
    isRunning: true,
    lastAnalysis: null,
};

// Client
const publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(monadMainnet.rpcUrls.default.http[0]),
});

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    alert: (level, msg) => {
        const colors = { CRITICAL: '\x1b[31m', WARNING: '\x1b[33m', INFO: '\x1b[36m' };
        const icons = { CRITICAL: '🚨', WARNING: '⚠️', INFO: 'ℹ️' };
        console.log(`${colors[level] || '\x1b[37m'}[${icons[level]} ${level}]\x1b[0m ${msg}`);
    },
};

function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m ${s % 60}s`;
}

function getHealthBar(health) {
    const filled = Math.round(health / 10);
    const empty = 10 - filled;
    const color = health >= 70 ? '\x1b[32m' : health >= 40 ? '\x1b[33m' : '\x1b[31m';
    return `${color}${'█'.repeat(filled)}${'░'.repeat(empty)}\x1b[0m`;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICE FETCHING
// ══════════════════════════════════════════════════════════════════════════════

async function fetchPrice() {
    if (demoMode) return generateDemoPrice();

    // Method 1: DexScreener API for accurate real-time data
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${DUCK_TOKEN}`);
        const data = await response.json();

        if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs.find(p =>
                p.baseToken?.symbol?.toUpperCase() === 'DUCK'
            ) || data.pairs[0];

            const priceNum = parseFloat(pair.priceNative || 0);
            if (priceNum > 0) {
                lastRealPrice = priceNum;
                const volume24h = parseFloat(pair.volume?.h24 || 0);
                log.info(`DexScreener: ${priceNum.toFixed(8)} MON | Vol: $${volume24h.toFixed(0)}`);
                return {
                    price: priceNum,
                    timestamp: Date.now(),
                    volume: volume24h,
                    priceChange24h: parseFloat(pair.priceChange?.h24 || 0)
                };
            }
        }
    } catch (error) {
        log.warning(`DexScreener error: ${error.message}`);
    }

    // Method 2: Lens contract fallback
    try {
        const result = await publicClient.readContract({
            address: contracts.LENS,
            abi: LENS_ABI,
            functionName: 'getAmountOut',
            args: [DUCK_TOKEN, parseEther('1'), true],
        });

        const duckPerMon = Number(formatEther(result[1]));
        const price = duckPerMon > 0 ? 1 / duckPerMon : lastRealPrice;

        // Sanity check
        if (price < 0.0000001 || price > 1000) {
            log.warning(`Invalid price ${price}, using cached`);
            return { price: lastRealPrice, timestamp: Date.now(), volume: 100 };
        }

        lastRealPrice = price;
        return { price, timestamp: Date.now(), volume: Math.random() * 2000 + 500 };
    } catch (error) {
        if (!demoMode) {
            log.warning('Switching to DEMO MODE');
            demoMode = true;
        }
        return generateDemoPrice();
    }
}

function generateDemoPrice() {
    // Realistic simulation with occasional whale moves
    const isWhaleMove = Math.random() < 0.02; // 2% chance
    const trend = Math.sin(Date.now() / 90000) * 0.006;
    const noise = (Math.random() - 0.5) * (isWhaleMove ? 0.04 : 0.01);

    lastRealPrice *= (1 + trend + noise);
    lastRealPrice = Math.max(lastRealPrice, 0.000001);

    return {
        price: lastRealPrice,
        timestamp: Date.now(),
        volume: isWhaleMove ? 5000 + Math.random() * 10000 : 500 + Math.random() * 2000
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// MARKET ANALYSIS ENGINE
// ══════════════════════════════════════════════════════════════════════════════

class MarketAnalyzer {

    // Volatility calculation (standard deviation / mean)
    calculateVolatility(prices, period = 20) {
        if (prices.length < period) return 0;

        const recent = prices.slice(-period);
        const mean = recent.reduce((s, p) => s + p.price, 0) / recent.length;
        const variance = recent.reduce((s, p) => s + Math.pow(p.price - mean, 2), 0) / recent.length;

        return Math.sqrt(variance) / mean;
    }

    // Whale detection (large sudden moves)
    detectWhaleActivity(prices) {
        if (prices.length < 3) return { detected: false };

        const current = prices[prices.length - 1].price;
        const previous = prices[prices.length - 2].price;
        const change = Math.abs((current - previous) / previous);

        const avgVolume = prices.slice(-10).reduce((s, p) => s + (p.volume || 0), 0) / 10;
        const currentVolume = prices[prices.length - 1].volume || 0;
        const volumeSpike = currentVolume > avgVolume * 3;

        return {
            detected: change > CONFIG.WHALE_THRESHOLD || volumeSpike,
            priceChange: (change * 100).toFixed(2),
            direction: current > previous ? 'BUY' : 'SELL',
            volumeSpike,
            confidence: Math.min((change / CONFIG.WHALE_THRESHOLD) * 100, 100),
        };
    }

    // Support and Resistance levels
    calculateLevels(prices) {
        if (prices.length < 50) return { support: 0, resistance: 0 };

        const recent = prices.slice(-50).map(p => p.price);
        const sorted = [...recent].sort((a, b) => a - b);

        // Support = 10th percentile, Resistance = 90th percentile
        const support = sorted[Math.floor(sorted.length * 0.1)];
        const resistance = sorted[Math.floor(sorted.length * 0.9)];

        return { support, resistance };
    }

    // Trend analysis
    analyzeTrend(prices) {
        if (prices.length < 30) return { direction: 'NEUTRAL', strength: 0 };

        const short = prices.slice(-10).reduce((s, p) => s + p.price, 0) / 10;
        const medium = prices.slice(-20).reduce((s, p) => s + p.price, 0) / 20;
        const long = prices.slice(-30).reduce((s, p) => s + p.price, 0) / 30;

        const shortAboveMed = short > medium;
        const medAboveLong = medium > long;

        if (shortAboveMed && medAboveLong) {
            const strength = ((short - long) / long) * 1000;
            return { direction: 'BULLISH 📈', strength: Math.min(strength, 100) };
        } else if (!shortAboveMed && !medAboveLong) {
            const strength = ((long - short) / long) * 1000;
            return { direction: 'BEARISH 📉', strength: Math.min(strength, 100) };
        }

        return { direction: 'NEUTRAL ➡️', strength: 10 };
    }

    // Momentum (Rate of Change)
    calculateMomentum(prices, period = 10) {
        if (prices.length < period) return 0;

        const current = prices[prices.length - 1].price;
        const past = prices[prices.length - period].price;

        return ((current - past) / past) * 100;
    }

    // Fear & Greed Index (custom implementation)
    calculateFearGreed(volatility, momentum, trend) {
        let index = 50; // Neutral

        // Volatility impact (high volatility = fear)
        if (volatility > 0.05) index -= 15;
        else if (volatility < 0.02) index += 10;

        // Momentum impact
        if (momentum > 5) index += 20;
        else if (momentum > 2) index += 10;
        else if (momentum < -5) index -= 20;
        else if (momentum < -2) index -= 10;

        // Trend impact
        if (trend.direction.includes('BULLISH')) index += trend.strength * 0.2;
        else if (trend.direction.includes('BEARISH')) index -= trend.strength * 0.2;

        return Math.max(0, Math.min(100, index));
    }

    // Overall Market Health Score
    calculateHealthScore(volatility, trend, fearGreed, whale) {
        let score = 50;

        // Trend bonus/penalty
        if (trend.direction.includes('BULLISH')) {
            score += 15 + trend.strength * 0.1;
        } else if (trend.direction.includes('BEARISH')) {
            score -= 15 + trend.strength * 0.1;
        }

        // Volatility penalty
        if (volatility > CONFIG.VOLATILITY_ALERT_THRESHOLD) {
            score -= 25;
        } else if (volatility > 0.05) {
            score -= 10;
        } else if (volatility < 0.02) {
            score += 10;
        }

        // Fear/Greed adjustment
        if (fearGreed > 70) score += 5; // Greedy = good for price
        else if (fearGreed < 30) score -= 10; // Fearful = bad

        // Whale penalty
        if (whale.detected) {
            score -= 10;
        }

        return Math.max(0, Math.min(100, score));
    }

    // Generate alerts based on conditions
    generateAlerts(health, volatility, whale, trend, levels, currentPrice) {
        const newAlerts = [];

        // Health alerts
        if (health < CONFIG.HEALTH_CRITICAL) {
            newAlerts.push({
                level: 'CRITICAL',
                type: 'HEALTH',
                message: `Market health critical: ${health.toFixed(0)}%`,
                timestamp: Date.now(),
            });
        } else if (health < CONFIG.HEALTH_WARNING) {
            newAlerts.push({
                level: 'WARNING',
                type: 'HEALTH',
                message: `Market health declining: ${health.toFixed(0)}%`,
                timestamp: Date.now(),
            });
        }

        // Volatility alerts
        if (volatility > CONFIG.VOLATILITY_ALERT_THRESHOLD) {
            newAlerts.push({
                level: 'WARNING',
                type: 'VOLATILITY',
                message: `High volatility detected: ${(volatility * 100).toFixed(2)}%`,
                timestamp: Date.now(),
            });
            alerts.volatilitySpikes++;
        }

        // Whale alerts
        if (whale.detected) {
            newAlerts.push({
                level: 'WARNING',
                type: 'WHALE',
                message: `🐋 Whale ${whale.direction}: ${whale.priceChange}% move detected`,
                timestamp: Date.now(),
            });
            alerts.whaleCount++;
        }

        // Support/Resistance alerts
        if (levels.support > 0 && currentPrice < levels.support * 1.02) {
            newAlerts.push({
                level: 'INFO',
                type: 'SUPPORT',
                message: `Price approaching support level: ${levels.support.toFixed(8)} MON`,
                timestamp: Date.now(),
            });
        }

        if (levels.resistance > 0 && currentPrice > levels.resistance * 0.98) {
            newAlerts.push({
                level: 'INFO',
                type: 'RESISTANCE',
                message: `Price approaching resistance: ${levels.resistance.toFixed(8)} MON`,
                timestamp: Date.now(),
            });
        }

        // Trend reversal detection
        if (priceHistory.length > 50) {
            const oldTrend = this.analyzeTrend(priceHistory.slice(0, -20));
            if (oldTrend.direction !== trend.direction && trend.strength > 20) {
                newAlerts.push({
                    level: 'WARNING',
                    type: 'TREND_REVERSAL',
                    message: `Trend reversal: ${oldTrend.direction} → ${trend.direction}`,
                    timestamp: Date.now(),
                });
            }
        }

        return newAlerts;
    }
}

const analyzer = new MarketAnalyzer();

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS LOOP
// ══════════════════════════════════════════════════════════════════════════════

async function runAnalysis() {
    const sep = '═'.repeat(60);
    console.log(`\n${sep}`);
    log.info('Running market analysis...');

    // Fetch price
    const priceData = await fetchPrice();
    priceHistory.push(priceData);
    volumeHistory.push(priceData.volume || 0);

    if (priceHistory.length > CONFIG.HISTORY_SIZE) {
        priceHistory = priceHistory.slice(-CONFIG.HISTORY_SIZE);
        volumeHistory = volumeHistory.slice(-CONFIG.HISTORY_SIZE);
    }

    const currentPrice = priceData.price;

    // Calculate all metrics
    const volatility = analyzer.calculateVolatility(priceHistory);
    const whale = analyzer.detectWhaleActivity(priceHistory);
    const levels = analyzer.calculateLevels(priceHistory);
    const trend = analyzer.analyzeTrend(priceHistory);
    const momentum = analyzer.calculateMomentum(priceHistory);
    const fearGreed = analyzer.calculateFearGreed(volatility, momentum, trend);
    const health = analyzer.calculateHealthScore(volatility, trend, fearGreed, whale);

    // Update metrics
    metrics.currentHealth = health;
    metrics.volatility = volatility;
    metrics.trend = trend.direction;
    metrics.trendStrength = trend.strength;
    metrics.support = levels.support;
    metrics.resistance = levels.resistance;
    metrics.fearGreedIndex = fearGreed;
    metrics.momentum = momentum;

    // Generate alerts
    const newAlerts = analyzer.generateAlerts(health, volatility, whale, trend, levels, currentPrice);

    // Store alerts
    for (const alert of newAlerts) {
        alerts.active.push(alert);
        alerts.history.push(alert);
        performance.alertsTriggered++;
    }

    // Keep only last 5 active alerts
    if (alerts.active.length > 5) {
        alerts.active = alerts.active.slice(-5);
    }

    performance.totalAnalyses++;

    // Display results
    console.log(sep);
    console.log('  📊 DUCKMON MARKET ANALYZER v2.0 - Intelligence Report');
    if (demoMode) console.log('  ⚠️  DEMO MODE');
    console.log(sep);
    console.log(`  💰 Price:       ${currentPrice.toFixed(8)} MON`);
    console.log(`  💚 Health:      ${getHealthBar(health)} ${health.toFixed(0)}%`);
    console.log(sep);
    console.log('  📈 MARKET METRICS:');
    console.log(`     Trend:       ${trend.direction} (${trend.strength.toFixed(1)}%)`);
    console.log(`     Volatility:  ${(volatility * 100).toFixed(2)}%`);
    console.log(`     Momentum:    ${momentum > 0 ? '+' : ''}${momentum.toFixed(2)}%`);
    console.log(`     Fear/Greed:  ${fearGreed.toFixed(0)} (${fearGreed >= 60 ? 'Greed 🚀' : fearGreed <= 40 ? 'Fear 😰' : 'Neutral 😐'})`);
    console.log(sep);
    console.log('  🎯 KEY LEVELS:');
    console.log(`     Support:     ${levels.support.toFixed(8)} MON`);
    console.log(`     Resistance:  ${levels.resistance.toFixed(8)} MON`);
    console.log(sep);

    // Display alerts
    if (newAlerts.length > 0) {
        console.log('  🚨 ALERTS:');
        for (const alert of newAlerts) {
            log.alert(alert.level, alert.message);
        }
        console.log(sep);
    }

    // Whale status
    if (whale.detected) {
        console.log(`  🐋 WHALE DETECTED: ${whale.direction} pressure (${whale.priceChange}% move)`);
        console.log(sep);
    }

    console.log(`  📊 Stats: ${performance.totalAnalyses} analyses | ${alerts.whaleCount} whales | ${alerts.volatilitySpikes} vol spikes`);
    console.log(`  ⏱️  Uptime: ${formatTime(Date.now() - performance.startTime)}`);
    console.log(sep);

    agentState.lastAnalysis = { health, volatility, trend, whale, alerts: newAlerts };
    return agentState.lastAnalysis;
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ███╗   ███╗ █████╗ ██████╗ ██╗  ██╗███████╗████████╗                       ║
║   ████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝██╔════╝╚══██╔══╝                       ║
║   ██╔████╔██║███████║██████╔╝█████╔╝ █████╗     ██║                          ║
║   ██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗ ██╔══╝     ██║                          ║
║   ██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗███████╗   ██║                          ║
║   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝                          ║
║                                                                              ║
║      █████╗ ███╗   ██╗ █████╗ ██╗  ██╗   ██╗███████╗███████╗██████╗          ║
║     ██╔══██╗████╗  ██║██╔══██╗██║  ╚██╗ ██╔╝╚══███╔╝██╔════╝██╔══██╗         ║
║     ███████║██╔██╗ ██║███████║██║   ╚████╔╝   ███╔╝ █████╗  ██████╔╝         ║
║     ██╔══██║██║╚██╗██║██╔══██║██║    ╚██╔╝   ███╔╝  ██╔══╝  ██╔══██╗         ║
║     ██║  ██║██║ ╚████║██║  ██║███████╗██║   ███████╗███████╗██║  ██║         ║
║     ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝         ║
║                                                                              ║
║                    📊 MARKET ANALYZER v2.0                                   ║
║              Real-time Market Intelligence                                   ║
║                     Powered by Monad                                         ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);

    console.log('');
    log.info(`Starting ${AGENT_NAME}...`);
    log.info(`Version: ${AGENT_VERSION}`);
    log.info(`DUCK Token: ${DUCK_TOKEN.slice(0, 10)}...${DUCK_TOKEN.slice(-8)}`);
    log.info(`Analysis Interval: ${CONFIG.ANALYSIS_INTERVAL / 1000}s`);
    console.log('');

    // Build history
    log.info('Building price history...');
    for (let i = 0; i < 60; i++) {
        priceHistory.push(await fetchPrice());
        process.stdout.write(`\r  Progress: ${i + 1}/60 data points`);
        await new Promise(r => setTimeout(r, 40));
    }
    console.log('');
    log.success(`Collected ${priceHistory.length} data points`);
    console.log('');

    // First analysis
    await runAnalysis();

    // Main loop
    setInterval(async () => {
        if (agentState.isRunning) {
            await runAnalysis();
        }
    }, CONFIG.ANALYSIS_INTERVAL);

    log.success('Agent running! Press Ctrl+C to stop.');
}

export { runAnalysis, agentState, metrics, alerts, MarketAnalyzer };
main().catch(console.error);
