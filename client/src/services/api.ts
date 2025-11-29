import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface PaymentRequestPayload {
  walletAddress?: string;
  transactionHash?: string;
  metadata?: Record<string, unknown>;
}

// API endpoints
export const api = {
  // Free endpoints
  getHealth: async () => {
    const response = await apiClient.get("/api/health");
    return response.data;
  },

  getPaymentOptions: async () => {
    const response = await apiClient.get("/api/payment-options");
    return response.data;
  },

  validateSession: async (sessionId: string) => {
    const response = await apiClient.get(`/api/session/${sessionId}`);
    return response.data;
  },

  getActiveSessions: async () => {
    const response = await apiClient.get("/api/sessions");
    return response.data;
  },

  getPayments: async () => {
    const response = await apiClient.get("/api/payments");
    return response.data;
  },

  // Paid endpoints
  purchase24HourSession: async (payload: PaymentRequestPayload) => {
    console.log("🔐 Purchasing 24-hour session access...");
    const response = await apiClient.post("/api/pay/session", payload);
    console.log("✅ 24-hour session created:", response.data);
    return response.data;
  },

  purchaseOneTimeAccess: async (payload: PaymentRequestPayload) => {
    console.log("⚡ Purchasing one-time access...");
    const response = await apiClient.post("/api/pay/onetime", payload);
    console.log("✅ One-time access granted:", response.data);
    return response.data;
  },
};

// Types for API responses
export interface PaymentOption {
  name: string;
  endpoint: string;
  price: string;
  description: string;
}

export interface Session {
  id: string;
  type: "24hour" | "onetime";
  createdAt: string;
  expiresAt: string;
  walletAddress?: string;
  transactionHash?: string;
  validFor?: string;
  remainingTime?: number;
}

export interface SessionValidation {
  valid: boolean;
  error?: string;
  session?: Session;
} 

export interface PaymentRecord {
  id: string;
  type: Session["type"];
  amountUsd: number;
  walletAddress?: string;
  transactionHash?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}