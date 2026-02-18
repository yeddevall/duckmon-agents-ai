// DUCKMON WHALE OBSERVER v2.0 - Advanced Whale Tracking & Network Intelligence
import { formatEther, parseAbiItem } from 'viem';
import { contracts, TOKENS, WHALE_CONFIG, ERC20_ABI } from '../shared/config.js';
import { createLogger, formatNumber, formatAddress, formatUptime } from '../shared/logger.js';
import { createClients, getPublicClient, registerAgent, postSignal } from '../shared/wallet.js';
import { fetchPrice } from '../shared/priceService.js';
import { sendSignal } from '../shared/websocketClient.js';
import AI from '../shared/aiModule.js';

const AGENT_NAME = 'Whale Observer v2.0';
const log = createLogger('Whale');

const CONFIG = {
    SCAN_INTERVAL: 300000,       // 5 min whale scan
    NETWORK_INTERVAL: 120000,    // 2 min network check
    STATUS_INTERVAL: 600000,     // 10 min status display
    LOOKBACK_BLOCKS: 500n,       // Transfer event lookback
    MIN_TRANSFER_DUCK: 1_000_000, // Min DUCK for whale alert
};

// State
const trackedWallets = new Map();
let lastScannedBlock = 0n;
let isRegistered = false;

const networkStats = {
    currentBlock: 0,
    avgGasGwei: 0,
    avgTxPerBlock: 0,
    txCount24h: 0,
    lastUpdate: null,
};

const performance = {
    totalAlerts: 0,
    whaleAlerts: 0,
    networkAlerts: 0,
    transfersScanned: 0,
    startTime: Date.now(),
};

// ═══════════════════════════════════════════════════════════════════
// TRANSFER EVENT SCANNING (Real whale discovery)
// ═══════════════════════════════════════════════════════════════════

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

async function scanTransferEvents() {
    const publicClient = getPublicClient();

    try {
        const currentBlock = await publicClient.getBlockNumber();

        // On first run, start from recent blocks
        if (lastScannedBlock === 0n) {
            lastScannedBlock = currentBlock - CONFIG.LOOKBACK_BLOCKS;
        }

        // Don't re-scan same blocks
        if (currentBlock <= lastScannedBlock) return [];

        const fromBlock = lastScannedBlock + 1n;
        const toBlock = currentBlock;

        log.info(`Scanning blocks ${fromBlock} to ${toBlock} for DUCK transfers...`);

        const logs = await publicClient.getLogs({
            address: contracts.DUCK_TOKEN,
            event: TRANSFER_EVENT,
            fromBlock,
            toBlock,
        });

        lastScannedBlock = toBlock;
        performance.transfersScanned += logs.length;

        // Filter large transfers
        const whaleTransfers = [];
        for (const transferLog of logs) {
            const value = parseFloat(formatEther(transferLog.args.value));
            if (value >= CONFIG.MIN_TRANSFER_DUCK) {
                whaleTransfers.push({
                    from: transferLog.args.from,
                    to: transferLog.args.to,
                    amount: value,
                    blockNumber: Number(transferLog.blockNumber),
                    txHash: transferLog.transactionHash,
                });

                // Track both wallets
                trackWallet(transferLog.args.from, -value);
                trackWallet(transferLog.args.to, value);
            }
        }

        if (whaleTransfers.length > 0) {
            log.whale(`Found ${whaleTransfers.length} whale transfers in ${Number(toBlock - fromBlock)} blocks`);
        }

        return whaleTransfers;
    } catch (error) {
        log.warning(`Transfer scan error: ${error.message}`);
        return [];
    }
}

function trackWallet(address, balanceChange) {
    const existing = trackedWallets.get(address) || {
        address,
        totalIn: 0,
        totalOut: 0,
        netFlow: 0,
        txCount: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        profile: 'UNKNOWN',
    };

    if (balanceChange > 0) existing.totalIn += balanceChange;
    else existing.totalOut += Math.abs(balanceChange);

    existing.netFlow = existing.totalIn - existing.totalOut;
    existing.txCount++;
    existing.lastSeen = Date.now();
    existing.profile = classifyWalletProfile(existing);

    trackedWallets.set(address, existing);
}

