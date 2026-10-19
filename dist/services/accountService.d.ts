import { UserAccount, SpendLimits, OpenedPackRecord, TransactionRecord } from "../types.js";
import { SolanaService } from "./solana.js";
export declare class AccountService {
    private activeAccount;
    private packHistory;
    private transactionHistory;
    private solanaService;
    private tokenAccountMap;
    private storage;
    constructor(solanaService: SolanaService);
    /**
     * Validate if a string is a valid Solana Base58 public key
     */
    validateSolanaAddress(address: string): boolean;
    /**
     * Create a new non-custodial PayBox Agent Wallet on Solana
     */
    createAgentWallet(): {
        account: UserAccount;
        secretKeyBase58: string;
        message: string;
    };
    /**
     * Link or change the connected wallet address
     */
    connectWallet(address: string): Promise<UserAccount>;
    /**
     * Map OAuth bearer token to a specific wallet account
     */
    registerTokenAccount(token: string, account: UserAccount): void;
    /**
     * Get account associated with a bearer token, or active default
     */
    getAccountForToken(token?: string): UserAccount;
    /**
     * Get the active connected wallet address (auto-resolves for any tool)
     */
    getActiveAddress(explicitAddress?: string): string;
    /**
     * Get complete account info
     */
    getAccount(): UserAccount;
    /**
     * Update spend safety limits
     */
    updateSpendLimits(updates: Partial<SpendLimits>): SpendLimits;
    /**
     * Check and enforce spend limits before moving funds
     */
    verifySpendSafety(amountUsd: number): {
        allowed: boolean;
        requiresPasskeyPrompt: boolean;
        errorReason?: string;
    };
    /**
     * Record expenditure against daily cap
     */
    recordSpend(amountUsd: number): void;
    /**
     * Record an opened pack and add to history
     */
    recordPackOpening(record: OpenedPackRecord): void;
    /**
     * Get pack history with optional pagination
     */
    getPackHistory(limit?: number): {
        totalOpened: number;
        history: OpenedPackRecord[];
    };
    /**
     * Record a transaction
     */
    recordTransaction(tx: TransactionRecord): void;
    /**
     * Get transaction history with pagination
     */
    getTransactionHistory(limit?: number, offset?: number): {
        total: number;
        hasMore: boolean;
        nextOffset?: number;
        transactions: TransactionRecord[];
    };
    /**
     * Look up transaction status by signature
     */
    getTransactionStatus(signature: string): TransactionRecord | {
        signature: string;
        status: "not_found";
        message: string;
    };
    /**
     * Credit user balance on buyback, loan release, or sale
     */
    creditBalance(amountUsdc: number): void;
    /**
     * Debit user balance on pack buy, loan repayment, or fee
     */
    debitBalance(amountUsdc: number): void;
    /**
     * Execute collateralized DeFi loan directly
     */
    executeLoan(cardId: string, cardName: string, borrowAmountUsdc: number, durationDays: number): {
        loanId: string;
        borrowAmountUsdc: number;
        originationFeeUsdc: number;
        netReceivedUsdc: number;
        durationDays: number;
        dueDate: string;
        collateralCard: string;
        txSignature: string;
        solanaExplorerUrl: string;
    };
    /**
     * Execute physical vault redemption directly
     */
    executePhysicalRedemption(cardId: string, cardName: string, certNumber: string, destinationCountry: string, totalCostUsdc: number): {
        redemptionId: string;
        cardName: string;
        certNumber: string;
        trackingNumber: string;
        carrier: string;
        deliveryEstimate: string;
        feePaidUsdc: number;
        txSignature: string;
        status: string;
    };
}
