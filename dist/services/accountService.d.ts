import { UserAccount, SpendLimits, OpenedPackRecord, TransactionRecord } from "../types.js";
import { SolanaService } from "./solana.js";
export declare class AccountService {
    private activeAccount;
    private packHistory;
    private transactionHistory;
    private solanaService;
    constructor(solanaService: SolanaService);
    /**
     * Validate if a string is a valid Solana Base58 public key
     */
    validateSolanaAddress(address: string): boolean;
    /**
     * Link or change the connected wallet address
     */
    connectWallet(address: string): Promise<UserAccount>;
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
     * Get transaction history
     */
    getTransactionHistory(limit?: number): TransactionRecord[];
    /**
     * Look up transaction status by signature
     */
    getTransactionStatus(signature: string): TransactionRecord | {
        signature: string;
        status: "not_found";
        message: string;
    };
    /**
     * Credit user balance on buyback or sale
     */
    creditBalance(amountUsdc: number): void;
    /**
     * Debit user balance on pack buy
     */
    debitBalance(amountUsdc: number): void;
}