function classifyWalletProfile(wallet) {
    const { totalIn, totalOut, txCount } = wallet;

    if (txCount <= 1) return 'NEW';
    if (totalIn > 0 && totalOut === 0) return 'ACCUMULATOR';
    if (totalOut > 0 && totalIn === 0) return 'DISTRIBUTOR';

    const ratio = totalIn / (totalOut || 1);
    if (ratio > 2) return 'ACCUMULATOR';
    if (ratio < 0.5) return 'DISTRIBUTOR';
    if (txCount > 5) return 'TRADER';
    return 'MIXED';
}

// ═══════════════════════════════════════════════════════════════════
// WALLET ANALYSIS
// ═══════════════════════════════════════════════════════════════════

async function getTokenBalance(walletAddress) {
    try {
        const publicClient = getPublicClient();
        const balance = await publicClient.readContract({
            address: contracts.DUCK_TOKEN,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [walletAddress],
        });
        return parseFloat(formatEther(balance));
    } catch {
        return 0;
    }
}

function classifyWhaleActivity(transfer) {
    const { amount } = transfer;
    const totalSupply = TOKENS.DUCK.totalSupply;
    const percentOfSupply = (amount / totalSupply) * 100;

    if (percentOfSupply >= WHALE_CONFIG.MEGA_TRANSFER_THRESHOLD) {
        return { type: 'MEGA_TRANSFER', impact: 'CRITICAL', sentiment: 'VERY_HIGH_IMPACT' };
    } else if (percentOfSupply >= WHALE_CONFIG.LARGE_TRANSFER_THRESHOLD) {
        return { type: 'LARGE_TRANSFER', impact: 'HIGH', sentiment: 'HIGH_IMPACT' };
    }
    return { type: 'WHALE_TRANSFER', impact: 'MODERATE', sentiment: 'MODERATE_IMPACT' };
}

// ═══════════════════════════════════════════════════════════════════
// NETWORK MONITORING (Fixed gas price bug)
// ═══════════════════════════════════════════════════════════════════

async function getNetworkStats() {
    try {
        const publicClient = getPublicClient();
        const [blockNumber, gasPrice] = await Promise.all([
            publicClient.getBlockNumber(),
            publicClient.getGasPrice(),
        ]);

        // FIX: gasPrice is already in wei, convert to gwei properly
        // Old bug: formatEther(gasPrice * BigInt(1e9)) = nonsensical value
        const gasPriceGwei = Number(gasPrice) / 1e9;

        // Sample recent blocks
        const recentBlocks = [];
        for (let i = 0; i < 5; i++) {
            try {
                const block = await publicClient.getBlock({ blockNumber: blockNumber - BigInt(i) });
                recentBlocks.push(block);
            } catch { break; }
        }

        const avgTxPerBlock = recentBlocks.length > 0
            ? recentBlocks.reduce((sum, b) => sum + b.transactions.length, 0) / recentBlocks.length
            : 0;

        networkStats.currentBlock = Number(blockNumber);
        networkStats.avgGasGwei = gasPriceGwei;
        networkStats.avgTxPerBlock = Math.round(avgTxPerBlock);
        networkStats.lastUpdate = Date.now();

        // Monad: ~1 second blocks
        const blocksPerDay = 86400;
        networkStats.txCount24h = Math.round(avgTxPerBlock * blocksPerDay);

        return networkStats;
    } catch (error) {
        log.error(`Network stats error: ${error.message}`);
        return networkStats;
    }
}

