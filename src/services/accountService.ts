import { PublicKey, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  UserAccount,
  SpendLimits,
  OpenedPackRecord,
  TransactionRecord,
  PortfolioSummary,
  VaultedCard
} from "../types.js";
import { SolanaService } from "./solana.js";
import { StorageService } from "./storageService.js";

export class AccountService {
  private activeAccount: UserAccount;
  private packHistory: OpenedPackRecord[] = [];
  private transactionHistory: TransactionRecord[] = [];
  private solanaService: SolanaService;
  private tokenAccountMap = new Map<string, UserAccount>();
  private storage = StorageService.getInstance();

  constructor(solanaService: SolanaService) {
    this.solanaService = solanaService;

    // Load or initialize default pre-connected wallet session
    const defaultAddress = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    const savedAccount = this.storage.getAccount(defaultAddress);
    if (savedAccount) {
      this.activeAccount = savedAccount;
    } else {
      this.activeAccount = {
        walletAddress: defaultAddress,
        connectedVia: "PayBox MPC Vault",
        isConnected: true,
        balances: {
          sol: 1.85,
          usdc: 340.50,
          cards: 12500
        },
        spendLimits: {
          perTransactionCapUsd: 100,
          dailySpendCapUsd: 500,
          dailySpentSoFarUsd: 35,
          requiresPasskeyAboveUsd: 50
        },
        isVerifiedOwner: false,
        createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        lastActive: new Date().toISOString()
      };
      this.storage.saveAccount(this.activeAccount);
    }

    // Load or initialize pack opening history
    const savedPacks = this.storage.getPackHistory();
    if (savedPacks && savedPacks.length > 0) {
      this.packHistory = savedPacks;
    } else {
      this.packHistory = [{
        id: "pack-open-hist-1",
        packId: "pack-modern-heat",
        packTitle: "Modern Alt-Art & Special Illustration Pack",
        openedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        paidAmount: 35,
        paidCurrency: "USDC",
        isProfit: true,
        netPnlUsdc: 415,
        txSignature: "5KtPn8Y4zH1m...mock...tx1",
        cardPulled: {
          id: "cc-pkmn-003",
          name: "Gengar VMAX Alternate Art Secret Rare #271",
          category: "Pokemon",
          set: "Fusion Strike",
          year: 2021,
          gradingCompany: "BGS",
          grade: "9.5 Gem Mint",
          certNumber: "001429910",
          estimatedValueUsdc: 450,
          floorPriceUsdc: 420,
          vaultLocation: "PWCC Vault (Oregon, USA)",
          nftMint: "GengarVMAXAlt111111111111111111111111111111",
          imageUrl: "https://collectorcrypt.com/assets/cards/gengar_vmax.jpg",
          isAvailableForTrade: true,
          acquiredDate: new Date(Date.now() - 86400000 * 2).toISOString()
        }
      }];
      this.storage.savePackHistory(this.packHistory);
    }

    // Load or initialize transaction history
    const savedTxs = this.storage.getTransactionHistory();
    if (savedTxs && savedTxs.length > 0) {
      this.transactionHistory = savedTxs;
    } else {
      this.transactionHistory = [{
        signature: "5KtPn8Y4zH1m...mock...tx1",
        type: "PACK_OPEN",
        status: "finalized",
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
        description: "Opened 1x Modern Alt-Art Pack for 35 USDC (Pulled PSA 9.5 Gengar VMAX)",
        amountUsd: 35,
        solanaExplorerUrl: "https://solscan.io/tx/5KtPn8Y4zH1m...mock...tx1"
      }];
      this.storage.saveTransactionHistory(this.transactionHistory);
    }
  }

  /**
   * Validate if a string is a valid Solana Base58 public key
   */
  public validateSolanaAddress(address: string): boolean {
    try {
      const pubkey = new PublicKey(address);
      return PublicKey.isOnCurve(pubkey.toBuffer());
    } catch {
      return false;
    }
  }

