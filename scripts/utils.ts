import { ACCOUNT_SIZE, createAssociatedTokenAccountInstruction, createCloseAccountInstruction, createInitializeAccountInstruction, createSyncNativeInstruction, createTransferInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { log, newTransactionWithComputeUnitPriceAndLimit, sendVersionedTx } from "./helpers";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";


export async function transferSpl(connection: Connection, mint: PublicKey, tokenProgram: PublicKey, from: Keypair, to: PublicKey, amount: bigint, needInitTokenAccount: boolean) {

    const fromTokenVault = getAssociatedTokenAddressSync(
        mint,
        from.publicKey,
        true,
        tokenProgram
    );

    const toTokenVault = getAssociatedTokenAddressSync(
        mint,
        to,
        true,
        tokenProgram
    );

    let tx = newTransactionWithComputeUnitPriceAndLimit();

    if (needInitTokenAccount) {
        tx.add(
            createAssociatedTokenAccountInstruction(
                from.publicKey,
                toTokenVault,
                to,
                mint,
                tokenProgram
            )
        );
    }

    tx.add(
        // trasnfer SOL
        createTransferInstruction(
            fromTokenVault,
            toTokenVault,
            from.publicKey,
            amount,
            [],
            tokenProgram,
        )
    );

    try {
        await sendVersionedTx(connection, [from], tx).then(log);
    } catch (error) {
        console.error(error);
    }
}

export async function unwrapSol(connection: Connection, keypair: Keypair, amount: bigint) {
    // const connection = getConnection();
    console.log("user.publicKey: ", keypair.publicKey.toBase58());

    const tempTokenAccount = Keypair.generate();

    console.log("tempTokenAccount: ", tempTokenAccount.publicKey.toBase58());

    let programId = TOKEN_PROGRAM_ID;

    const userTokenAccount = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        keypair.publicKey,
        true,
        programId
    );
    console.log("userTokenAccount: ", userTokenAccount.toBase58());
    let tx = newTransactionWithComputeUnitPriceAndLimit();

    tx.add(
        SystemProgram.createAccount({
            fromPubkey: keypair.publicKey,
            newAccountPubkey: tempTokenAccount.publicKey,
            space: ACCOUNT_SIZE,
            lamports: await connection.getMinimumBalanceForRentExemption(
                ACCOUNT_SIZE
            ),
            programId: programId,
        }),
        createInitializeAccountInstruction(
            tempTokenAccount.publicKey,
            NATIVE_MINT,
            keypair.publicKey,
            programId
        )
    );

    tx.add(
        // trasnfer SOL
        createTransferInstruction(
            userTokenAccount,
            tempTokenAccount.publicKey,
            keypair.publicKey,
            amount
        )
    );
    tx.add(
        createCloseAccountInstruction(
            tempTokenAccount.publicKey,
            keypair.publicKey,
            keypair.publicKey
        )
    );

    try {
        await sendVersionedTx(connection, [
            keypair,
            tempTokenAccount,
        ], tx).then(log);
    } catch (error) {
        console.error(error);
    }
}

export async function wrapSol(connection: Connection, keypair: Keypair, amount: bigint) {
    // const connection = getConnection();
    console.log("user.publicKey: ", keypair.publicKey.toBase58());

    let programId = TOKEN_PROGRAM_ID;

    const userTokenAccount = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        keypair.publicKey,
        true,
        programId
    );
    console.log("userTokenAccount: ", userTokenAccount.toBase58());
    let tx = newTransactionWithComputeUnitPriceAndLimit();

    let accountInfo = await connection.getAccountInfo(userTokenAccount);
    if (!accountInfo) {
        tx.add(
            createAssociatedTokenAccountInstruction(
                keypair.publicKey,
                userTokenAccount,
                keypair.publicKey,
                NATIVE_MINT,
                programId
            )
        );
    }
    tx.add(
        // trasnfer SOL
        SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: userTokenAccount,
            lamports: amount,
        }),
        // sync wrapped SOL balance
        createSyncNativeInstruction(userTokenAccount, programId)
    );
    try {
        await sendVersionedTx(connection, [keypair], tx).then(log);
    } catch (error) {
        console.error(error);
    }
}

export async function closeTokenAccount(connection: Connection, keypair: Keypair, mint: PublicKey, programID: PublicKey) {
    console.log("user.publicKey: ", keypair.publicKey.toBase58());
    const userTokenAccount = getAssociatedTokenAddressSync(
        mint,
        keypair.publicKey,
        true,
        programID
    );
    console.log("userTokenAccount: ", userTokenAccount.toBase58());
    let tx = newTransactionWithComputeUnitPriceAndLimit();
    tx.add(
        createCloseAccountInstruction(
            userTokenAccount,
            keypair.publicKey,
            keypair.publicKey
        )
    );

    try {
        await sendVersionedTx(connection, [keypair], tx).then(log);
    } catch (error) {
        console.error(error);
    }
}