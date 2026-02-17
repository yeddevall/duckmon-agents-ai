// Centralized Configuration for all DUCKMON Agents
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Monad Mainnet Chain Definition
export const monadMainnet = {
    id: 143,
    name: 'Monad',
    network: 'monad',
    nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
    rpcUrls: {
        default: {
            http: [process.env.RPC_URL || 'https://rpc.monad.xyz'],
        },
        fallback: {
            http: [
                'https://rpc1.monad.xyz',
                'https://rpc2.monad.xyz',
                'https://rpc3.monad.xyz',
            ],
        },
    },
    blockExplorers: {
        default: { name: 'MonadScan', url: 'https://monadscan.com' },
        monadvision: { name: 'MonadVision', url: 'https://monadvision.com' },
    },
};

// Contract Addresses - Monad Mainnet
export const contracts = {
    DUCK_TOKEN: '0x0862F464c8457266b66c58F1D7C1137B72647777',
    LENS: '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea',
    BONDING_CURVE_ROUTER: '0x6F6B8F1a20703309951a5127c45B49b1CD981A22',
    DEX_ROUTER: '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137',
    WMON: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
    DUCK_SIGNALS: process.env.DUCK_SIGNALS_ADDRESS || '0x0000000000000000000000000000000000000000',
};

// Token Metadata
export const TOKENS = {
    DUCK: {
        address: contracts.DUCK_TOKEN,
        symbol: 'DUCK',
        name: 'Duck on Monad',
        decimals: 18,
        totalSupply: 1_000_000_000,
    },
    WMON: {
        address: contracts.WMON,
        symbol: 'WMON',
        name: 'Wrapped Monad',
        decimals: 18,
    },
};

// Whale Tracking Thresholds
export const WHALE_CONFIG = {
    DUCK_WHALE_THRESHOLD: 0.5,        // 0.5% of supply = whale
    LARGE_TRANSFER_THRESHOLD: 0.1,    // 0.1% of supply
    MEGA_TRANSFER_THRESHOLD: 0.5,     // 0.5% of supply
    BALANCE_CHECK_INTERVAL: 300000,   // 5 minutes
    NETWORK_CHECK_INTERVAL: 60000,    // 1 minute
    TOP_HOLDERS_COUNT: 20,
};

// Known contract addresses (not real whale wallets)
export const KNOWN_CONTRACTS = new Set([
    contracts.BONDING_CURVE_ROUTER.toLowerCase(),
    contracts.DEX_ROUTER.toLowerCase(),
    contracts.LENS.toLowerCase(),
    contracts.WMON.toLowerCase(),
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dead',
]);

// DexScreener API config
export const DEXSCREENER_API = `https://api.dexscreener.com/latest/dex/tokens/${contracts.DUCK_TOKEN}`;

// Re-export ABIs
export { LENS_ABI, DUCK_SIGNALS_ABI, ERC20_ABI } from './abis.js';
