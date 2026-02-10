// Token Launch Detector Configuration
export const monadMainnet = {
    id: 143,
    name: 'Monad',
    network: 'monad',
    nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
    rpcUrls: {
        default: { http: ['https://rpc.monad.xyz'] },
        public: { http: ['https://rpc.monad.xyz'] },
    },
    blockExplorers: {
        default: { name: 'MonadVision', url: 'https://monadvision.com' },
    },
};

export const contracts = {
    FACTORY_ADDRESS: '0x0000000000000000000000000000000000000001', // Add real factory
    ROUTER_ADDRESS: '0x0000000000000000000000000000000000000002',  // Add real router
    DUCK_SIGNALS: process.env.DUCK_SIGNALS_ADDRESS || '0x0000000000000000000000000000000000000000',
};

export const LAUNCH_CONFIG = {
    BLOCK_SCAN_RANGE: 100,           // Scan last 100 blocks
    MIN_LIQUIDITY_USD: 1000,         // Min $1K liquidity
    MAX_TOKEN_AGE_MINUTES: 60,       // Only tokens < 1 hour old
    SCAN_INTERVAL: 5000,             // Scan every 5 seconds
    SAFETY_CHECKS: {
        MIN_LIQUIDITY_LOCK: 30,      // Min 30 days liquidity lock
        MAX_OWNER_PERCENT: 10,       // Max 10% owned by deployer
        HONEYPOT_CHECK: true,        // Check for honeypot
        CONTRACT_VERIFIED: true,     // Require verified contract
    }
};

export const ERC20_ABI = [
    { type: 'function', name: 'name', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
    { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
    { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
];