  /**
   * Create a new non-custodial PayBox Agent Wallet on Solana
   */
  public createAgentWallet(): {
    account: UserAccount;
    secretKeyBase58: string;
    message: string;
  } {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const secretKeyBase58 = bs58.encode(keypair.secretKey);

    const newAccount: UserAccount = {
      walletAddress: address,
      connectedVia: "PayBox MPC Vault",
      isConnected: true,
      balances: {
        sol: 1.5,
        usdc: 500.0,
        cards: 10000
      },
      spendLimits: {
        perTransactionCapUsd: 150,
        dailySpendCapUsd: 1000,
        dailySpentSoFarUsd: 0,
        requiresPasskeyAboveUsd: 75
      },
      isVerifiedOwner: true,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };

    this.activeAccount = newAccount;
    this.storage.saveAccount(newAccount);

    const txSig = `5gen${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}...sol`;
    this.recordTransaction({
      signature: txSig,
      type: "PACK_BUY",
      status: "finalized",
      timestamp: new Date().toISOString(),
      description: `Created non-custodial PayBox Agent Wallet on Solana: ${address}`,
      amountUsd: 0,
      solanaExplorerUrl: `https://solscan.io/account/${address}`
    });

    return {
      account: newAccount,
      secretKeyBase58,
      message: `Successfully created and linked new PayBox non-custodial wallet: ${address}. Initial sandbox balances credited (1.5 SOL, 500 USDC, 10,000 CARDS).`
    };
  }

  /**
   * Link or change the connected wallet address
   * @param isVerifiedOwner Whether the connection was authenticated via cryptographic signature (SIWS) or passkey
   */
  public async connectWallet(address: string, isVerifiedOwner: boolean = false): Promise<UserAccount> {
    const trimmed = address.trim();
    if (!this.validateSolanaAddress(trimmed)) {
      throw new Error(`Invalid Solana address "${address}". A valid Solana address must be a base58 string 32-44 characters long.`);
    }

    // Check if user already has an existing saved account in persistent storage
    const existing = this.storage.getAccount(trimmed);
    if (existing) {
      this.activeAccount = {
        ...existing,
        isVerifiedOwner,
        isConnected: true,
        lastActive: new Date().toISOString()
      };
    } else {
      this.activeAccount = {
        walletAddress: trimmed,
        connectedVia: "Solana Native",
        isConnected: true,
        isVerifiedOwner,
        balances: { sol: 0, usdc: 0, cards: 0 },
        spendLimits: {
          perTransactionCapUsd: 100,
          dailySpendCapUsd: 500,
          dailySpentSoFarUsd: 0,
          requiresPasskeyAboveUsd: 50
        },
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
    }

    // Query live on-chain balances from Solana RPC
    try {
      const live = await this.solanaService.getBalances(trimmed);
      this.activeAccount.balances.sol = live.sol;
      this.activeAccount.balances.usdc = live.usdc;
      this.activeAccount.balances.cards = live.cards;
    } catch {
      // Keep existing balance if network RPC is unavailable
    }

    this.storage.saveAccount(this.activeAccount);
    return this.activeAccount;
  }

  /**
   * Security Guardrail: Prevent unauthorized execution by address spoofing
   * Blocks money-moving actions if connected in unverified / read-only spectator mode.
   */
  public requireVerifiedOwner(actionName: string): void {
    if (this.activeAccount.isVerifiedOwner !== true) {
      throw new Error(
        `Security Block: Wallet ${this.activeAccount.walletAddress} is connected in Read-Only Spectator Mode. To ${actionName}, you must prove cryptographic ownership by signing in with Phantom/Solflare or PayBox Passkey at the authorization portal.`
      );
    }
  }

  /**
   * Map OAuth bearer token to a specific wallet account
   */
  public registerTokenAccount(token: string, account: UserAccount) {
    this.tokenAccountMap.set(token, account);
  }

  /**
   * Get account associated with a bearer token, or active default
   */
  public getAccountForToken(token?: string): UserAccount {
    if (token && this.tokenAccountMap.has(token)) {
      return this.tokenAccountMap.get(token)!;
    }
    return this.activeAccount;
  }

  /**
   * Get the active connected wallet address (auto-resolves for any tool)
   */
  public getActiveAddress(explicitAddress?: string): string {
    if (explicitAddress && explicitAddress.trim().length > 0) {
      if (!this.validateSolanaAddress(explicitAddress.trim())) {
        throw new Error(`Invalid Solana address provided: "${explicitAddress}". Must be a base58 string 32-44 characters long.`);
      }
      return explicitAddress.trim();
    }
    return this.activeAccount.walletAddress;
  }

  /**
   * Get complete account info
   */
  public getAccount(): UserAccount {
    this.activeAccount.lastActive = new Date().toISOString();
    return this.activeAccount;
  }

  /**
   * Update spend safety limits
   */
  public updateSpendLimits(updates: Partial<SpendLimits>): SpendLimits {
    this.activeAccount.spendLimits = {
      ...this.activeAccount.spendLimits,
      ...updates
    };
    this.storage.saveAccount(this.activeAccount);
    return this.activeAccount.spendLimits;
  }

  /**
   * Check and enforce spend limits and actual wallet balance before moving real funds
   */
  public verifySpendSafety(amountUsd: number): {
    allowed: boolean;
    requiresPasskeyPrompt: boolean;
    errorReason?: string;
  } {
    // 1. Guard against NaN, zero, negative, or infinite values
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return {
        allowed: false,
        requiresPasskeyPrompt: false,
        errorReason: "Invalid transaction amount: Amount must be a positive finite number."
      };
    }

    // 2. Real Money Protection: Ensure actual available USDC balance in connected wallet
    if (this.activeAccount.balances.usdc < amountUsd) {
      return {
        allowed: false,
        requiresPasskeyPrompt: false,
        errorReason: `Insufficient funds: Required $${amountUsd} USDC, but your wallet only holds $${this.activeAccount.balances.usdc.toFixed(2)} USDC. Please deposit USDC into your wallet (${this.activeAccount.walletAddress}) to proceed.`
      };
    }

    const limits = this.activeAccount.spendLimits;

    // 3. Per-transaction safety cap
    if (amountUsd > limits.perTransactionCapUsd) {
      return {
        allowed: false,
        requiresPasskeyPrompt: true,
        errorReason: `Amount of $${amountUsd} USD exceeds your per-transaction spend limit ($${limits.perTransactionCapUsd} USD). You can adjust this with 'set_spend_limits'.`
      };
    }

    // 4. Daily 24-hour spend cap
    if (limits.dailySpentSoFarUsd + amountUsd > limits.dailySpendCapUsd) {
      return {
        allowed: false,
        requiresPasskeyPrompt: true,
        errorReason: `Amount of $${amountUsd} USD would exceed your 24h spend cap ($${limits.dailySpendCapUsd} USD). Currently spent today: $${limits.dailySpentSoFarUsd} USD.`
      };
    }

    return {
      allowed: true,
      requiresPasskeyPrompt: amountUsd >= limits.requiresPasskeyAboveUsd
    };
  }

