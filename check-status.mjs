import { createPublicClient, http } from 'viem';

const DUCK_SIGNALS_ABI = [
    { name: 'agentCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'signalCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'predictionCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'signals', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'string' }] },
];

const addr = '0x9386CA8FC92A342E3c9DFD9E913Fa860d5761687';
console.log('Querying DuckSignals at:', addr);

const client = createPublicClient({
    chain: {
        id: 143,
        name: 'Monad',
        rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
        nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
    },
    transport: http('https://rpc.monad.xyz'),
});

async function main() {
    try {
        const code = await client.getCode({ address: addr });
        if (!code || code === '0x') {
            console.log('\n❌ No contract deployed at this address!');
            return;
        }
        console.log('✅ Contract is deployed (bytecode length:', code.length, ')');

        const agentCount = await client.readContract({ address: addr, abi: DUCK_SIGNALS_ABI, functionName: 'agentCount' });
        console.log('\nRegistered agents:', agentCount.toString());

        const totalSignals = await client.readContract({ address: addr, abi: DUCK_SIGNALS_ABI, functionName: 'signalCount' });
        console.log('Total signals:', totalSignals.toString());

        const totalPredictions = await client.readContract({ address: addr, abi: DUCK_SIGNALS_ABI, functionName: 'predictionCount' });
        console.log('Total predictions:', totalPredictions.toString());

        if (Number(totalSignals) > 0) {
            console.log('\n--- Last 5 Signals ---');
            const start = Math.max(0, Number(totalSignals) - 5);
            for (let i = Number(totalSignals) - 1; i >= start; i--) {
                try {
                    const s = await client.readContract({ address: addr, abi: DUCK_SIGNALS_ABI, functionName: 'signals', args: [BigInt(i)] });
                    const ts = new Date(Number(s[4]) * 1000);
                    const agoMin = Math.floor((Date.now() - ts.getTime()) / 60000);
                    const agoHrs = Math.floor(agoMin / 60);
                    const timeLabel = agoHrs > 0 ? `${agoHrs}h ${agoMin % 60}m ago` : `${agoMin}m ago`;
                    console.log(`Signal #${i}: agent=${s[0].slice(0, 10)}... type=${s[1]} confidence=${s[3].toString()}% | ${timeLabel} (${ts.toISOString()})`);
                } catch (e) {
                    console.log(`Signal #${i}: error -`, e.message?.slice(0, 100));
                }
            }
        } else {
            console.log('\n⚠️ No signals posted yet.');
        }
    } catch (e) {
        console.log('Error:', e.message?.slice(0, 300));
    }
}

main();
