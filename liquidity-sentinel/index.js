// DUCKMON LIQUIDITY SENTINEL v1.0 - Bonding Curve & Liquidity Health Monitor
import { formatEther, parseAbiItem } from 'viem';
import { contracts, TOKENS, ERC20_ABI } from '../shared/config.js';
import { createLogger, formatPrice, formatNumber, formatUptime, getHealthBar } from '../shared/logger.js';
import { createClients, getPublicClient, registerAgent, postSignal } from '../shared/wallet.js';
import { fetchPrice, getBondingProgress } from '../shared/priceService.js';
import AI from '../shared/aiModule.js';

const AGENT_NAME = 'Liquidity Sentinel v1.0';
const log = createLogger('Liquid');

const CONFIG = {
    CHECK_INTERVAL: 600000,     // 10 min
    GRADUATION_WARN: 85,        // Alert when bonding curve > 85%
    LP_CHANGE_ALERT: 10,        // Alert when LP changes > 10%
    MIN_LIQUIDITY_USD: 5000,    // Minimum healthy liquidity
    RUG_RISK_THRESHOLD: 70,     // Rug risk score threshold
};

let isRegistered = false;
let previousState = null;

const performance = {
    totalChecks: 0,
    alerts: 0,
    startTime: Date.now(),
};

const metrics = {
    bondingProgress: 0,
    isGraduated: false,
    liquidityUsd: 0,
    liquidityChange: 0,
    rugRiskScore: 0,
    priceImpact2Pct: 0,
    lpHealth: 'UNKNOWN',
};

// ═══════════════════════════════════════════════════════════════════
// LIQUIDITY ANALYSIS
// ═══════════════════════════════════════════════════════════════════

async function analyzeLiquidity() {
    const priceData = await fetchPrice();
    if (!priceData) return null;

    const bonding = await getBondingProgress();

    // Get LP info from DexScreener data
    const liquidity = priceData.liquidity || 0;
    const volume24h = priceData.volume || 0;

    // Calculate liquidity change from previous check
    let liquidityChange = 0;
    if (previousState && previousState.liquidity > 0) {
        liquidityChange = ((liquidity - previousState.liquidity) / previousState.liquidity) * 100;
    }

    // LP health assessment
    const lpHealth = assessLPHealth(liquidity, volume24h, liquidityChange);

    // Rug risk scoring
    const rugRisk = calculateRugRisk(liquidity, volume24h, bonding, priceData);

    // Price impact estimation (how much 2% of liquidity would move the price)
    const priceImpact2Pct = liquidity > 0 ? (volume24h * 0.02 / liquidity) * 100 : 0;

    const state = {
        price: priceData.price,
        liquidity,
        volume24h,
        bondingProgress: bonding.progress,
        isGraduated: bonding.isGraduated,
        liquidityChange,
        lpHealth,
        rugRisk,
        priceImpact2Pct,
        buys24h: priceData.buys24h || 0,
        sells24h: priceData.sells24h || 0,
        timestamp: Date.now(),
    };

    previousState = state;
    return state;
}

function assessLPHealth(liquidity, volume24h, liquidityChange) {
    if (liquidity < CONFIG.MIN_LIQUIDITY_USD) return 'CRITICAL';
    if (liquidityChange < -CONFIG.LP_CHANGE_ALERT) return 'DECLINING';

    const volumeToLiquidity = volume24h / (liquidity || 1);
    if (volumeToLiquidity > 2) return 'HIGH_USAGE';
    if (volumeToLiquidity > 0.5) return 'HEALTHY';
    if (volumeToLiquidity > 0.1) return 'STABLE';
    return 'LOW_ACTIVITY';
}

function calculateRugRisk(liquidity, volume24h, bonding, priceData) {
    let risk = 0;

    // Low liquidity = higher risk
    if (liquidity < 1000) risk += 35;
    else if (liquidity < 5000) risk += 20;
    else if (liquidity < 10000) risk += 10;

    // Not graduated = higher risk (bonding curve can be manipulated)
    if (!bonding.isGraduated) risk += 15;

    // High sell pressure
    const sells = priceData.sells24h || 0;
    const buys = priceData.buys24h || 0;
    if (sells > 0 && buys > 0) {
        const ratio = sells / buys;
        if (ratio > 3) risk += 25;
        else if (ratio > 2) risk += 15;
        else if (ratio > 1.5) risk += 5;
    }

    // Sharp negative price movement
    const priceChange = priceData.priceChange24h || 0;
    if (priceChange < -30) risk += 20;
    else if (priceChange < -15) risk += 10;
    else if (priceChange < -5) risk += 5;

    // Volume anomalies (very low volume = potentially abandoned)
    if (volume24h < 100) risk += 10;

    return Math.min(100, Math.max(0, risk));
}

// ═══════════════════════════════════════════════════════════════════
// ALERT GENERATION
// ═══════════════════════════════════════════════════════════════════

