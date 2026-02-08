// Monad Mainnet Configuration for Market Analyzer
export const monadMainnet = {
    id: 143,
    name: 'Monad',
    network: 'monad',
    nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
    rpcUrls: {
        default: { http: ['https://rpc.monad.xyz'] },
        public: { http: ['https://rpc.monad.xyz'] },
    },
};

export const contracts = {
    DUCK_TOKEN: '0x0862F464c8457266b66c58F1D7C1137B72647777',
    LENS: '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea',
    DUCK_SIGNALS: process.env.DUCK_SIGNALS_ADDRESS || '0x0000000000000000000000000000000000000000',
};

export const LENS_ABI = [
    {
        type: 'function',
        name: 'getAmountOut',
        inputs: [
            { name: '_token', type: 'address' },
            { name: '_amountIn', type: 'uint256' },
            { name: '_isBuy', type: 'bool' },
        ],
        outputs: [
            { name: 'router', type: 'address' },
            { name: 'amountOut', type: 'uint256' },
        ],
        stateMutability: 'view',
    },
];
