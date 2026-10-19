import { PublicKey } from "@solana/web3.js";
export class AccountService {
    activeAccount;
    packHistory = [];
    transactionHistory = [];
    solanaService;
    constructor(solanaService) {
        this.solanaService = solanaService;
        // Default pre-connected wallet session so the user can interact immediately
        const defaultAddress = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
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
            createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
            lastActive: new Date().toISOString()
        };
        // Pre-populate realistic pack opening history so "what have I opened" works immediately
        this.packHistory.push({
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
        });
        this.transactionHistory.push({
            signature: "5KtPn8Y4zH1m...mock...tx1",
            type: "PACK_OPEN",
            status: "finalized",
            timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
            description: "Opened 1x Modern Alt-Art Pack for 35 USDC (Pulled PSA 9.5 Gengar VMAX)",
            amountUsd: 35,
            solanaExplorerUrl: "https://solscan.io/tx/5KtPn8Y4zH1m...mock...tx1"
        });
    }
    /**
     * Validate if a string is a valid Solana Base58 public key
     */
    validateSolanaAddress(address) {
        try {
            const pubkey = new PublicKey(address);
            return PublicKey.isOnCurve(pubkey.toBuffer());
        }
        catch {
            return false;
        }
    }
    /**
     * Link or change the connected wallet address
     */
    async connectWallet(address) {
        const trimmed = address.trim();
        if (!this.validateSolanaAddress(trimmed)) {
            throw new Error(`Invalid Solana address "${address}". A valid Solana address must be a base58 string 32-44 characters long.`);
        }
        this.activeAccount.walletAddress = trimmed;
        this.activeAccount.connectedVia = "Solana Native";
        this.activeAccount.isConnected = true;
        this.activeAccount.lastActive = new Date().toISOString();
        // Query live on-chain balances
        try {
            const live = await this.solanaService.getBalances(trimmed);
            this.activeAccount.balances.sol = live.sol;
            this.activeAccount.balances.usdc = live.usdc;
            this.activeAccount.balances.cards = live.cards;
        }
        catch {
            // Keep existing balance cache if network RPC is unavailable
        }
        return this.activeAccount;
    }
    /**
     * Get the active connected wallet address (auto-resolves for any tool)
     */
    getActiveAddress(explicitAddress) {
        if (explicitAddress && explicitAddress.trim().length > 0) {
            if (!this.validateSolanaAddress(explicitAddress.trim())) {
                throw new Error(`Invalid Solana address provided: "${explicitAddress}".`);
            }
            return explicitAddress.trim();
        }
        return this.activeAccount.walletAddress;
    }
    /**
     * Get complete account info
     */
    getAccount() {
        this.activeAccount.lastActive = new Date().toISOString();
        return this.activeAccount;
    }
    /**
     * Update spend safety limits
     */
    updateSpendLimits(updates) {
        this.activeAccount.spendLimits = {
            ...this.activeAccount.spendLimits,
            ...updates
        };
        return this.activeAccount.spendLimits;
    }
    /**
     * Check and enforce spend limits before moving funds
     */
    verifySpendSafety(amountUsd) {
        const limits = this.activeAccount.spendLimits;
        if (amountUsd > limits.perTransactionCapUsd) {
            return {
                allowed: false,
                requiresPasskeyPrompt: true,
                errorReason: `Amount of $${amountUsd} USD exceeds your per-transaction spend limit ($${limits.perTransactionCapUsd} USD). You can raise this with 'set_spend_limits'.`
            };
        }
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
    recordSpend(amountUsd) {
        this.activeAccount.spendLimits.dailySpentSoFarUsd += amountUsd;
    }
    /**
     * Record an opened pack and add to history
     */
    recordPackOpening(record) {
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
    }
    /**
     * Get pack history with optional pagination
     */
    getPackHistory(limit = 10) {
        return {
            totalOpened: this.packHistory.length,
            history: this.packHistory.slice(0, limit)
        };
    }
    /**
     * Record a transaction
     */
    recordTransaction(tx) {
        this.transactionHistory.unshift(tx);
    }
    /**
     * Get transaction history
     */
    getTransactionHistory(limit = 10) {
        return this.transactionHistory.slice(0, limit);
    }
    /**
     * Look up transaction status by signature
     */
    getTransactionStatus(signature) {
        const found = this.transactionHistory.find(t => t.signature === signature);
        if (found)
            return found;
        return {
            signature,
            status: "not_found",
            message: `Transaction signature "${signature}" not found in local session history. It may have been submitted on another client or is still propagating on Solana RPC.`
        };
    }
    /**
     * Credit user balance on buyback or sale
     */
    creditBalance(amountUsdc) {
        this.activeAccount.balances.usdc += amountUsdc;
    }
    /**
     * Debit user balance on pack buy
     */
    debitBalance(amountUsdc) {
        this.activeAccount.balances.usdc = Math.max(0, this.activeAccount.balances.usdc - amountUsdc);
    }
}
//# sourceMappingURL=accountService.js.map