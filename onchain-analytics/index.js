// DUCKMON ON-CHAIN ANALYTICS v1.0 - Deep On-Chain Analysis
import { formatEther, parseAbiItem } from 'viem';
import { contracts, TOKENS, ERC20_ABI } from '../shared/config.js';
import { createLogger, formatNumber, formatAddress, formatUptime, getHealthBar } from '../shared/logger.js';
import { createClients, getPublicClient, registerAgent, postSignal } from '../shared/wallet.js';
import { fetchPrice } from '../shared/priceService.js';
import { sendSignal } from '../shared/websocketClient.js';
import AI from '../shared/aiModule.js';

const AGENT_NAME = 'On-Chain Analytics v1.0';
const log = createLogger('OnChn');

const CONFIG = {
    SCAN_INTERVAL: 600000,      // 10 min
    LOOKBACK_BLOCKS: 1000n,     // Blocks to scan
    VELOCITY_PERIOD: 3600000,   // 1 hour for velocity
    CIRCULAR_DETECTION_DEPTH: 3,
};

let lastScannedBlock = 0n;
let isRegistered = false;

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// State
const holderData = {
    uniqueAddresses: new Set(),
    newAddresses: new Set(),
    activeAddresses: new Set(),
    previousCount: 0,
    growth: 0,
};

const transferData = {
    totalTransfers: 0,
    totalVolume: 0,
    buys: 0,    // transfers TO unique wallets
    sells: 0,   // transfers FROM unique wallets
    recentTransfers: [],
};

const analytics = {
    velocity: 0,            // transfers per hour per supply
    buySellRatio: 1,
    avgTransferSize: 0,
    concentrationIndex: 0,  // How concentrated holdings are
    organicScore: 0,        // 0-100, higher = more organic
};

const performance = {
    totalScans: 0,
    signals: 0,
    blocksScanned: 0,
    startTime: Date.now(),
};

// Known contract addresses (not individual holders)
const KNOWN_CONTRACTS = new Set([
    contracts.BONDING_CURVE_ROUTER?.toLowerCase(),
    contracts.DEX_ROUTER?.toLowerCase(),
    contracts.DUCK_TOKEN?.toLowerCase(),
    '0x0000000000000000000000000000000000000000',
].filter(Boolean));

// ═══════════════════════════════════════════════════════════════════
// TRANSFER SCANNING & ANALYSIS
// ═══════════════════════════════════════════════════════════════════

