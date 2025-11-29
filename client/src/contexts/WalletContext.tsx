import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createWalletClient, custom, type WalletClient } from 'viem';
import { monadTestnet } from '../config/chains';
import type { Hex } from 'viem';

interface WalletContextType {
  isConnected: boolean;
  address: Hex | null;
  walletClient: WalletClient | null;
  error: string | null;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<Hex | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if wallet is already connected on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (typeof window.ethereum === 'undefined') {
      return;
    }

    try {
      // Handle multiple wallet providers
      let ethereum = window.ethereum;
      if (Array.isArray(ethereum)) {
        ethereum = ethereum[0];
      } else if (ethereum.providers && Array.isArray(ethereum.providers)) {
        ethereum = ethereum.providers[0];
      }

      const accounts = await ethereum.request({ 
        method: 'eth_accounts' 
      }) as string[];
      
      if (accounts.length > 0) {
        const client = createWalletClient({
          account: accounts[0] as Hex,
          chain: monadTestnet,
          transport: custom(ethereum)
        });
        
        setWalletClient(client);
        setAddress(accounts[0] as Hex);
        setIsConnected(true);
      }
    } catch (err) {
      console.error('检查钱包连接失败:', err);
    }
  };

  const connectWallet = useCallback(async () => {
    console.log('connectWallet');
    setError(null);
    setIsConnecting(true);

    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('请安装 MetaMask 或其他以太坊钱包扩展');
      }

      // Handle multiple wallet providers
      let ethereum = window.ethereum;
      if (Array.isArray(ethereum)) {
        console.warn('检测到多个钱包扩展，使用第一个');
        ethereum = ethereum[0];
      } else if (ethereum.providers && Array.isArray(ethereum.providers)) {
        console.warn('检测到多个钱包扩展，使用第一个');
        ethereum = ethereum.providers[0];
      }

      // Request account access with better error handling
      let accounts: string[];
      try {
        accounts = await ethereum.request({ 
          method: 'eth_requestAccounts' 
        }) as string[];
      } catch (requestError: any) {
        console.error('请求账户访问失败:', requestError);
        
        // Handle user rejection
        if (requestError.code === 4001 || requestError.message?.includes('rejected') || requestError.message?.includes('denied')) {
          throw new Error('用户取消了连接请求');
        }
        
        // Handle other errors
        if (requestError.message) {
          throw new Error(`连接失败: ${requestError.message}`);
        }
        
        throw new Error('无法连接到钱包，请确保钱包扩展已启用');
      }

      console.log('accounts', accounts);
      
      if (accounts.length === 0) {
        throw new Error('未找到账户，请在钱包中创建或导入账户');
      }

      // Check if on correct network (Monad Testnet)
      let chainId: string;
      try {
        chainId = await ethereum.request({ 
          method: 'eth_chainId' 
        }) as string;
      } catch (chainError: any) {
        console.error('获取链ID失败:', chainError);
        throw new Error('无法获取当前网络信息');
      }
      
      const monadTestnetChainIdHex = '0x279F'; // 10143 in hex
      
      if (chainId !== monadTestnetChainIdHex) {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: monadTestnetChainIdHex }],
          });
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to browser wallet
          if (switchError.code === 4902) {
            try {
              await ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: monadTestnetChainIdHex,
                  chainName: 'Monad Testnet',
                  nativeCurrency: {
                    name: 'Monad',
                    symbol: 'MON',
                    decimals: 18,
                  },
                  rpcUrls: ['https://testnet-rpc.monad.xyz'],
                  blockExplorerUrls: ['https://testnet.monadscan.com'],
                }],
              });
            } catch (addError: any) {
              console.error('添加网络失败:', addError);
              if (addError.code === 4001) {
                throw new Error('用户取消了添加网络请求');
              }
              throw new Error('无法添加 Monad Testnet 网络到钱包');
            }
          } else if (switchError.code === 4001) {
            throw new Error('用户取消了切换网络请求');
          } else {
            console.error('切换网络失败:', switchError);
            throw new Error(`切换网络失败: ${switchError.message || '未知错误'}`);
          }
        }
      }

      // Create viem wallet client
      const client = createWalletClient({
        account: accounts[0] as Hex,
        chain: monadTestnet,
        transport: custom(ethereum)
      });

      setWalletClient(client);
      setAddress(accounts[0] as Hex);
      setIsConnected(true);
    } catch (err: any) {
      console.error('钱包连接错误详情:', {
        error: err,
        message: err?.message,
        code: err?.code,
        stack: err?.stack,
        data: err?.data
      });
      
      // Provide user-friendly error messages
      let errorMessage = '连接钱包失败';
      
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.code) {
        switch (err.code) {
          case 4001:
            errorMessage = '用户拒绝了连接请求';
            break;
          case -32002:
            errorMessage = '连接请求已在进行中，请检查钱包扩展';
            break;
          case 4902:
            errorMessage = '网络未添加到钱包';
            break;
          default:
            errorMessage = `连接失败 (错误代码: ${err.code})`;
        }
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletClient(null);
    setAddress(null);
    setIsConnected(false);
    setError(null);
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (typeof window.ethereum === 'undefined') {
      return;
    }

    // Handle multiple wallet providers
    let ethereum = window.ethereum;
    if (Array.isArray(ethereum)) {
      ethereum = ethereum[0];
    } else if (ethereum.providers && Array.isArray(ethereum.providers)) {
      ethereum = ethereum.providers[0];
    }

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else if (accounts[0] !== address) {
        // Re-connect with new account
        const client = createWalletClient({
          account: accounts[0] as Hex,
          chain: monadTestnet,
          transport: custom(ethereum)
        });
        
        setWalletClient(client);
        setAddress(accounts[0] as Hex);
        setIsConnected(true);
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [address, disconnectWallet]);

  const value: WalletContextType = {
    isConnected,
    address,
    walletClient,
    error,
    isConnecting,
    connectWallet,
    disconnectWallet,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
} 