import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadMainnet, contracts, TOKENS, WHALE_CONFIG, ERC20_ABI, DUCK_SIGNALS_ABI } from './config.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                      🐋 DUCKMON WHALE OBSERVER v1.0                           ║
// ║              Advanced Whale Tracking & Network Intelligence                    ║
// ║                           Powered by Monad                                     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const AGENT_NAME = 'Whale Observer v1.0';
const AGENT_VERSION = '1.0.0';

// ══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// Tracked wallets with historical data
const trackedWallets = new Map();

// Network statistics
const networkStats = {
    currentBlock: 0,
    avgGasPrice: 0,
    txCount24h: 0,
    activeAddresses24h: 0,
    totalVolume24h: 0,
    lastUpdate: null,
};

// Agent performance
const performance = {
    totalAlerts: 0,
    whaleAlerts: 0,
    networkAlerts: 0,
    startTime: Date.now(),
    lastAlertTime: null,
};

// Agent state
const agentState = {
    isRunning: true,
    isRegistered: false,
    lastCheck: null,
};

// ══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN CLIENTS
// ══════════════════════════════════════════════════════════════════════════════

const publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(monadMainnet.rpcUrls.default.http[0]),
});

let walletClient = null;
let account = null;

// ══════════════════════════════════════════════════════════════════════════════
// LOGGING UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    whale: (msg) => console.log(`\x1b[35m[🐋 WHALE]\x1b[0m ${msg}`),
    network: (msg) => console.log(`\x1b[34m[📡 NETWORK]\x1b[0m ${msg}`),
};

function formatNumber(num) {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
}

function formatAddress(addr) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

// ══════════════════════════════════════════════════════════════════════════════
// WALLET INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════════

function initWallet() {
    const privateKey = process.env.PRIVATE_KEY;
    if (privateKey) {
        const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
        account = privateKeyToAccount(formattedKey);
        walletClient = createWalletClient({
            account,
            chain: monadMainnet,
            transport: http(monadMainnet.rpcUrls.default.http[0]),
        });
        log.info(`Wallet initialized: ${formatAddress(account.address)}`);
        return true;
    }
    log.warning('No private key found, running in read-only mode');
    return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// WHALE TRACKING FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

async function getTokenBalance(tokenAddress, walletAddress) {
    try {
        const balance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [walletAddress],
        });
        return parseFloat(formatEther(balance));
    } catch (error) {
        log.error(`Failed to get balance: ${error.message}`);
        return 0;
    }
}

async function getTokenTotalSupply(tokenAddress) {
    try {
        const supply = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'totalSupply',
        });
        return parseFloat(formatEther(supply));
    } catch (error) {
        return TOKENS.DUCK.totalSupply;
    }
}