async function scanAndAnalyze() {
    const publicClient = getPublicClient();

    try {
        const currentBlock = await publicClient.getBlockNumber();

        if (lastScannedBlock === 0n) {
            lastScannedBlock = currentBlock - CONFIG.LOOKBACK_BLOCKS;
        }

        if (currentBlock <= lastScannedBlock) return null;

        const fromBlock = lastScannedBlock + 1n;
        const toBlock = currentBlock;

        log.info(`Scanning blocks ${fromBlock}-${toBlock}...`);

        const logs = await publicClient.getLogs({
            address: contracts.DUCK_TOKEN,
            event: TRANSFER_EVENT,
            fromBlock,
            toBlock,
        });

        lastScannedBlock = toBlock;
        performance.blocksScanned += Number(toBlock - fromBlock);

        // Process transfers
        const transfers = [];
        const periodAddresses = new Set();
        let periodVolume = 0;
        let periodBuys = 0;
        let periodSells = 0;

        for (const transferLog of logs) {
            const from = transferLog.args.from.toLowerCase();
            const to = transferLog.args.to.toLowerCase();
            const value = parseFloat(formatEther(transferLog.args.value));

            if (value <= 0) continue;

            transfers.push({ from, to, value, block: Number(transferLog.blockNumber) });
            periodVolume += value;
            transferData.totalTransfers++;
            transferData.totalVolume += value;

            // Track addresses (exclude known contracts)
            if (!KNOWN_CONTRACTS.has(to)) {
                holderData.uniqueAddresses.add(to);
                periodAddresses.add(to);
            }
            if (!KNOWN_CONTRACTS.has(from)) {
                holderData.uniqueAddresses.add(from);
                periodAddresses.add(from);
            }

            // Classify as buy or sell based on flow direction
            const fromIsContract = KNOWN_CONTRACTS.has(from);
            const toIsContract = KNOWN_CONTRACTS.has(to);

            if (fromIsContract && !toIsContract) {
                periodBuys++;
                transferData.buys++;
            } else if (!fromIsContract && toIsContract) {
                periodSells++;
                transferData.sells++;
            }
        }

        // Update holder growth
        const currentCount = holderData.uniqueAddresses.size;
        holderData.growth = currentCount - holderData.previousCount;
        holderData.previousCount = currentCount;
        holderData.activeAddresses = periodAddresses;

        // Store recent transfers for circular detection
        transferData.recentTransfers = transfers.slice(-200);

        // Calculate analytics
        const blocksScanned = Number(toBlock - fromBlock);
        const periodSeconds = blocksScanned; // ~1s blocks on Monad
        const hoursElapsed = periodSeconds / 3600;
        const totalSupply = TOKENS.DUCK.totalSupply;

        analytics.velocity = hoursElapsed > 0 ? (transfers.length / hoursElapsed) / totalSupply * 1e9 : 0;
        analytics.buySellRatio = periodSells > 0 ? periodBuys / periodSells : periodBuys > 0 ? 2 : 1;
        analytics.avgTransferSize = transfers.length > 0 ? periodVolume / transfers.length : 0;
        analytics.organicScore = calculateOrganicScore(transfers);

        return {
            transfers: transfers.length,
            volume: periodVolume,
            buys: periodBuys,
            sells: periodSells,
            uniqueHolders: currentCount,
            holderGrowth: holderData.growth,
            activeAddresses: periodAddresses.size,
            blocksScanned,
        };
    } catch (error) {
        log.warning(`Scan error: ${error.message}`);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════
// ORGANIC VOLUME DETECTION
// ═══════════════════════════════════════════════════════════════════

function calculateOrganicScore(transfers) {
    if (transfers.length < 5) return 50;

    let score = 70; // Start optimistic

    // Check for circular transfers (A->B->C->A wash trading)
    const addressFlows = new Map();
    for (const tx of transfers) {
        if (!addressFlows.has(tx.from)) addressFlows.set(tx.from, new Set());
        addressFlows.get(tx.from).add(tx.to);
    }

    let circularCount = 0;
    for (const [addr, targets] of addressFlows) {
        for (const target of targets) {
            const targetFlows = addressFlows.get(target);
            if (targetFlows) {
                // Direct circular: A->B->A
                if (targetFlows.has(addr)) circularCount++;
                // Indirect: A->B->C->A
                for (const thirdAddr of targetFlows) {
                    const thirdFlows = addressFlows.get(thirdAddr);
                    if (thirdFlows && thirdFlows.has(addr)) circularCount++;
                }
            }
        }
    }

    const circularRatio = circularCount / (transfers.length || 1);
    if (circularRatio > 0.3) score -= 30;
    else if (circularRatio > 0.15) score -= 15;
    else if (circularRatio > 0.05) score -= 5;

    // Check transfer size distribution (organic = varied sizes)
    const sizes = transfers.map(t => t.value);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sizeVariance = sizes.reduce((sum, s) => sum + Math.pow(s - avgSize, 2), 0) / sizes.length;
    const sizeCV = Math.sqrt(sizeVariance) / (avgSize || 1); // Coefficient of variation

    if (sizeCV < 0.1) score -= 15; // Very uniform sizes = suspicious
    else if (sizeCV > 0.5) score += 5; // Varied sizes = organic

    // Check unique address ratio
    const uniqueAddresses = new Set([...transfers.map(t => t.from), ...transfers.map(t => t.to)]);
    const addressRatio = uniqueAddresses.size / (transfers.length * 2);
    if (addressRatio < 0.1) score -= 20; // Few unique addresses for many transfers
    else if (addressRatio > 0.3) score += 5;

    return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ANALYSIS LOOP
// ═══════════════════════════════════════════════════════════════════

async function runAnalysis() {
    log.separator();
    log.info('Running on-chain analysis...');

    const scanResult = await scanAndAnalyze();
    if (!scanResult) { log.error('Scan failed'); return null; }

    const priceData = await fetchPrice();
    performance.totalScans++;

    // AI Enhancement
    let aiInsight = null;
    if (AI.isAIEnabled()) {
        try {
            aiInsight = await AI.generateOnChainInsight({
                uniqueHolders: scanResult.uniqueHolders,
                holderGrowth: scanResult.holderGrowth,
                buySellRatio: analytics.buySellRatio,
                velocity: analytics.velocity,
                organicScore: analytics.organicScore,
                avgTransferSize: analytics.avgTransferSize,
                totalVolume: scanResult.volume,
                activeAddresses: scanResult.activeAddresses,
            });
            if (aiInsight) {
                log.ai(`AI On-Chain: ${aiInsight.healthScore || 'N/A'}/100 - ${aiInsight.outlook || 'N/A'}`);
            }
        } catch (err) {
            log.warning(`AI unavailable: ${err.message}`);
        }
    }

    // Display
    log.banner('DUCKMON ON-CHAIN ANALYTICS v1.0', aiInsight ? 'AI-ENHANCED' : null);
    if (priceData) console.log(`  Price:           ${priceData.price.toFixed(8)} MON`);
    log.separator();

    console.log('  HOLDER METRICS:');
    console.log(`    Unique:        ${formatNumber(scanResult.uniqueHolders)}`);
    console.log(`    Growth:        ${scanResult.holderGrowth >= 0 ? '+' : ''}${scanResult.holderGrowth}`);
    console.log(`    Active (period): ${scanResult.activeAddresses}`);
    log.separator();

    console.log('  TRANSFER METRICS:');
    console.log(`    Transfers:     ${scanResult.transfers} (${scanResult.blocksScanned} blocks)`);
    console.log(`    Volume:        ${formatNumber(scanResult.volume)} DUCK`);
    console.log(`    Avg Size:      ${formatNumber(analytics.avgTransferSize)} DUCK`);
    console.log(`    Buys:          ${scanResult.buys} | Sells: ${scanResult.sells}`);
    console.log(`    Buy/Sell:      ${analytics.buySellRatio.toFixed(2)}`);
    log.separator();

    console.log('  ADVANCED METRICS:');
    console.log(`    Velocity:      ${analytics.velocity.toFixed(4)}`);
    console.log(`    Organic Score: ${getHealthBar(analytics.organicScore)} ${analytics.organicScore}/100`);

    if (aiInsight) {
        log.separator();
        console.log('  AI INSIGHT:');
        console.log(`    Health:        ${aiInsight.healthScore || 'N/A'}/100`);
        console.log(`    Outlook:       ${aiInsight.outlook || 'N/A'}`);
        console.log(`    Notable:       ${aiInsight.notable || 'N/A'}`);
    }
    log.separator();

    console.log(`  Total: ${transferData.totalTransfers} transfers | ${formatNumber(transferData.totalVolume)} DUCK volume`);
    console.log(`  Uptime: ${formatUptime(Date.now() - performance.startTime)}`);

    // Post to blockchain
    if (isRegistered) {
        const signalType = analytics.buySellRatio > 1.5 && analytics.organicScore > 60 ? 'BUY' :
            analytics.buySellRatio < 0.7 ? 'SELL' : 'HOLD';
        const confidence = Math.round(Math.min(50 + analytics.organicScore * 0.3 + Math.abs(analytics.buySellRatio - 1) * 15, 90));

        const reason = [
            `ONCHAIN`,
            `Holders:${scanResult.holderGrowth >= 0 ? '+' : ''}${scanResult.holderGrowth}`,
            `B/S:${analytics.buySellRatio.toFixed(1)}`,
            `Velocity:${analytics.velocity.toFixed(2)}`,
            `Organic:${analytics.organicScore}`,
            signalType,
            aiInsight ? `AI:${aiInsight.outlook || 'N/A'}` : null,
        ].filter(Boolean).join(' | ');

        if (confidence >= 55) {
            await postSignal(signalType, confidence, priceData?.price || 0, reason, log);
            performance.signals++;
        }
    }

    // Send to ws-server for frontend
    try {
        await sendSignal({
            agentName: AGENT_NAME,
            type: analytics.buySellRatio > 1.5 && analytics.organicScore > 60 ? 'BUY' :
                analytics.buySellRatio < 0.7 ? 'SELL' : 'HOLD',
            confidence: Math.round(Math.min(50 + analytics.organicScore * 0.3 + Math.abs(analytics.buySellRatio - 1) * 15, 95)),
            price: priceData?.price || 0,
            category: 'onchain',
            uniqueHolders: scanResult.uniqueHolders,
            holderGrowth: scanResult.holderGrowth,
            activeAddresses: scanResult.activeAddresses,
            transfers: scanResult.transfers,
            volume: scanResult.volume,
            buys: scanResult.buys,
            sells: scanResult.sells,
            buySellRatio: analytics.buySellRatio,
            velocity: analytics.velocity,
            organicScore: analytics.organicScore,
            avgTransferSize: analytics.avgTransferSize,
            aiInsight: aiInsight || null,
        });
    } catch (e) { /* ws-server may be offline */ }

    return { scanResult, analytics: { ...analytics }, aiInsight };
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DUCKMON ON-CHAIN ANALYTICS v1.0                    ║
║         Deep On-Chain Analysis & Intelligence                ║
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
    }, CONFIG.SCAN_INTERVAL);

    log.success('On-Chain Analytics monitoring!');
}

export { runAnalysis, performance, analytics, holderData };
main().catch(console.error);