function generateAlerts(state) {
    const alerts = [];

    // Bonding curve graduation proximity
    if (!state.isGraduated && state.bondingProgress >= CONFIG.GRADUATION_WARN) {
        alerts.push({
            level: 'CRITICAL',
            type: 'GRADUATION',
            message: `Bonding curve at ${state.bondingProgress.toFixed(1)}% - graduation imminent!`,
        });
    }

    // Liquidity drain
    if (state.liquidityChange < -CONFIG.LP_CHANGE_ALERT) {
        alerts.push({
            level: 'WARNING',
            type: 'LP_DRAIN',
            message: `Liquidity dropped ${Math.abs(state.liquidityChange).toFixed(1)}%`,
        });
    }

    // Rug risk
    if (state.rugRisk >= CONFIG.RUG_RISK_THRESHOLD) {
        alerts.push({
            level: 'CRITICAL',
            type: 'RUG_RISK',
            message: `High rug risk score: ${state.rugRisk}/100`,
        });
    }

    // Low liquidity
    if (state.liquidity < CONFIG.MIN_LIQUIDITY_USD) {
        alerts.push({
            level: 'WARNING',
            type: 'LOW_LIQUIDITY',
            message: `Liquidity below minimum: $${formatNumber(state.liquidity)}`,
        });
    }

    // High price impact
    if (state.priceImpact2Pct > 5) {
        alerts.push({
            level: 'WARNING',
            type: 'SLIPPAGE',
            message: `High slippage risk: 2% trade = ${state.priceImpact2Pct.toFixed(1)}% price impact`,
        });
    }

    return alerts;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ANALYSIS LOOP
// ═══════════════════════════════════════════════════════════════════

async function runAnalysis() {
    log.separator();
    log.info('Running liquidity analysis...');

    const state = await analyzeLiquidity();
    if (!state) { log.error('No data available'); return null; }

    performance.totalChecks++;

    // Update metrics
    metrics.bondingProgress = state.bondingProgress;
    metrics.isGraduated = state.isGraduated;
    metrics.liquidityUsd = state.liquidity;
    metrics.liquidityChange = state.liquidityChange;
    metrics.rugRiskScore = state.rugRisk;
    metrics.priceImpact2Pct = state.priceImpact2Pct;
    metrics.lpHealth = state.lpHealth;

    // Generate alerts
    const newAlerts = generateAlerts(state);
    performance.alerts += newAlerts.length;

    // AI Enhancement
    let aiAnalysis = null;
    if (AI.isAIEnabled()) {
        try {
            aiAnalysis = await AI.generateLiquidityAnalysis({
                liquidity: state.liquidity,
                volume24h: state.volume24h,
                bondingProgress: state.bondingProgress,
                isGraduated: state.isGraduated,
                rugRiskScore: state.rugRisk,
                lpHealth: state.lpHealth,
                buySellRatio: state.buys24h / (state.sells24h || 1),
                priceChange24h: ((state.price - (previousState?.price || state.price)) / state.price) * 100,
            });
            if (aiAnalysis) {
                log.ai(`AI Liquidity: Risk=${aiAnalysis.riskLevel || 'N/A'} | ${aiAnalysis.recommendation || 'N/A'}`);
            }
        } catch (err) {
            log.warning(`AI unavailable: ${err.message}`);
        }
    }

    // Display
    log.banner('DUCKMON LIQUIDITY SENTINEL v1.0', aiAnalysis ? 'AI-ENHANCED' : null);
    console.log(`  Price:         ${formatPrice(state.price)} MON`);
    console.log(`  Liquidity:     $${formatNumber(state.liquidity)} (${state.liquidityChange >= 0 ? '+' : ''}${state.liquidityChange.toFixed(1)}%)`);
    console.log(`  Volume 24h:    $${formatNumber(state.volume24h)}`);
    console.log(`  LP Health:     ${state.lpHealth}`);
    log.separator();

    console.log('  BONDING CURVE:');
    console.log(`    Progress:    ${getHealthBar(state.bondingProgress)} ${state.bondingProgress.toFixed(1)}%`);
    console.log(`    Graduated:   ${state.isGraduated ? 'YES' : 'NO'}`);
    log.separator();

    console.log('  RISK ASSESSMENT:');
    console.log(`    Rug Risk:    ${getHealthBar(100 - state.rugRisk)} ${state.rugRisk}/100`);
    console.log(`    Slippage:    ${state.priceImpact2Pct.toFixed(2)}% (2% trade)`);
    console.log(`    Buy/Sell:    ${state.buys24h}/${state.sells24h}`);

    if (aiAnalysis) {
        log.separator();
        console.log('  AI ANALYSIS:');
        console.log(`    Risk:        ${aiAnalysis.riskLevel || 'N/A'}`);
        console.log(`    Outlook:     ${aiAnalysis.recommendation || 'N/A'}`);
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

    console.log(`  Stats: ${performance.totalChecks} checks | ${performance.alerts} alerts`);
    console.log(`  Uptime: ${formatUptime(Date.now() - performance.startTime)}`);

    // Post to blockchain
    if (isRegistered) {
        const signalType = state.rugRisk >= 70 ? 'SELL' : state.lpHealth === 'HEALTHY' ? 'BUY' : 'HOLD';
        const confidence = Math.round(Math.min(50 + Math.abs(50 - state.rugRisk) * 0.8, 90));

        const reason = [
            `LIQUIDITY`,
            `Progress:${state.bondingProgress.toFixed(0)}%`,
            `LP:$${formatNumber(state.liquidity)}`,
            `Risk:${state.rugRisk}`,
            `Health:${state.lpHealth}`,
            aiAnalysis ? `AI:${aiAnalysis.riskLevel || 'N/A'}` : null,
        ].filter(Boolean).join(' | ');

        if (confidence >= 55) {
            await postSignal(signalType, confidence, state.price, reason, log);
        }
    }

    return state;
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DUCKMON LIQUIDITY SENTINEL v1.0                    ║
║    Bonding Curve & Liquidity Health Monitoring                ║
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

    log.success('Liquidity Sentinel monitoring!');
}

export { runAnalysis, performance, metrics };
main().catch(console.error);
