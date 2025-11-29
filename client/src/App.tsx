import React, { useState, useEffect } from 'react';
import { WalletConnect } from './components/WalletConnect';
import { useWallet } from './contexts/WalletContext';
import { api, type PaymentOption, type Session, type PaymentRecord } from './services/api';
import './App.css';

function App() {
  const { walletClient } = useWallet();
  const [serverStatus, setServerStatus] = useState<string>('checking...');
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [sessionInput, setSessionInput] = useState<string>('');
  const [validationResult, setValidationResult] = useState<any>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Check server health on mount
  useEffect(() => {
    checkServerHealth();
    loadPaymentOptions();
    loadActiveSessions();
    loadPayments();
  }, []);

  const checkServerHealth = async () => {
    try {
      const health = await api.getHealth();
      const mode = health.config?.mode ? ` [${health.config.mode}]` : '';
      setServerStatus(`✅ Connected to ${health.config.network}${mode}`);
    } catch (error) {
      setServerStatus('❌ Server offline');
    }
  };

  const loadPaymentOptions = async () => {
    try {
      const data = await api.getPaymentOptions();
      setPaymentOptions(data.options);
    } catch (error) {
      console.error('Failed to load payment options:', error);
    }
  };

  const loadActiveSessions = async () => {
    try {
      const data = await api.getActiveSessions();
      setSessions(data.sessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadPayments = async () => {
    try {
      const data = await api.getPayments();
      setPayments(data.payments);
    } catch (error) {
      console.error('Failed to load payments:', error);
    }
  };

  const requireWalletAddress = () => {
    const address = walletClient?.account?.address;
    if (!address) {
      setValidationResult({
        type: 'error',
        message: '请先连接钱包再发起支付请求',
      });
    }
    return address;
  };

  const handle24HourSession = async () => {
    const walletAddress = requireWalletAddress();
    if (!walletAddress) {
      return;
    }

    setLoading('session');
    try {
      const result = await api.purchase24HourSession({
        walletAddress,
        metadata: {
          product: '24hour',
          requestedAt: new Date().toISOString(),
        },
      });
      await loadActiveSessions();
      await loadPayments();
      setValidationResult({
        type: 'success',
        message: result.message,
        session: result.session,
      });
    } catch (error: any) {
      setValidationResult({
        type: 'error',
        message: error.message || 'Failed to purchase session',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleOneTimeAccess = async () => {
    const walletAddress = requireWalletAddress();
    if (!walletAddress) {
      return;
    }

    setLoading('onetime');
    try {
      const result = await api.purchaseOneTimeAccess({
        walletAddress,
        metadata: {
          product: 'onetime',
          requestedAt: new Date().toISOString(),
        },
      });
      await loadActiveSessions();
      await loadPayments();
      setValidationResult({
        type: 'success',
        message: result.message,
        access: result.access,
      });
    } catch (error: any) {
      setValidationResult({
        type: 'error',
        message: error.message || 'Failed to purchase access',
      });
    } finally {
      setLoading(null);
    }
  };

  const validateSession = async () => {
    if (!sessionInput.trim()) {
      setValidationResult({
        type: 'error',
        message: 'Please enter a session ID',
      });
      return;
    }

    try {
      const result = await api.validateSession(sessionInput);
      setValidationResult(result);
      if (result.valid && result.session?.type === 'onetime') {
        // Refresh sessions since one-time was just used
        await loadActiveSessions();
      }
    } catch (error: any) {
      setValidationResult({
        type: 'error',
        message: error.message || 'Failed to validate session',
      });
    }
  };

  return (
    <div className="app">
      <header>
        <h1>x402 Payment Template</h1>
        <p>Build your own payment-enabled app with this starter template</p>
        <div className="server-status">{serverStatus}</div>
      </header>

      <main>
        <section className="wallet-section">
          <h2>1. Connect Your Wallet</h2>
          <WalletConnect />
        </section>

        <section className="payment-section">
          <h2>2. Payment Options</h2>
          {!walletClient?.account?.address && (
            <p className="payment-hint">Connect your wallet to enable purchase buttons.</p>
          )}
          <div className="payment-grid">
            {paymentOptions.map((option) => (
              <div key={option.endpoint} className="payment-card">
                <h3>{option.name}</h3>
                <p className="price">{option.price}</p>
                <p className="description">{option.description}</p>
                
                {option.endpoint === '/api/pay/session' && (
                  <button 
                    onClick={handle24HourSession}
                    disabled={loading === 'session' || !walletClient?.account?.address}
                    className="action-btn"
                  >
                    {loading === 'session' ? 'Processing...' : 'Purchase 24-Hour Session'}
                  </button>
                )}
                
                {option.endpoint === '/api/pay/onetime' && (
                  <button 
                    onClick={handleOneTimeAccess}
                    disabled={loading === 'onetime' || !walletClient?.account?.address}
                    className="action-btn"
                  >
                    {loading === 'onetime' ? 'Processing...' : 'Purchase One-Time Access'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="validation-section">
          <h2>3. Validate Session</h2>
          <div className="session-validator">
            <input
              type="text"
              placeholder="Enter session ID"
              value={sessionInput}
              onChange={(e) => setSessionInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && validateSession()}
              className="session-input"
            />
            <button onClick={validateSession} className="validate-btn">
              Check Session
            </button>
          </div>
          
          {validationResult && (
            <div className={`validation-result ${validationResult.type || (validationResult.valid ? 'success' : 'error')}`}>
              {validationResult.message && <p>{validationResult.message}</p>}
              {validationResult.error && <p>❌ {validationResult.error}</p>}
              {validationResult.valid && (
                <div>
                  <p>✅ Session is valid!</p>
                  {validationResult.session && (
                    <div className="session-details">
                      <p><strong>Type:</strong> {validationResult.session.type}</p>
                      <p><strong>Created:</strong> {new Date(validationResult.session.createdAt).toLocaleString()}</p>
                      <p><strong>Expires:</strong> {new Date(validationResult.session.expiresAt).toLocaleString()}</p>
                      {validationResult.session.walletAddress && (
                        <p><strong>Wallet:</strong> {validationResult.session.walletAddress}</p>
                      )}
                      {validationResult.session.remainingTime && (
                        <p><strong>Remaining:</strong> {Math.floor(validationResult.session.remainingTime / 1000 / 60)} minutes</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {validationResult.session && !validationResult.valid && (
                <div className="session-details">
                  <p><strong>Session ID:</strong> {validationResult.session.id}</p>
                  <p><strong>Type:</strong> {validationResult.session.type}</p>
                  <p><strong>Status:</strong> {validationResult.error}</p>
                </div>
              )}
              {validationResult.access && (
                <div className="access-details">
                  <p><strong>Access ID:</strong> {validationResult.access.id}</p>
                  <p><strong>Valid for:</strong> {validationResult.access.validFor}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {sessions.length > 0 && (
          <section className="sessions-section">
            <h2>Active Sessions</h2>
            <div className="sessions-list">
              {sessions.map((session) => (
                <div key={session.id} className="session-item">
                  <code>{session.id}</code>
                  <span className={`session-type ${session.type}`}>{session.type}</span>
                  <span className="session-expires">
                    Expires: {new Date(session.expiresAt).toLocaleString()}
                  </span>
                  {session.walletAddress && (
                    <span className="session-wallet">Wallet: {session.walletAddress}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {payments.length > 0 && (
          <section className="sessions-section payments-section">
            <h2>Recent Payment Records</h2>
            <div className="sessions-list payments-list">
              {payments.map((payment) => (
                <div key={payment.id} className="session-item payment-item">
                  <div className="payment-header">
                    <span className={`session-type ${payment.type}`}>{payment.type}</span>
                    <code>{payment.id}</code>
                  </div>
                  <p>Amount: ${payment.amountUsd.toFixed(2)}</p>
                  <p>Wallet: {payment.walletAddress || 'N/A'}</p>
                  {payment.transactionHash && <p>Tx: {payment.transactionHash}</p>}
                  <p>Time: {new Date(payment.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer>
        <p>
          This simplified example now records payments in-memory instead of performing on-chain settlement, so you can prototype the UX before wiring up the real network logic.
        </p>
      </footer>
    </div>
  );
}

export default App; 