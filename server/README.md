# Simulated Payment Server

This server now records payments in memory instead of relying on the x402 facilitator flow. It is useful when you want to prototype against networks that x402 does not yet support (for example Monad Testnet).

## Setup

1. Create a `.env` file (all fields optional in demo mode):
```env
NETWORK=monad-testnet
ADDRESS=0x_YOUR_WALLET_ADDRESS_HERE
PORT=3001
```

2. Install dependencies:
```bash
npm install
```

3. Run the server:
```bash
npm run dev
```

## Endpoints

### Free Endpoints
- `GET /api/health` - Server health check
- `GET /api/pricing` - Get pricing information
- `GET /api/session/:sessionId` - Check session status

### Simulated Paid Endpoints
- `POST /api/pay/session` - Records a 24-hour session purchase ($1.00)
- `POST /api/pay/onetime` - Records a single-use purchase ($0.10)
- `GET /api/payments` - Inspect recent payment records (demo only)