async function fetchTopHolders() {
    // In production, this would query an indexer or subgraph
    // For hackathon, we'll use known tracked addresses + random discovery
    try {
        const response = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${contracts.DUCK_TOKEN}`
        );
        const data = await response.json();

        if (data.pairs && data.pairs.length > 0) {
            // Extract unique addresses from liquidity pools
            const addresses = new Set();
            data.pairs.forEach(pair => {
                if (pair.pairAddress) addresses.add(pair.pairAddress);
            });
            return Array.from(addresses);
        }
    } catch (error) {
        log.warning('Could not fetch top holders from DexScreener');
    }

    // Return known contract addresses as whale-watch targets
    return [
        contracts.BONDING_CURVE_ROUTER, // Bonding Curve Router
        contracts.DEX_ROUTER,           // DEX Router
    ];
}

async function analyzeWallet(address) {
    const balance = await getTokenBalance(contracts.DUCK_TOKEN, address);
    const totalSupply = await getTokenTotalSupply(contracts.DUCK_TOKEN);
    const percentOfSupply = (balance / totalSupply) * 100;

    const previous = trackedWallets.get(address);
    const balanceChange = previous ? balance - previous.balance : 0;
    const percentChange = previous && previous.balance > 0
        ? ((balance - previous.balance) / previous.balance) * 100
        : 0;

    const walletData = {
        address,
        balance,
        percentOfSupply,
        balanceChange,
        percentChange,
        lastUpdate: Date.now(),
        previousBalance: previous?.balance || balance,
        isWhale: percentOfSupply >= WHALE_CONFIG.DUCK_WHALE_THRESHOLD,
    };

    trackedWallets.set(address, walletData);
    return walletData;
}

function classifyWhaleActivity(walletData) {
    const { balanceChange, percentOfSupply, percentChange } = walletData;
    const totalSupply = TOKENS.DUCK.totalSupply;
    const changePercent = Math.abs(balanceChange) / totalSupply * 100;

    if (balanceChange > 0) {
        if (changePercent >= WHALE_CONFIG.MEGA_TRANSFER_THRESHOLD) {
            return { type: 'MEGA_ACCUMULATION', impact: 'CRITICAL', sentiment: 'VERY_BULLISH' };
        } else if (changePercent >= WHALE_CONFIG.LARGE_TRANSFER_THRESHOLD) {
            return { type: 'ACCUMULATION', impact: 'HIGH', sentiment: 'BULLISH' };
        }
        return { type: 'MINOR_BUY', impact: 'LOW', sentiment: 'NEUTRAL' };
    } else if (balanceChange < 0) {
        if (changePercent >= WHALE_CONFIG.MEGA_TRANSFER_THRESHOLD) {
            return { type: 'MEGA_DISTRIBUTION', impact: 'CRITICAL', sentiment: 'VERY_BEARISH' };
        } else if (changePercent >= WHALE_CONFIG.LARGE_TRANSFER_THRESHOLD) {
            return { type: 'DISTRIBUTION', impact: 'HIGH', sentiment: 'BEARISH' };
        }
        return { type: 'MINOR_SELL', impact: 'LOW', sentiment: 'NEUTRAL' };
    }
    return { type: 'NO_CHANGE', impact: 'NONE', sentiment: 'NEUTRAL' };
}

// ══════════════════════════════════════════════════════════════════════════════
// NETWORK MONITORING
// ══════════════════════════════════════════════════════════════════════════════

async function getNetworkStats() {
    try {
        const [blockNumber, gasPrice] = await Promise.all([
            publicClient.getBlockNumber(),
            publicClient.getGasPrice(),
        ]);

        // Get recent blocks for TX analysis
        const recentBlocks = [];
        for (let i = 0; i < 10; i++) {
            try {
                const block = await publicClient.getBlock({
                    blockNumber: blockNumber - BigInt(i),
                });
                recentBlocks.push(block);
            } catch (e) {
                break;
            }
        }

        const avgTxPerBlock = recentBlocks.length > 0
            ? recentBlocks.reduce((sum, b) => sum + b.transactions.length, 0) / recentBlocks.length
            : 0;

        const avgGas = parseFloat(formatEther(gasPrice * BigInt(1e9))).toFixed(4);

        networkStats.currentBlock = Number(blockNumber);
        networkStats.avgGasPrice = parseFloat(avgGas);
        networkStats.avgTxPerBlock = Math.round(avgTxPerBlock);
        networkStats.lastUpdate = Date.now();

        // Estimate 24h metrics (blocks per day * avg tx)
        const blocksPerDay = 86400 / 1; // ~1 second blocks on Monad
        networkStats.txCount24h = Math.round(avgTxPerBlock * blocksPerDay);

        return networkStats;
    } catch (error) {
        log.error(`Network stats error: ${error.message}`);
        return networkStats;
    }
}

function assessNetworkHealth() {
    const { avgGasPrice, avgTxPerBlock } = networkStats;

    let congestionLevel = 'LOW';
    let healthScore = 100;

    if (avgGasPrice > 100) {
        congestionLevel = 'CRITICAL';
        healthScore = 40;
    } else if (avgGasPrice > 50) {
        congestionLevel = 'HIGH';
        healthScore = 60;
    } else if (avgGasPrice > 25) {
        congestionLevel = 'MODERATE';
        healthScore = 80;
    }

    // Adjust for transaction volume
    if (avgTxPerBlock > 1000) healthScore += 10;

    return {
        congestionLevel,
        healthScore: Math.min(100, healthScore),
        recommendation: congestionLevel === 'LOW' ? 'OPTIMAL_CONDITIONS' : 'WAIT_FOR_LOWER_GAS',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// ALERT GENERATION
// ══════════════════════════════════════════════════════════════════════════════

function generateWhaleAlertReason(walletData, activity) {
    const {
        address,
        balance,
        percentOfSupply,
        balanceChange,
        percentChange,
    } = walletData;

    const { type, impact, sentiment } = activity;
    const network = assessNetworkHealth();

    // Format: TYPE | Wallet | Balance Change | Holdings | Network | Sentiment
    const reason = [
        `🐋 ${type}`,
        `Wallet: ${formatAddress(address)}`,
        `Change: ${balanceChange >= 0 ? '+' : ''}${formatNumber(balanceChange)} DUCK (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)`,
        `Holdings: ${formatNumber(balance)} DUCK (${percentOfSupply.toFixed(2)}% supply)`,
        `Network: ${networkStats.avgGasPrice.toFixed(2)} gwei | ${formatNumber(networkStats.txCount24h)} TX/24h`,
        `Impact: ${impact} | ${sentiment}`,
    ].join(' | ');

    return reason;
}

function generateNetworkAlertReason() {
    const health = assessNetworkHealth();

    const reason = [
        `📡 NETWORK UPDATE`,
        `Block: ${networkStats.currentBlock.toLocaleString()}`,
        `Gas: ${networkStats.avgGasPrice.toFixed(2)} gwei`,
        `TX/Block: ${networkStats.avgTxPerBlock}`,
        `24h Volume: ~${formatNumber(networkStats.txCount24h)} TXs`,
        `Congestion: ${health.congestionLevel}`,
        `Health: ${health.healthScore}/100`,
        `Status: ${health.recommendation}`,
    ].join(' | ');

    return reason;
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN POSTING
// ══════════════════════════════════════════════════════════════════════════════

async function registerAgent() {
    if (!walletClient || !account) return false;
    if (contracts.DUCK_SIGNALS === '0x0000000000000000000000000000000000000000') {
        log.warning('DuckSignals contract not configured');
        return false;
    }

    try {
        // Check if already registered
        const agentInfo = await publicClient.readContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'agents',
            args: [account.address],
        });

        if (agentInfo[5]) { // isRegistered
            log.success(`Agent already registered: ${agentInfo[0]}`);
            agentState.isRegistered = true;
            return true;
        }

        // Register new agent
        const hash = await walletClient.writeContract({
            address: contracts.DUCK_SIGNALS,
            abi: DUCK_SIGNALS_ABI,
            functionName: 'registerAgent',
            args: [AGENT_NAME],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        log.success(`Agent registered on-chain: ${AGENT_NAME}`);
        agentState.isRegistered = true;
        return true;
    } catch (error) {
        log.error(`Registration failed: ${error.message}`);
        return false;
    }
}

async function postWhaleAlert(walletData, activity) {
    const reason = generateWhaleAlertReason(walletData, activity);

    // Calculate confidence based on impact
    let confidence = 50;
    if (activity.impact === 'CRITICAL') confidence = 95;
    else if (activity.impact === 'HIGH') confidence = 85;
    else if (activity.impact === 'MODERATE') confidence = 70;

    // Determine signal type based on sentiment
    let signalType = 'HOLD';
    if (activity.sentiment.includes('BULLISH')) signalType = 'BUY';
    else if (activity.sentiment.includes('BEARISH')) signalType = 'SELL';

    log.whale(`${activity.type} detected!`);
    console.log(`   ${reason}`);

    if (walletClient && account && agentState.isRegistered) {
        try {
            const hash = await walletClient.writeContract({
                address: contracts.DUCK_SIGNALS,
                abi: DUCK_SIGNALS_ABI,
                functionName: 'postSignal',
                args: [signalType, BigInt(confidence), parseEther('0'), reason],
            });

            await publicClient.waitForTransactionReceipt({ hash });
            log.success(`Alert posted on-chain: ${hash.slice(0, 10)}...`);
            performance.whaleAlerts++;
        } catch (error) {
            log.error(`Failed to post alert: ${error.message}`);
        }
    }

    performance.totalAlerts++;
    performance.lastAlertTime = Date.now();
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS LOOP
// ══════════════════════════════════════════════════════════════════════════════

async function runWhaleAnalysis() {
    log.info('Starting whale analysis cycle...');

    // Get top holders
    const topHolders = await fetchTopHolders();
    log.info(`Tracking ${topHolders.length} addresses`);

    for (const address of topHolders) {
        const walletData = await analyzeWallet(address);

        if (walletData.isWhale && Math.abs(walletData.balanceChange) > 0) {
            const activity = classifyWhaleActivity(walletData);

            if (activity.impact !== 'NONE' && activity.impact !== 'LOW') {
                await postWhaleAlert(walletData, activity);
            }
        }
    }

    agentState.lastCheck = Date.now();
}

async function runNetworkAnalysis() {
    log.network('Analyzing network conditions...');

    await getNetworkStats();
    const health = assessNetworkHealth();

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    📡 NETWORK STATUS                              ║
╠══════════════════════════════════════════════════════════════════╣
║  Block Height:     ${String(networkStats.currentBlock).padEnd(44)}║
║  Gas Price:        ${(networkStats.avgGasPrice.toFixed(2) + ' gwei').padEnd(44)}║
║  TX/Block:         ${String(networkStats.avgTxPerBlock).padEnd(44)}║
║  Est. 24h TXs:     ${formatNumber(networkStats.txCount24h).padEnd(44)}║
║  Congestion:       ${health.congestionLevel.padEnd(44)}║
║  Health Score:     ${(health.healthScore + '/100').padEnd(44)}║
╚══════════════════════════════════════════════════════════════════╝
    `);
}

