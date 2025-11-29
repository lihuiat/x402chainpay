import { config } from "dotenv";
import { Hono } from "hono";
import type { Context } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { v4 as uuidv4 } from "uuid";

config();

// Configuration from environment variables (all optional in simulated mode)
const network = process.env.NETWORK || "monad-testnet";
const payTo = process.env.ADDRESS || "0x000000000000000000000000000000000000dEaD";
const port = parseInt(process.env.PORT || "3001");

const app = new Hono();

// Enable CORS for frontend
app.use("/*", cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true,
}));

// Simple in-memory storage for sessions (use Redis/DB in production)
interface Session {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  type: "24hour" | "onetime";
  used?: boolean;
  walletAddress?: string;
  transactionHash?: string;
}

const sessions = new Map<string, Session>();

interface PaymentRecord {
  id: string;
  type: Session["type"];
  amountUsd: number;
  walletAddress?: string;
  transactionHash?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const payments: PaymentRecord[] = [];
const MAX_PAYMENT_HISTORY = 100;

interface PaymentRequestPayload {
  walletAddress?: string;
  transactionHash?: string;
  metadata?: Record<string, unknown>;
}

async function parsePaymentRequest<T>(c: Context, fallback: T): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    return fallback;
  }
}

function recordPayment(entry: PaymentRecord) {
  payments.push(entry);
  if (payments.length > MAX_PAYMENT_HISTORY) {
    payments.shift();
  }
}

// Free endpoint - health check
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    message: "Server is running",
    config: {
      network,
      payTo,
      mode: "simulated-payments",
    },
  });
});

// Free endpoint - get payment options
app.get("/api/payment-options", (c) => {
  return c.json({
    options: [
      {
        name: "24-Hour Access",
        endpoint: "/api/pay/session",
        price: "$1.00",
        description: "Get a session ID for 24 hours of unlimited access",
      },
      {
        name: "One-Time Access",
        endpoint: "/api/pay/onetime",
        price: "$0.10",
        description: "Single use payment for immediate access",
      },
    ],
  });
});

// Paid endpoint - 24-hour session access ($1.00)
app.post("/api/pay/session", async (c) => {
  const body = await parsePaymentRequest<PaymentRequestPayload>(c, {});
  const sessionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const session: Session = {
    id: sessionId,
    createdAt: now,
    expiresAt,
    type: "24hour",
    walletAddress: body.walletAddress,
    transactionHash: body.transactionHash,
  };

  sessions.set(sessionId, session);
  recordPayment({
    id: sessionId,
    type: "24hour",
    amountUsd: 1,
    walletAddress: body.walletAddress,
    transactionHash: body.transactionHash,
    metadata: body.metadata,
    createdAt: now,
  });

  return c.json({
    success: true,
    sessionId,
    message: "24-hour access granted!",
    session: {
      id: sessionId,
      type: "24hour",
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      validFor: "24 hours",
      walletAddress: session.walletAddress,
      transactionHash: session.transactionHash,
    },
    payment: {
      amountUsd: 1,
      walletAddress: body.walletAddress,
      transactionHash: body.transactionHash,
      metadata: body.metadata,
    },
  });
});

// Paid endpoint - one-time access/payment ($0.10)
app.post("/api/pay/onetime", async (c) => {
  const body = await parsePaymentRequest<PaymentRequestPayload>(c, {});
  const sessionId = uuidv4();
  const now = new Date();

  const session: Session = {
    id: sessionId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000), // 5 minutes to use
    type: "onetime",
    used: false,
    walletAddress: body.walletAddress,
    transactionHash: body.transactionHash,
  };

  sessions.set(sessionId, session);
  recordPayment({
    id: sessionId,
    type: "onetime",
    amountUsd: 0.1,
    walletAddress: body.walletAddress,
    transactionHash: body.transactionHash,
    metadata: body.metadata,
    createdAt: now,
  });

  return c.json({
    success: true,
    sessionId,
    message: "One-time access granted!",
    access: {
      id: sessionId,
      type: "onetime",
      createdAt: now.toISOString(),
      validFor: "5 minutes (single use)",
      walletAddress: session.walletAddress,
      transactionHash: session.transactionHash,
    },
    payment: {
      amountUsd: 0.1,
      walletAddress: body.walletAddress,
      transactionHash: body.transactionHash,
      metadata: body.metadata,
    },
  });
});

// Free endpoint - validate session
app.get("/api/session/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);

  if (!session) {
    return c.json({ valid: false, error: "Session not found" }, 404);
  }

  const now = new Date();
  const isExpired = now > session.expiresAt;
  const isUsed = session.type === "onetime" && session.used;

  if (isExpired || isUsed) {
    return c.json({ 
      valid: false, 
      error: isExpired ? "Session expired" : "One-time access already used",
      session: {
        id: session.id,
        type: session.type,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        used: session.used,
        walletAddress: session.walletAddress,
        transactionHash: session.transactionHash,
      }
    });
  }

  // Mark one-time sessions as used
  if (session.type === "onetime") {
    session.used = true;
    sessions.set(sessionId, session);
  }

  return c.json({
    valid: true,
    session: {
      id: session.id,
      type: session.type,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      remainingTime: session.expiresAt.getTime() - now.getTime(),
      walletAddress: session.walletAddress,
      transactionHash: session.transactionHash,
    },
  });
});

// Free endpoint - list active sessions (for demo purposes)
app.get("/api/sessions", (c) => {
  const activeSessions = Array.from(sessions.values())
    .filter(session => {
      const isExpired = new Date() > session.expiresAt;
      const isUsed = session.type === "onetime" && session.used;
      return !isExpired && !isUsed;
    })
    .map(session => ({
      id: session.id,
      type: session.type,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      walletAddress: session.walletAddress,
      transactionHash: session.transactionHash,
    }));

  return c.json({ sessions: activeSessions });
});

// Free endpoint - inspect recorded payments (demo only)
app.get("/api/payments", (c) => {
  const recentPayments = [...payments]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 25)
    .map((payment) => ({
      ...payment,
      createdAt: payment.createdAt.toISOString(),
    }));

  return c.json({ payments: recentPayments });
});

console.log(`
🚀 x402 Payment Template Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Accepting payments to: ${payTo}
🔗 Network: ${network}
🧪 Mode: Simulated payments (no on-chain verification)
🌐 Port: ${port}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Payment Options:
   - 24-Hour Session: $1.00
   - One-Time Access: $0.10
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️  This is a template! Customize it for your app.
📚 Learn more: https://x402.org
💬 Get help: https://discord.gg/invite/cdp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

serve({
  fetch: app.fetch,
  port,
}); 