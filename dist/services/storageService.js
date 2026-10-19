import fs from "fs";
import path from "path";
export class StorageService {
    static instance;
    dataDir;
    dataFilePath;
    data;
    saveTimeout = null;
    constructor() {
        this.dataDir = path.resolve(process.cwd(), "data");
        this.dataFilePath = path.join(this.dataDir, "collector_vault_state.json");
        if (!fs.existsSync(this.dataDir)) {
            try {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            catch (err) {
                console.warn("[StorageService] Could not create data directory, using memory fallback", err);
            }
        }
        this.data = this.loadState();
    }
    static getInstance() {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService();
        }
        return StorageService.instance;
    }
    loadState() {
        try {
            if (fs.existsSync(this.dataFilePath)) {
                const raw = fs.readFileSync(this.dataFilePath, "utf-8");
                const parsed = JSON.parse(raw);
                console.log(`[StorageService] Loaded persistent state from ${this.dataFilePath}`);
                return parsed;
            }
        }
        catch (err) {
            console.warn("[StorageService] Failed to load persistent state, initializing fresh:", err);
        }
        return {
            accounts: {},
            userCardPortfolios: {},
            packHistory: [],
            transactionHistory: [],
            lastUpdated: new Date().toISOString()
        };
    }
    /**
     * Schedule debounced atomic write to disk
     */
    scheduleSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.flushToDisk();
        }, 1500); // 1.5s debounce to protect disk I/O
    }
    flushToDisk() {
        try {
            this.data.lastUpdated = new Date().toISOString();
            const tempPath = `${this.dataFilePath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), "utf-8");
            fs.renameSync(tempPath, this.dataFilePath); // Atomic file replace
        }
        catch (err) {
            console.error("[StorageService] Error writing persistent state to disk:", err);
        }
    }
    // Account operations
    getAccount(address) {
        return this.data.accounts[address];
    }
    saveAccount(account) {
        this.data.accounts[account.walletAddress] = account;
        this.scheduleSave();
    }
    // Portfolio card operations
    getUserCards(address) {
        return this.data.userCardPortfolios[address];
    }
    saveUserCards(address, cards) {
        this.data.userCardPortfolios[address] = cards;
        this.scheduleSave();
    }
    // Pack history
    getPackHistory() {
        return this.data.packHistory || [];
    }
    savePackHistory(history) {
        this.data.packHistory = history;
        this.scheduleSave();
    }
    // Transaction history
    getTransactionHistory() {
        return this.data.transactionHistory || [];
    }
    saveTransactionHistory(history) {
        this.data.transactionHistory = history;
        this.scheduleSave();
    }
}
//# sourceMappingURL=storageService.js.map