import { z } from "zod";
export function registerVaultTools(server, ccService, accountService) {
    // Tool 1: get_vault_inventory
    server.tool("get_vault_inventory", "Browse and search physical collectibles authenticated and vaulted in Collector Crypt partner facilities (PSA/PWCC/ALT). Filter by franchise, grade, or price.", {
        query: z.string().optional().describe("Search term like 'Charizard', 'Luffy', 'Jordan', or 'Black Lotus'"),
        category: z.enum(["All", "Pokemon", "Sports", "OnePiece", "MagicTheGathering", "Other"]).optional().describe("Collectibles category"),
        gradingCompany: z.enum(["PSA", "BGS", "CGC", "SGC"]).optional().describe("Grading company filter"),
        minPriceUsdc: z.number().optional().describe("Minimum estimated price in USDC"),
        maxPriceUsdc: z.number().optional().describe("Maximum estimated price in USDC"),
        limit: z.number().optional().default(10).describe("Maximum number of cards to return")
    }, async (args) => {
        const results = ccService.searchVaultInventory({
            query: args.query,
            category: args.category,
            gradingCompany: args.gradingCompany,
            minPriceUsdc: args.minPriceUsdc,
            maxPriceUsdc: args.maxPriceUsdc,
            limit: args.limit
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(results, null, 2)
                }
            ]
        };
    });
    // Tool 2: get_card_details
    server.tool("get_card_details", "Retrieve in-depth vault metadata, provenance, grading certification number, and digital twin NFT mint for a specific vaulted collectible.", {
        cardId: z.string().describe("The card ID (e.g., 'cc-pkmn-001') or Solana NFT mint address")
    }, async (args) => {
        const card = ccService.getCardById(args.cardId);
        if (!card) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: Card with identifier "${args.cardId}" not found in Collector Crypt vault registry.`
                    }
                ],
                isError: true
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(card, null, 2)
                }
            ]
        };
    });
    // Tool 3: get_user_collection (Does NOT require userAddress; auto-resolves from session)
    server.tool("get_user_collection", "List all tokenized 1:1 card NFTs currently held in your vault. Does NOT require userAddress. Supports pagination via limit and offset.", {
        userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet."),
        limit: z.number().optional().default(10).describe("Number of cards to return (default 10)"),
        offset: z.number().optional().default(0).describe("Pagination offset (default 0)")
    }, async (args) => {
        try {
            const activeAddress = accountService.getActiveAddress(args.userAddress);
            const result = ccService.getUserVaultCards(activeAddress, args.limit, args.offset);
            const totalPortfolioValueUsdc = result.cards.reduce((sum, c) => sum + c.estimatedValueUsdc, 0);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            ownerAddress: activeAddress,
                            totalCardsHeldCount: result.total,
                            paginatedCount: result.cards.length,
                            hasMore: result.hasMore,
                            nextOffset: result.nextOffset,
                            estimatedPortfolioValueUsdc: totalPortfolioValueUsdc,
                            cards: result.cards
                        }, null, 2)
                    }
                ]
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error: ${msg}` }],
                isError: true
            };
        }
    });
    // Tool 4: transfer_vault_card
    server.tool("transfer_vault_card", "Transfer ownership of a tokenized 1:1 vaulted card NFT to another Solana wallet address.", {
        cardId: z.string().describe("The card ID (e.g. 'cc-pkmn-003') or NFT mint to transfer"),
        recipientAddress: z.string().describe("The recipient's Solana public address (Base58, 32-44 characters)"),
        userAddress: z.string().optional().describe("Optional sender address. Defaults to connected session wallet.")
    }, async (args) => {
        try {
            const senderAddress = accountService.getActiveAddress(args.userAddress);
            // Security Check: Verify cryptographic ownership
            accountService.requireVerifiedOwner("transfer vaulted card NFTs");
            const recipientTrimmed = args.recipientAddress.trim();
            if (senderAddress === recipientTrimmed) {
                return {
                    content: [{ type: "text", text: "Error: Sender address and recipient address cannot be identical." }],
                    isError: true
                };
            }
            if (!accountService.validateSolanaAddress(recipientTrimmed)) {
                return {
                    content: [{ type: "text", text: `Error: Invalid recipient Solana address "${recipientTrimmed}".` }],
                    isError: true
                };
            }
            const removedCard = ccService.removeCardFromUserCollection(senderAddress, args.cardId);
            // Security check: Cannot transfer card locked in loan escrow
            if (!removedCard.isAvailableForTrade) {
                ccService.addCardToUserCollection(senderAddress, removedCard);
                return {
                    content: [{ type: "text", text: `Error: Card "${removedCard.name}" is currently locked in lending escrow and cannot be transferred.` }],
                    isError: true
                };
            }
            ccService.addCardToUserCollection(recipientTrimmed, removedCard);
            const txSig = `5xfer${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}...sol`;
            accountService.recordTransaction({
                signature: txSig,
                type: "SWAP",
                status: "finalized",
                timestamp: new Date().toISOString(),
                description: `Transferred "${removedCard.name}" (${removedCard.grade}) to ${args.recipientAddress}`,
                amountUsd: 0,
                solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "TRANSFER_SUCCESSFUL",
                            message: `Successfully transferred "${removedCard.name}" to ${args.recipientAddress}.`,
                            transferredCard: {
                                name: removedCard.name,
                                grade: removedCard.grade,
                                certNumber: removedCard.certNumber,
                                nftMint: removedCard.nftMint,
                                estimatedValueUsdc: `$${removedCard.estimatedValueUsdc}`
                            },
                            recipient: args.recipientAddress,
                            solanaTxSignature: txSig,
                            solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
                        }, null, 2)
                    }
                ]
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error executing card transfer: ${msg}` }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=vaultTools.js.map