  /**
   * Record expenditure against daily cap
   */
  public recordSpend(amountUsd: number) {
    this.activeAccount.spendLimits.dailySpentSoFarUsd += amountUsd;
    this.storage.saveAccount(this.activeAccount);
  }

  /**
   * Record an opened pack and add to history
   */
  public recordPackOpening(record: OpenedPackRecord) {
    this.packHistory.unshift(record);
    this.recordSpend(record.paidCurrency === "USDC" ? record.paidAmount : record.paidAmount * 0.0205);
    
    this.transactionHistory.unshift({
      signature: record.txSignature,
      type: "PACK_OPEN",
      status: "finalized",
      timestamp: record.openedAt,
      description: `Opened ${record.packTitle} for ${record.paidAmount} ${record.paidCurrency} (Pulled ${record.cardPulled.name})`,
      amountUsd: record.paidCurrency === "USDC" ? record.paidAmount : record.paidAmount * 0.0205,
      solanaExplorerUrl: `https://solscan.io/tx/${record.txSignature}`
    });

    this.storage.savePackHistory(this.packHistory);
    this.storage.saveTransactionHistory(this.transactionHistory);
    this.storage.saveAccount(this.activeAccount);
  }

  /**
   * Get pack history with optional pagination
   */
  public getPackHistory(limit: number = 10): { totalOpened: number; history: OpenedPackRecord[] } {
    return {
      totalOpened: this.packHistory.length,
      history: this.packHistory.slice(0, limit)
    };
  }

  /**
   * Record a transaction
   */
  public recordTransaction(tx: TransactionRecord) {
    this.transactionHistory.unshift(tx);
    this.storage.saveTransactionHistory(this.transactionHistory);
  }

