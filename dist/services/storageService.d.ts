import { UserAccount, VaultedCard, OpenedPackRecord, TransactionRecord } from "../types.js";
export declare class StorageService {
    private static instance;
    private dataDir;
    private dataFilePath;
    private data;
    private saveTimeout;
    private constructor();
    static getInstance(): StorageService;
    private loadState;
    /**
     * Schedule debounced atomic write to disk
     */
    scheduleSave(): void;
    flushToDisk(): void;
    getAccount(address: string): UserAccount | undefined;
    saveAccount(account: UserAccount): void;
    getUserCards(address: string): VaultedCard[] | undefined;
    saveUserCards(address: string, cards: VaultedCard[]): void;
    getPackHistory(): OpenedPackRecord[];
    savePackHistory(history: OpenedPackRecord[]): void;
    getTransactionHistory(): TransactionRecord[];
    saveTransactionHistory(history: TransactionRecord[]): void;
}
