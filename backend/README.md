# Deenly Backend (Railway)

## Quick start

1. Install dependencies:
   - `npm install`
2. Run locally:
   - `npm run dev`
3. Health check:
   - `GET /health`

## Connect to Railway

1. Install Railway CLI:
   - `npm i -g @railway/cli`
2. Login:
   - `railway login`
3. In this `backend` folder, initialize/link the service:
   - `railway init`
4. Set variables in Railway dashboard (minimum):
   - `NODE_ENV=production`
5. Deploy:
   - `railway up`

Railway injects `PORT` automatically. The server already uses `process.env.PORT`.
