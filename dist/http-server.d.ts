import nacl from "tweetnacl";
export interface PendingTransaction {
    id: string;
    payerAddress: string;
    action: "PACK_OPEN" | "SWAP" | "PAYMENT";
    description: string;
    amountUsd: number;
    serializedTxBase64: string;
    recentBlockhash: string;
    status: "pending_approval" | "broadcasting" | "finalized" | "failed";
    dappKeyPair?: nacl.BoxKeyPair;
    sharedSecret?: Uint8Array;
    phantomSessionToken?: string;
    txSignature?: string;
    error?: string;
    metadata?: any;
    createdAt: number;
}
export declare function startHttpServer(port?: number): import("node:http").Server<typeof import("node:http").IncomingMessage, typeof import("node:http").ServerResponse>;