function assessNetworkHealth() {
    const { avgGasGwei, avgTxPerBlock } = networkStats;

    let congestion = 'LOW';
    let healthScore = 100;

    if (avgGasGwei > 100) { congestion = 'CRITICAL'; healthScore = 40; }
    else if (avgGasGwei > 50) { congestion = 'HIGH'; healthScore = 60; }
    else if (avgGasGwei > 25) { congestion = 'MODERATE'; healthScore = 80; }

    if (avgTxPerBlock > 1000) healthScore += 10;

    return {
        congestion,
        healthScore: Math.min(100, healthScore),
        recommendation: congestion === 'LOW' ? 'OPTIMAL' : 'WAIT_FOR_LOWER_GAS',
    };
}

// ═══════════════════════════════════════════════════════════════════
// ALERT POSTING
// ═══════════════════════════════════════════════════════════════════

async function postWhaleAlert(transfer, activity) {
    const fromWallet = trackedWallets.get(transfer.from);
    const toWallet = trackedWallets.get(transfer.to);

    const reason = [
        `WHALE ${activity.type}`,
        `${formatAddress(transfer.from)} -> ${formatAddress(transfer.to)}`,
        `${formatNumber(transfer.amount)} DUCK`,
        `From: ${fromWallet?.profile || 'UNKNOWN'}`,
        `To: ${toWallet?.profile || 'UNKNOWN'}`,
        `Impact: ${activity.impact}`,
    ].join(' | ');

    // Determine signal type from receiver profile
    let signalType = 'HOLD';
    if (toWallet?.profile === 'ACCUMULATOR') signalType = 'BUY';
    else if (fromWallet?.profile === 'DISTRIBUTOR') signalType = 'SELL';

    let confidence = 50;
    if (activity.impact === 'CRITICAL') confidence = 90;
    else if (activity.impact === 'HIGH') confidence = 75;
    else confidence = 60;

    log.whale(`${activity.type}: ${formatNumber(transfer.amount)} DUCK`);
    console.log(`    ${formatAddress(transfer.from)} -> ${formatAddress(transfer.to)}`);

    // AI analysis
    if (AI.isAIEnabled()) {
        try {
            const priceData = await fetchPrice();
            const aiResult = await AI.analyzeWhaleBehavior({
                transferAmount: transfer.amount,
                fromProfile: fromWallet?.profile || 'UNKNOWN',
                toProfile: toWallet?.profile || 'UNKNOWN',
                totalSupplyPercent: (transfer.amount / TOKENS.DUCK.totalSupply) * 100,
                currentPrice: priceData?.price || 0,
                recentWhaleCount: performance.whaleAlerts,
            });
            if (aiResult) {
                log.ai(`AI Whale Analysis: ${aiResult.intent || 'N/A'} - Impact: ${aiResult.priceImpact || 'N/A'}`);
                if (aiResult.recommendation) {
                    signalType = aiResult.recommendation === 'BUY' ? 'BUY' : aiResult.recommendation === 'SELL' ? 'SELL' : signalType;
                }
            }
        } catch (err) {
            log.warning(`AI whale analysis failed: ${err.message}`);
        }
    }

    if (isRegistered) {
        // Fixed: use actual price instead of 0
        const priceForSignal = (await fetchPrice())?.price || 0;
        await postSignal(signalType, confidence, priceForSignal, reason, log);
    }

    // Send to ws-server for frontend
    try {
        await sendSignal({
            agentName: AGENT_NAME,
            type: signalType,
            confidence,
            price: (await fetchPrice())?.price || 0,
            category: 'whale',
            whaleType: activity.type,
            impact: activity.impact,
            from: transfer.from,
            to: transfer.to,
            amount: transfer.amount,
            fromProfile: fromWallet?.profile || 'UNKNOWN',
            toProfile: toWallet?.profile || 'UNKNOWN',
        });
    } catch (e) { /* ws-server may be offline */ }

    performance.whaleAlerts++;
    performance.totalAlerts++;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ANALYSIS LOOPS
// ═══════════════════════════════════════════════════════════════════

async function runWhaleAnalysis() {
    log.separator();
    log.info('Starting whale scan...');

    const transfers = await scanTransferEvents();

    for (const transfer of transfers) {
        const activity = classifyWhaleActivity(transfer);
        if (activity.impact !== 'NONE') {
            await postWhaleAlert(transfer, activity);
        }
    }

    // Display top wallets
    if (trackedWallets.size > 0) {
        const topWhales = [...trackedWallets.values()]
            .filter(w => Math.abs(w.netFlow) > CONFIG.MIN_TRANSFER_DUCK)
            .sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow))
            .slice(0, 5);

        if (topWhales.length > 0) {
            console.log('  TOP TRACKED WALLETS:');
            for (const w of topWhales) {
                const flowDir = w.netFlow >= 0 ? '\x1b[32m+' : '\x1b[31m';
                console.log(`    ${formatAddress(w.address)} | ${flowDir}${formatNumber(w.netFlow)}\x1b[0m DUCK | ${w.profile} | ${w.txCount} txs`);
            }
        }
    }

    log.info(`Tracked: ${trackedWallets.size} wallets | Scanned: ${performance.transfersScanned} transfers`);
}

