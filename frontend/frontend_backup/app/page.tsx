"use client";

import { useState, useEffect } from "react";
import { Buffer } from "buffer";

// Polyfill Buffer for browser environment - required for Solana libraries
if (typeof window !== "undefined") {
  window.Buffer = Buffer;
}

// Recipient wallet address for USDC transfer
const RECIPIENT_ADDRESS = "3xkoe7iKAwtBGUfbKetafByu5kvn6xi1VqoXWgztuym9";
// Circle's official USDC Mint address on Solana Devnet
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
// Solana Devnet RPC URL
const RPC_URL = "https://api.devnet.solana.com";
// Backend API URL
const BACKEND_URL = "http://localhost:3001";

// MetaKeep SDK type declaration
declare global {
  interface Window {
    MetaKeep: any;
    Buffer: typeof Buffer;
  }
}

export default function Home() {
  // State management
  const [sdk, setSdk] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [txSignature, setTxSignature] = useState("");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [solBalance, setSolBalance] = useState<string>("");
  const [usdcBalance, setUsdcBalance] = useState<string>("");
  const [sponsorBalance, setSponsorBalance] = useState<string>("");

  /**
   * Initialize MetaKeep SDK on component mount
   */
  useEffect(() => {
    // Wait for MetaKeep SDK to load from CDN
    const initSDK = () => {
      if (typeof window !== "undefined" && window.MetaKeep) {
        try {
          const appId = process.env.NEXT_PUBLIC_METAKEEP_APP_ID;
          if (!appId) {
            throw new Error(
              "NEXT_PUBLIC_METAKEEP_APP_ID is not set in environment variables"
            );
          }
          const metakeepSdk = new window.MetaKeep({
            appId: appId,
          });
          setSdk(metakeepSdk);
          setStatus("MetaKeep SDK initialized");
        } catch (err: any) {
          setError("Failed to initialize MetaKeep SDK: " + err.message);
        }
      } else {
        // Retry after a short delay if SDK not loaded yet
        setTimeout(initSDK, 100);
      }
    };

    initSDK();
  }, []);

  /**
   * Fetch wallet balances (SOL and USDC)
   */
  const fetchBalances = async (
    walletAddress: string,
    isSponsor: boolean = false
  ) => {
    try {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const {
        getAssociatedTokenAddress,
        TOKEN_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      } = await import("@solana/spl-token");

      const connection = new Connection(RPC_URL, "confirmed");
      const publicKey = new PublicKey(walletAddress);

      // Get SOL balance
      const solBalanceLamports = await connection.getBalance(publicKey);
      const solBalanceSOL = (solBalanceLamports / 1e9).toFixed(4);

      if (isSponsor) {
        setSponsorBalance(solBalanceSOL);
        return;
      }

      setSolBalance(solBalanceSOL);

      // Get USDC balance
      const mintPublicKey = new PublicKey(USDC_MINT);
      const mintAccountInfo = await connection.getAccountInfo(mintPublicKey);
      const tokenProgramId = mintAccountInfo?.owner?.equals(
        TOKEN_2022_PROGRAM_ID
      )
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      const tokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        publicKey,
        false,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      try {
        const balance = await connection.getTokenAccountBalance(tokenAccount);
        setUsdcBalance(balance.value.uiAmountString || "0");
      } catch {
        setUsdcBalance("0 (ATA not created)");
      }
    } catch (err: any) {
      console.error("Error fetching balances:", err);
    }
  };

  /**
   * Get user's Solana wallet using MetaKeep SDK
   */
  const getUserWallet = async () => {
    try {
      setLoading(true);
      setError("");
      setTxSignature("");
      setExplorerUrl("");
      setStatus("Fetching wallet...");

      const walletData = await sdk.getWallet();

      if (walletData.status === "SUCCESS") {
        setWallet(walletData.wallet);
        // Store user email from wallet data
        setUserEmail(walletData.user?.email || walletData.wallet.email || "");
        setStatus(`Wallet connected: ${walletData.wallet.solAddress}`);

        // Fetch balances
        await fetchBalances(walletData.wallet.solAddress);
      } else {
        setError("Failed to get wallet");
      }
    } catch (err: any) {
      setError("Error getting wallet: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get Lambda sponsor wallet from backend (for display purposes)
   */
  const getSponsorWallet = async () => {
    const response = await fetch(`${BACKEND_URL}/api/lambda/sponsor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get sponsor wallet");
    }

    const data = await response.json();
    return data;
  };

  /**
   * Invoke Lambda transaction via backend with user consent
   * Uses MetaKeep's Invoke Lambda API with serialized transaction message
   */
  const invokeLambda = async (
    serializedTransactionMessage: string,
    description: string,
    userEmail: string
  ) => {
    const response = await fetch(`${BACKEND_URL}/api/lambda/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        serializedTransactionMessage: serializedTransactionMessage,
        description: {
          text: description,
        },
        as: {
          email: userEmail,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.details?.status ||
          errorData.message ||
          "Failed to invoke lambda"
      );
    }

    return await response.json();
  };

  /**
   * Fetch MetaKeep transaction status using backend proxy
   */
  const getTransactionStatus = async (transactionId: string) => {
    const response = await fetch(`${BACKEND_URL}/api/lambda/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transactionId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.details?.status ||
          errorData.message ||
          "Failed to get transaction status"
      );
    }

    return await response.json();
  };

  /**
   * Poll MetaKeep transaction status until completion
   */
  const pollTransactionStatus = async (transactionId: string) => {
    const maxAttempts = 12;
    const delayMs = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const statusResult = await getTransactionStatus(transactionId);
      const status = statusResult.status;

      if (status === "COMPLETED") {
        return statusResult;
      }

      if (status === "FAILED" || status === "CANCELLED") {
        const reason =
          statusResult.reason || statusResult.error || "Transaction failed";
        throw new Error(reason);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error("Transaction status timed out");
  };

  /**
   * Transfer USDC using MetaKeep Lambda (sponsor pays fees and co-signs)
   */
  const transferUSDC = async () => {
    try {
      setLoading(true);
      setError("");
      setTxSignature("");
      setExplorerUrl("");
      setStatus("Starting USDC transfer with Lambda...");

      if (!wallet || !wallet.solAddress) {
        throw new Error("Wallet not connected");
      }

      // Dynamically import Solana libraries to avoid SSR issues
      const {
        Connection,
        PublicKey,
        Transaction,
        TransactionMessage,
        VersionedTransaction,
      } = await import("@solana/web3.js");
      const {
        getAssociatedTokenAddress,
        createAssociatedTokenAccountInstruction,
        createTransferInstruction,
        getAccount,
        TOKEN_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      } = await import("@solana/spl-token");

      // Get sponsor wallet that will pay fees
      setStatus("Getting Lambda sponsor wallet...");
      const sponsorData = await getSponsorWallet();
      const sponsorPublicKey = new PublicKey(sponsorData.wallet.solAddress);

      // Fetch sponsor balance
      await fetchBalances(sponsorData.wallet.solAddress, true);

      setStatus(
        `Sponsor wallet will pay fees: ${sponsorData.wallet.solAddress}`
      );

      // Setup connection to Solana devnet
      const connection = new Connection(RPC_URL, "confirmed");

      // Convert addresses to PublicKey objects
      const fromPublicKey = new PublicKey(wallet.solAddress);
      const toPublicKey = new PublicKey(RECIPIENT_ADDRESS);
      const mintPublicKey = new PublicKey(USDC_MINT);

      setStatus("Getting token accounts...");

      // Detect token program (legacy vs token-2022) based on mint owner
      const mintAccountInfo = await connection.getAccountInfo(mintPublicKey);
      const tokenProgramId = mintAccountInfo?.owner?.equals(
        TOKEN_2022_PROGRAM_ID
      )
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      // Get associated token accounts for sender and receiver
      const fromTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        fromPublicKey,
        false,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const toTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        toPublicKey,
        false,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const instructions = [];

      // Create sender ATA if missing
      const senderAccountInfo = await connection.getAccountInfo(
        fromTokenAccount
      );
      if (!senderAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            fromPublicKey, // user pays rent for ATA creation
            fromTokenAccount,
            fromPublicKey,
            mintPublicKey,
            tokenProgramId,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      } else {
        // Validate sender ATA data is readable
        await getAccount(
          connection,
          fromTokenAccount,
          "confirmed",
          tokenProgramId
        );
      }

      // Create recipient ATA if missing
      const recipientAccountInfo = await connection.getAccountInfo(
        toTokenAccount
      );
      if (!recipientAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            fromPublicKey, // user pays rent for ATA creation
            toTokenAccount,
            toPublicKey,
            mintPublicKey,
            tokenProgramId,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      setStatus("Building transaction...");

      // Convert USDC amount to smallest units (6 decimals for USDC)
      const transferAmount = Math.floor(parseFloat(amount) * 1_000_000);

      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPublicKey,
        transferAmount,
        [],
        tokenProgramId
      );
      instructions.push(transferInstruction);

      // Fetch and log sender balance for informational purposes
      if (senderAccountInfo) {
        try {
          const senderBalanceInfo = await connection.getTokenAccountBalance(
            fromTokenAccount
          );
          const senderUiAmount =
            senderBalanceInfo?.value?.uiAmountString || "0";
          console.log(`Sender USDC balance: ${senderUiAmount}`);
          setStatus(
            `Sender USDC balance: ${senderUiAmount}. Building transaction...`
          );
        } catch (err) {
          console.log(
            "Could not fetch balance, proceeding with transaction..."
          );
        }
      }

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();

      // Build transaction message with BOTH user and sponsor as signers
      // User signs to authorize token transfer, sponsor signs to pay fees
      const messageV0 = new TransactionMessage({
        payerKey: sponsorPublicKey, // Sponsor pays fees
        recentBlockhash: blockhash,
        instructions: instructions,
      }).compileToV0Message();

      // Serialize the transaction message
      const serializedMessage = messageV0.serialize();

      // Convert to hex format with 0x prefix as required by MetaKeep
      const serializedTransactionMessage =
        "0x" + Buffer.from(serializedMessage).toString("hex");

      if (!userEmail) {
        throw new Error("User email not available for consent flow");
      }

      setStatus("Requesting user consent for transaction...");

      // Invoke Lambda with user - this will return a consent token
      const result = await invokeLambda(
        serializedTransactionMessage,
        `Transfer ${amount} USDC`,
        userEmail
      );

      // Check if we need user consent
      if (result.status === "USER_CONSENT_NEEDED") {
        setStatus("Waiting for user approval...");

        // Use MetaKeep SDK to get user consent
        const consentResult = await sdk.getConsent(result.consentToken);

        if (consentResult.status === "USER_REQUEST_DENIED") {
          throw new Error("Transaction denied by user");
        }

        if (
          consentResult.status === "SUCCESS" ||
          consentResult.status === "COMPLETED"
        ) {
          const signature =
            consentResult.transactionSignature || consentResult.transactionHash;
          if (signature) {
            setTxSignature(signature);
            setExplorerUrl(
              `https://explorer.solana.com/tx/${signature}?cluster=devnet`
            );
            setStatus("Transaction successful! Sponsor paid fees.");
          } else if (consentResult.transactionId) {
            setStatus("Finalizing transaction on Solana...");
            const statusResult = await pollTransactionStatus(
              consentResult.transactionId
            );
            setTxSignature(statusResult.transactionSignature);
            setExplorerUrl(statusResult.transactionChainScanUrl);
            setStatus("Transaction successful! Sponsor paid fees.");
          } else {
            throw new Error("Transaction completed but no signature returned");
          }
        } else if (
          consentResult.status === "QUEUED" &&
          consentResult.transactionId
        ) {
          setStatus("Transaction queued. Waiting for confirmation...");
          const statusResult = await pollTransactionStatus(
            consentResult.transactionId
          );
          setTxSignature(statusResult.transactionSignature);
          setExplorerUrl(statusResult.transactionChainScanUrl);
          setStatus("Transaction successful! Sponsor paid fees.");
        } else {
          throw new Error("Transaction failed");
        }
      } else {
        throw new Error("Unexpected response from Lambda invocation");
      }
    } catch (err: any) {
      console.error("Transfer error:", err);
      setError("Transfer failed: " + err.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">
          Solana Lambda Test
        </h1>
        <p className="text-gray-500 text-center mb-8 text-sm">
          Transfer USDC using Lambda sponsor wallet
        </p>

        {/* Connected Wallet */}
        {wallet && (
          <div className="bg-slate-50 rounded-lg p-4 mb-6">
            <p className="text-xs text-gray-500 mb-2">Connected Wallet</p>
            <p className="text-sm text-gray-900 break-all font-mono mb-3">
              {wallet.solAddress}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-200">
              <div>
                <p className="text-xs text-gray-500">SOL Balance</p>
                <p className="text-sm font-semibold text-gray-900">
                  {solBalance ? `${solBalance} SOL` : "Loading..."}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">USDC Balance</p>
                <p className="text-sm font-semibold text-gray-900">
                  {usdcBalance ? `${usdcBalance}` : "Loading..."}
                </p>
              </div>
            </div>
            {sponsorBalance && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Sponsor SOL Balance (pays fees)
                </p>
                <p className="text-sm font-semibold text-blue-600">
                  {sponsorBalance} SOL
                </p>
              </div>
            )}
            <button
              onClick={() => fetchBalances(wallet.solAddress)}
              disabled={loading}
              className="mt-3 w-full text-xs text-blue-600 hover:text-blue-700 font-medium py-2 px-3 rounded border border-blue-200 hover:border-blue-300 transition-colors disabled:opacity-50"
            >
              Refresh Balances
            </button>
          </div>
        )}

        {/* Connect Wallet or Transfer Section */}
        {!wallet ? (
          <button
            onClick={getUserWallet}
            disabled={loading || !sdk}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-lg font-semibold text-base shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
          >
            {loading ? "Connecting..." : "Connect Wallet"}
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                USDC Amount
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.1"
                min="0.1"
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={transferUSDC}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-lg font-semibold text-base shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
            >
              {loading ? "Processing..." : "Transfer USDC"}
            </button>
          </div>
        )}

        {/* Status Messages */}
        {status && !error && !txSignature && (
          <div className="bg-blue-50 rounded-lg p-4 mt-4 border-l-4 border-blue-500">
            <p className="text-blue-900 text-sm">{status}</p>
          </div>
        )}

        {/* Transaction Success with Explorer Link */}
        {txSignature && explorerUrl && (
          <div className="bg-green-50 rounded-lg p-6 mt-4 border-l-4 border-green-500">
            <h3 className="text-base font-semibold text-green-900 mb-2">
              Transaction Successful
            </h3>
            <p className="text-green-800 text-xs mb-3 break-all font-mono">
              {txSignature}
            </p>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-5 rounded-lg text-sm transition-colors shadow-sm hover:shadow-md"
            >
              View on Explorer
            </a>
          </div>
        )}

        {/* Error Messages */}
        {error && (
          <div className="bg-red-50 rounded-lg p-4 mt-4 border-l-4 border-red-500">
            <p className="text-red-900 text-sm font-medium">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