async function printStatus() {
    const uptime = formatUptime(Date.now() - performance.startTime);
    const trackedCount = trackedWallets.size;

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    🐋 WHALE OBSERVER STATUS                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Agent:            ${AGENT_NAME.padEnd(44)}║
║  Status:           ${(agentState.isRunning ? '🟢 RUNNING' : '🔴 STOPPED').padEnd(44)}║
║  Registered:       ${(agentState.isRegistered ? '✅ YES' : '❌ NO').padEnd(44)}║
║  Uptime:           ${uptime.padEnd(44)}║
╠══════════════════════════════════════════════════════════════════╣
║  Tracked Wallets:  ${String(trackedCount).padEnd(44)}║
║  Total Alerts:     ${String(performance.totalAlerts).padEnd(44)}║
║  Whale Alerts:     ${String(performance.whaleAlerts).padEnd(44)}║
║  Network Alerts:   ${String(performance.networkAlerts).padEnd(44)}║
╚══════════════════════════════════════════════════════════════════╝
    `);
}

// ══════════════════════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║             🐋 DUCKMON WHALE OBSERVER v${AGENT_VERSION}                    ║
║         Advanced Whale Tracking & Network Intelligence            ║
║                      Powered by Monad                             ║
║                                                                   ║
╚══════════════════════════════════════════════════════════════════╝
    `);

    // Initialize
    initWallet();
    await registerAgent();

    // Initial analysis
    await runNetworkAnalysis();
    await runWhaleAnalysis();
    await printStatus();

    // Schedule recurring analysis
    setInterval(runNetworkAnalysis, WHALE_CONFIG.NETWORK_CHECK_INTERVAL);
    setInterval(runWhaleAnalysis, WHALE_CONFIG.BALANCE_CHECK_INTERVAL);
    setInterval(printStatus, 300000); // Every 5 minutes

    log.success('Whale Observer is now monitoring the Monad network!');
}

main().catch(console.error);