async function runNetworkAnalysis() {
    await getNetworkStats();
    const health = assessNetworkHealth();

    log.network(`Block: ${networkStats.currentBlock.toLocaleString()} | Gas: ${networkStats.avgGasGwei.toFixed(2)} gwei | TX/Block: ${networkStats.avgTxPerBlock} | ${health.congestion}`);
}

async function printStatus() {
    log.separator();
    log.banner('DUCKMON WHALE OBSERVER v2.0 - Status');
    console.log(`  Status:       Running`);
    console.log(`  Registered:   ${isRegistered ? 'YES' : 'NO'}`);
    console.log(`  Uptime:       ${formatUptime(Date.now() - performance.startTime)}`);
    log.separator();
    console.log(`  Tracked:      ${trackedWallets.size} wallets`);
    console.log(`  Transfers:    ${performance.transfersScanned} scanned`);
    console.log(`  Whale Alerts: ${performance.whaleAlerts}`);
    console.log(`  Total Alerts: ${performance.totalAlerts}`);
    log.separator();
    console.log(`  Block:        ${networkStats.currentBlock.toLocaleString()}`);
    console.log(`  Gas:          ${networkStats.avgGasGwei.toFixed(2)} gwei`);
    console.log(`  TX/Block:     ${networkStats.avgTxPerBlock}`);
    console.log(`  Est 24h TX:   ${formatNumber(networkStats.txCount24h)}`);
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DUCKMON WHALE OBSERVER v2.0                        ║
║     Advanced Whale Tracking & Network Intelligence           ║
║              Powered by Monad                                ║
╚══════════════════════════════════════════════════════════════╝`);

    log.info(`Starting ${AGENT_NAME}...`);

    const { account } = createClients();
    if (account) log.success(`Wallet: ${account.address.slice(0, 10)}...`);
    isRegistered = await registerAgent(AGENT_NAME, log);

    // Initial scans
    await runNetworkAnalysis();
    await runWhaleAnalysis();
    await printStatus();

    // Schedule recurring
    setInterval(async () => {
        try { await runWhaleAnalysis(); }
        catch (err) { log.error(`Whale scan error: ${err.message}`); }
    }, CONFIG.SCAN_INTERVAL);

    setInterval(async () => {
        try { await runNetworkAnalysis(); }
        catch (err) { log.error(`Network check error: ${err.message}`); }
    }, CONFIG.NETWORK_INTERVAL);

    setInterval(async () => {
        try { await printStatus(); }
        catch (err) { log.error(`Status error: ${err.message}`); }
    }, CONFIG.STATUS_INTERVAL);

    log.success('Whale Observer monitoring the Monad network!');
}

export { runWhaleAnalysis, runNetworkAnalysis, performance, trackedWallets };
main().catch(console.error);
