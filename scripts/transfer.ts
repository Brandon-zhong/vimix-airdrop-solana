import {
    LAMPORTS_PER_SOL,
    PublicKey,
} from "@solana/web3.js";
import { getConnection } from "./connection";
import Decimal from "decimal.js";
import { adminKeypair, airdropTokenMint, tokenProgramId } from "./constants";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { transferSpl } from "./utils";

async function main() {
    const connection = getConnection();

    const mint = airdropTokenMint;
    const from = adminKeypair;
    const to = new PublicKey("2gdZ79Mgc64PXrTs2orgoHjvXXKw2sHuBZDDR9JAjn9c");
    const amount = new Decimal(10000 * LAMPORTS_PER_SOL);

    const mintAccount = await connection.getAccountInfo(mint);
    const tokenProgram = mintAccount.owner;
    const toTokenAccount = await connection.getAccountInfo(getAssociatedTokenAddressSync(
        mint,
        to,
        true,
        tokenProgram
    ));
    const needInitTokenAccount = toTokenAccount == undefined;

    await transferSpl(connection, airdropTokenMint, tokenProgram,
        from, to, BigInt(amount.toFixed(0)), needInitTokenAccount);
}

main().then(() => process.exit());