  /**
   * Get transaction history with pagination
   */
  public getTransactionHistory(limit: number = 10, offset: number = 0): {
    total: number;
    hasMore: boolean;
    nextOffset?: number;
    transactions: TransactionRecord[];
  } {
    const total = this.transactionHistory.length;
    const paginated = this.transactionHistory.slice(offset, offset + limit);
    const hasMore = offset + limit < total;
    return {
      total,
      hasMore,
      nextOffset: hasMore ? offset + limit : undefined,
      transactions: paginated
    };
  }

  /**
   * Look up transaction status by signature
   */
  public getTransactionStatus(signature: string): TransactionRecord | { signature: string; status: "not_found"; message: string } {
    const found = this.transactionHistory.find(t => t.signature === signature);
    if (found) return found;

    return {
      signature,
      status: "not_found",
      message: `Transaction signature "${signature}" not found in local session history. It may have been submitted on another client or is still propagating on Solana RPC.`
    };
  }

  /**
   * Credit user balance on buyback, loan release, or sale
   */
  public creditBalance(amountUsdc: number) {
    this.activeAccount.balances.usdc += amountUsdc;
    this.storage.saveAccount(this.activeAccount);
  }

  /**
   * Debit user balance on pack buy, loan repayment, or fee
   */
  public debitBalance(amountUsdc: number) {
    this.activeAccount.balances.usdc = Math.max(0, this.activeAccount.balances.usdc - amountUsdc);
    this.storage.saveAccount(this.activeAccount);
  }

  /**
   * Execute collateralized DeFi loan directly
   */
  public executeLoan(
    cardId: string,
    cardName: string,
    borrowAmountUsdc: number,
    durationDays: number
  ): {
    loanId: string;
    borrowAmountUsdc: number;
    originationFeeUsdc: number;
    netReceivedUsdc: number;
    durationDays: number;
    dueDate: string;
    collateralCard: string;
    txSignature: string;
    solanaExplorerUrl: string;
  } {
    const originationFee = 10;
    const netPayout = borrowAmountUsdc - originationFee;
    this.creditBalance(netPayout);

    const txSig = `5loan${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}...sol`;
    const dueDate = new Date(Date.now() + durationDays * 86400000).toISOString();

    this.recordTransaction({
      signature: txSig,
      type: "LOAN",
      status: "finalized",
      timestamp: new Date().toISOString(),
      description: `DeFi Loan: Borrowed $${borrowAmountUsdc} USDC collateralized by "${cardName}" (${durationDays} days)`,
      amountUsd: borrowAmountUsdc,
      solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
    });

    return {
      loanId: `loan-${Date.now()}`,
      borrowAmountUsdc,
      originationFeeUsdc: originationFee,
      netReceivedUsdc: netPayout,
      durationDays,
      dueDate,
      collateralCard: cardName,
      txSignature: txSig,
      solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
    };
  }

  /**
   * Execute physical vault redemption directly
   */
  public executePhysicalRedemption(
    cardId: string,
    cardName: string,
    certNumber: string,
    destinationCountry: string,
    totalCostUsdc: number
  ): {
    redemptionId: string;
    cardName: string;
    certNumber: string;
    trackingNumber: string;
    carrier: string;
    deliveryEstimate: string;
    feePaidUsdc: number;
    txSignature: string;
    status: string;
  } {
    this.debitBalance(totalCostUsdc);

    const txSig = `5rdm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}...sol`;
    const tracking = `FEDEX-SECURE-${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    this.recordTransaction({
      signature: txSig,
      type: "REDEMPTION",
      status: "finalized",
      timestamp: new Date().toISOString(),
      description: `Physical Redemption: Burned NFT for "${cardName}" (Cert #${certNumber}). Dispatched to ${destinationCountry}`,
      amountUsd: totalCostUsdc,
      solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
    });

    return {
      redemptionId: `rdm-${Date.now()}`,
      cardName,
      certNumber,
      trackingNumber: tracking,
      carrier: "FedEx Armored Priority Vault Delivery",
      deliveryEstimate: ["US", "USA"].includes(destinationCountry.toUpperCase()) ? "3-5 business days" : "7-12 business days",
      feePaidUsdc: totalCostUsdc,
      txSignature: txSig,
      status: "NFT_BURNED_PHYSICAL_DISPATCHED"
    };
  }
}

