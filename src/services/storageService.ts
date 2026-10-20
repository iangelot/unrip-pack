import fs from "fs";
import path from "path";
import { UserAccount, VaultedCard, OpenedPackRecord, TransactionRecord } from "../types.js";

interface PersistentData {
  accounts: Record<string, UserAccount>;
  userCardPortfolios: Record<string, VaultedCard[]>;
  packHistory: Record<string, OpenedPackRecord[]>;
  transactionHistory: Record<string, TransactionRecord[]>;
  lastUpdated: string;
}

export class StorageService {
  private static instance: StorageService;
  private dataDir: string;
  private dataFilePath: string;
  private data: PersistentData;
  private saveTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.dataDir = path.resolve(process.cwd(), "data");
    this.dataFilePath = path.join(this.dataDir, "collector_vault_state.json");

    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        console.warn("[StorageService] Could not create data directory, using memory fallback", err);
      }
    }

    this.data = this.loadState();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private loadState(): PersistentData {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        console.log(`[StorageService] Loaded persistent state from ${this.dataFilePath}`);
        // Legacy versions stored these histories globally. Discard those rows
        // instead of attributing one wallet's activity to every connected user.
        return {
          accounts: parsed.accounts || {},
          userCardPortfolios: parsed.userCardPortfolios || {},
          packHistory: Array.isArray(parsed.packHistory) ? {} : (parsed.packHistory || {}),
          transactionHistory: Array.isArray(parsed.transactionHistory) ? {} : (parsed.transactionHistory || {}),
          lastUpdated: parsed.lastUpdated || new Date().toISOString()
        };
      }
    } catch (err) {
      console.warn("[StorageService] Failed to load persistent state, initializing fresh:", err);
    }

    return {
      accounts: {},
      userCardPortfolios: {},
      packHistory: {},
      transactionHistory: {},
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Schedule debounced atomic write to disk
   */
  public scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.flushToDisk();
    }, 1500); // 1.5s debounce to protect disk I/O
  }

  public flushToDisk() {
    try {
      this.data.lastUpdated = new Date().toISOString();
      const tempPath = `${this.dataFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), "utf-8");
      fs.renameSync(tempPath, this.dataFilePath); // Atomic file replace
    } catch (err) {
      console.error("[StorageService] Error writing persistent state to disk:", err);
    }
  }

  // Account operations
  public getAccount(address: string): UserAccount | undefined {
    return this.data.accounts[address];
  }

  public saveAccount(account: UserAccount) {
    this.data.accounts[account.walletAddress] = account;
    this.scheduleSave();
  }

  // Portfolio card operations
  public getUserCards(address: string): VaultedCard[] | undefined {
    return this.data.userCardPortfolios[address];
  }

  public saveUserCards(address: string, cards: VaultedCard[]) {
    this.data.userCardPortfolios[address] = cards;
    this.scheduleSave();
  }

  // Pack history
  public getPackHistory(address: string): OpenedPackRecord[] {
    return this.data.packHistory[address] || [];
  }

  public savePackHistory(address: string, history: OpenedPackRecord[]) {
    this.data.packHistory[address] = history;
    this.scheduleSave();
  }

  // Transaction history
  public getTransactionHistory(address: string): TransactionRecord[] {
    return this.data.transactionHistory[address] || [];
  }

  public saveTransactionHistory(address: string, history: TransactionRecord[]) {
    this.data.transactionHistory[address] = history;
    this.scheduleSave();
  }
}
