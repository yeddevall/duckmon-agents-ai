# 🚂 Railway WebSocket Server Deployment

## Quick Deploy - 2 Services Setup

### Service 1: WebSocket Server

1. **Create New Project** on Railway
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `duckmon-agents-ai`

2. **Configure Root Directory**
   - Settings → Build → Root Directory: `server`

3. **Environment Variables**
   ```env
   PORT=3001
   FRONTEND_URL=https://duck-on-monad.vercel.app
   NODE_ENV=production
   ```

4. **Deploy**
   - Railway auto-deploys from `server/` directory
   - Get URL: `https://your-server.railway.app`

### Service 2: Agents

1. **Create Second Service** in same project
   - Click "+ New"
   - Select same GitHub repo

2. **Configure Root Directory**
   - Settings → Build → Root Directory: `.` (root)
   - Or leave empty

3. **Environment Variables**
   ```env
   PRIVATE_KEY=your_private_key
   VITE_API_KEY=your_gemini_api_key
   WEBSOCKET_SERVER_URL=https://duckmon-agents-ai.railway.internal

   ```

4. **Deploy**
   - Uses existing `Procfile` in root
   - Runs: `npm run start:all`

---

## Alternative: Single Service (Not Recommended)

If you want both in one service:

**Procfile (root):**
```procfile
web: concurrently "cd server && node index.js" "npm run start:all"
```

**Environment Variables:**
```env
# Server
PORT=3001
FRONTEND_URL=https://duck-on-monad.vercel.app
NODE_ENV=production

# Agents
PRIVATE_KEY=your_private_key
VITE_API_KEY=your_gemini_api_key
WEBSOCKET_SERVER_URL=http://localhost:3001
```

**Dependencies:**
Update root `package.json`:
```json
{
  "scripts": {
    "start": "concurrently \"cd server && node index.js\" \"npm run start:all\""
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5"
  }
}
```

---

## Testing WebSocket Server

### Health Check
```bash
curl https://your-server.railway.app/health
```

Expected:
```json
{
  "status": "ok",
  "connectedClients": 0,
  "agentStatus": { ... }
}
```

### Send Test Data
```bash
curl -X POST https://your-server.railway.app/api/mev/opportunity \
  -H "Content-Type: application/json" \
  -d '{"type":"ARBITRAGE","profit":45.5,"status":"DETECTED"}'
```

---

## Frontend Configuration

### Vercel Environment Variable

```env
VITE_WEBSOCKET_URL=https://your-server.railway.app
```

---

## Monitoring

Railway dashboard shows:
- Server logs
- Connected WebSocket clients
- Agent heartbeats
- CPU/Memory usage

---

## Troubleshooting

### Server not starting
- Check logs in Railway dashboard
- Verify `server/package.json` exists
- Check Node version (>=18)

### Agents can't connect
- Verify `WEBSOCKET_SERVER_URL` is correct
- Check server is running: `curl /health`
- Check network/firewall settings

### CORS errors
- Update `FRONTEND_URL` in server env vars
- Must match exact Vercel URL

---

## Cost Estimate

- **WebSocket Server**: ~$5/month (Hobby plan)
- **Agents**: ~$5/month (Hobby plan)
- **Total**: ~$10/month

Or free tier (500 hours/month) for testing!

---

**🚀 Ready to deploy!**
