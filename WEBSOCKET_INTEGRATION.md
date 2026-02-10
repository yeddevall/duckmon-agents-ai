# 🔌 WebSocket Integration Guide

## Quick Start

### 1. Start WebSocket Server

```bash
cd server
npm install
npm start
```

Server runs on: `http://localhost:3001`

### 2. Integrate into Agents

Add to any agent (example: MEV Bot):

```javascript
import { sendMEVOpportunity, startHeartbeat } from '../shared/websocketClient.js';

// Start heartbeat
const stopHeartbeat = startHeartbeat('mev-bot');

// When opportunity detected
async function detectArbitrageOpportunity() {
    // ... your detection logic ...

    if (opportunity) {
        // Send to WebSocket server
        await sendMEVOpportunity({
            type: opportunity.type,
            profit: opportunity.estimatedProfit,
            dex1: opportunity.buyDex,
            dex2: opportunity.sellDex,
            status: 'DETECTED',
        });

        return opportunity;
    }
}
```

### 3. Frontend Connection

Frontend automatically connects via `AdvancedAgentsFeed.tsx`

---

## Agent Integration Examples

### MEV Bot

```javascript
// At top of mev-bot/index.js
import { sendMEVOpportunity, startHeartbeat } from '../shared/websocketClient.js';

// In main()
const stopHeartbeat = startHeartbeat('mev-bot');

// When executing MEV
async function executeMEV(opportunity) {
    await sendMEVOpportunity({
        type: opportunity.type,
        profit: opportunity.estimatedProfit,
        status: 'EXECUTING',
    });

    // ... execute trade ...

    await sendMEVOpportunity({
        type: opportunity.type,
        profit: actualProfit,
        status: success ? 'SUCCESS' : 'FAILED',
    });
}
```

### Token Launch Detector

```javascript
import { sendTokenLaunch, startHeartbeat } from '../shared/websocketClient.js';

// In main()
startHeartbeat('token-launch-detector');

// When new token found
async function analyzeNewToken(token) {
    const safetyScore = performSafetyChecks(token);

    await sendTokenLaunch({
        tokenAddress: token.address,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        safetyScore,
        warnings: token.warnings,
    });
}
```

### Gas Optimizer

```javascript
import { sendGasUpdate, startHeartbeat } from '../shared/websocketClient.js';

// In main()
startHeartbeat('gas-optimizer');

// On gas price update
async function updateGasPrice() {
    const gasPrice = await publicClient.getGasPrice();
    const recommendation = generateRecommendation(gasPrice);

    await sendGasUpdate({
        currentGas: parseFloat(formatGwei(gasPrice)),
        avgGas: statistics.avgGas,
        recommendation: recommendation.action,
        predictedGas: prediction.price,
    });
}
```

### Whale Observer

```javascript
import { sendWhaleAlert, startHeartbeat } from '../shared/websocketClient.js';

// In main()
startHeartbeat('whale-observer');

// When whale detected
async function postWhaleAlert(walletData, activity) {
    await sendWhaleAlert({
        wallet: walletData.address,
        type: activity.type,
        balanceChange: walletData.balanceChange,
        impact: activity.impact,
    });
}
```

---

## Frontend Integration

AdvancedAgentsFeed.tsx already has Socket.IO client ready.

To enable real data:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.on('mev-opportunity', (opp) => {
    setOpportunities(prev => [opp, ...prev].slice(0, 10));
});

socket.on('token-launch', (launch) => {
    setLaunches(prev => [launch, ...prev].slice(0, 10));
});

socket.on('gas-update', (update) => {
    setGasUpdates(prev => [update, ...prev].slice(0, 10));
});
```

---

## Deployment

### Railway (Agents + Server)

**Option 1: Single Service**
```procfile
web: concurrently "node server/index.js" "npm run start:all"
```

**Option 2: Separate Services** (Recommended)
- Service 1: WebSocket Server (`node server/index.js`)
- Service 2: Agents (`npm run start:all`)

### Vercel (Frontend)

Add env variable:
```env
VITE_WEBSOCKET_URL=https://your-railway-server.railway.app
```

---

## Testing

### 1. Test Server

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "connectedClients": 0,
  "agentStatus": { ... }
}
```

### 2. Test Agent Integration

```bash
# Send test MEV opportunity
curl -X POST http://localhost:3001/api/mev/opportunity \
  -H "Content-Type: application/json" \
  -d '{"type":"ARBITRAGE","profit":45.5,"status":"DETECTED"}'
```

### 3. Watch Real-time Updates

Open browser console on frontend:
```javascript
// Socket.IO events will appear in console
```

---

## Environment Variables

### Server (.env)
```env
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### Agents (.env)
```env
WEBSOCKET_SERVER_URL=http://localhost:3001
# or for production:
WEBSOCKET_SERVER_URL=https://your-railway-server.railway.app
```

### Frontend (.env)
```env
VITE_WEBSOCKET_URL=http://localhost:3001
# or for production:
VITE_WEBSOCKET_URL=https://your-railway-server.railway.app
```

---

## Troubleshooting

### Connection Failed

1. Check server is running: `curl http://localhost:3001/health`
2. Check CORS settings in `server/index.js`
3. Check firewall/network settings

### No Data in Frontend

1. Check browser console for Socket.IO connection
2. Verify agents are sending data: check server logs
3. Test with curl (see Testing section)

### Agent Not Showing as Running

1. Agent must call `startHeartbeat(agentId)`
2. Check server logs for heartbeat messages
3. Heartbeat interval is 30s, wait a bit

---

## Performance

- **Latency**: <100ms from agent → frontend
- **Scalability**: Socket.IO handles 10K+ concurrent connections
- **Bandwidth**: ~1KB per event, minimal impact

---

**🚀 Ready for production real-time agent data!**
