import {
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  PublicKey,
  Connection,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createMintToCheckedInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  createSyncNativeInstruction,
  createTransferInstruction,
  createCloseAccountInstruction,
  ACCOUNT_SIZE,
  createInitializeAccountInstruction,
} from "@solana/spl-token";
import {
  createMintInstructions,
  createMintInstructions2022,
  log,
  newTransactionWithComputeUnitPriceAndLimit,
} from "./helpers";
import { getConnection } from "./connection";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { adminKeypair } from "./constants";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@solana/spl-stake-pool/dist/codecs";

async function createToken() {
  const connection = getConnection();
  console.log(
    `signer wallet public key is: ${adminKeypair.publicKey.toBase58()}`
  );
  console.log(
    `signer wallet balance is: ${
      (await connection.getBalance(adminKeypair.publicKey)) / LAMPORTS_PER_SOL
    } SOL`
  );

  let mintAccount = Keypair.generate();
  console.log(
    `mint_account secret key is: ${bs58.encode(mintAccount.secretKey)}`
  );
  console.log(
    `mint_account public key is: ${mintAccount.publicKey.toBase58()}`
  );

  let programId = TOKEN_2022_PROGRAM_ID;

  // calculate user token account address
  const userTokenAccount = getAssociatedTokenAddressSync(
    mintAccount.publicKey,
    adminKeypair.publicKey,
    false,
    programId
  );
  console.log("userTokenAccount: ", userTokenAccount.toBase58());

  let tx = newTransactionWithComputeUnitPriceAndLimit();

  let tokenDecimals = 9;
  let tokenName = "Vimix Token";
  let tokenSymbol = "VIM";
  let tokenUri = "https://solana.com";

  // create token
  if (programId === TOKEN_PROGRAM_ID) {
    tx.add(
      await createMintInstructions(
        connection,
        adminKeypair,
        adminKeypair.publicKey,
        adminKeypair.publicKey,
        tokenDecimals,
        mintAccount
      )
    );
    tx.add(
      await createMetadataInstructions(
        mintAccount.publicKey,
        adminKeypair.publicKey,
        tokenName,
        tokenSymbol,
        tokenUri
      )
    );
  } else if (programId === TOKEN_2022_PROGRAM_ID) {
    tx.add(
      await createMintInstructions2022(
        connection,
        adminKeypair,
        adminKeypair.publicKey,
        adminKeypair.publicKey,
        tokenDecimals,
        mintAccount.publicKey,
        tokenName,
        tokenSymbol,
        tokenUri
      )
    );
  }

  // initialize token account
  tx.add(
    createAssociatedTokenAccountInstruction(
      adminKeypair.publicKey,
      userTokenAccount,
      adminKeypair.publicKey,
      mintAccount.publicKey,
      programId
    )
  );

  // // // // mint token
  tx.add(
    createMintToCheckedInstruction(
      mintAccount.publicKey, // mint
      userTokenAccount, // receiver (should be a token account)
      adminKeypair.publicKey, // mint authority
      2048000000e9, // amount. if your decimals is 8, you mint 10^8 for 1 token.
      tokenDecimals,
      [], // [signer1, signer2 ...], // only multisig account will use
      programId
    )
  );

  try {
    await sendAndConfirmTransaction(connection, tx, [
      adminKeypair,
      mintAccount,
    ]).then(log);
  } catch (error) {
    console.error(error);
  }
}

async function wrapSol(keypair: Keypair, connection: Connection) {
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

  let amount = 5 * 1e9; /* Wrapped SOL's decimals is 9 */

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
    await sendAndConfirmTransaction(connection, tx, [keypair]).then(log);
  } catch (error) {
    console.error(error);
  }
}

async function unwrapSol(keypair: Keypair, connection: Connection) {
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
  let amount = 0.1 * 1e9; /* Wrapped SOL's decimals is 9 */
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
    await sendAndConfirmTransaction(connection, tx, [
      keypair,
      tempTokenAccount,
    ]).then(log);
  } catch (error) {
    console.error(error);
  }
}

async function closeTokenAccount() {
  const connection = getConnection();

  const keypair = Keypair.fromSecretKey(bs58.decode(""));

  const ssolTokenMint = new PublicKey(
    "2EuVBErjP9TLFhD8KkfhhqSzxC5ce958S32hTV27BC97"
  );

  console.log("user.publicKey: ", keypair.publicKey.toBase58());

  let programId = TOKEN_PROGRAM_ID;

  const userTokenAccount = getAssociatedTokenAddressSync(
    ssolTokenMint,
    keypair.publicKey,
    true,
    programId
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
    await sendAndConfirmTransaction(connection, tx, [keypair]).then(log);
  } catch (error) {
    console.error(error);
  }
}

async function createMetadataInstructions(
  mintAddress: PublicKey,
  adminAddress: PublicKey,
  name: string,
  symbol: string,
  uri: string
): Promise<Transaction> {
  return new Transaction().add(
    createCreateMetadataAccountV3Instruction(
      {
        metadata: PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            PROGRAM_ID.toBuffer(),
            mintAddress.toBuffer(),
          ],
          PROGRAM_ID
        )[0],
        mint: mintAddress,
        mintAuthority: adminAddress,
        payer: adminAddress,
        updateAuthority: adminAddress,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: name,
            symbol: symbol,
            uri: uri,
            creators: null,
            sellerFeeBasisPoints: 0,
            uses: null,
            collection: null,
          },
          isMutable: false,
          collectionDetails: null,
        },
      }
    )
  );
}

async function createMetadata() {
  const connection = getConnection();
  console.log(
    `signer wallet public key is: ${adminKeypair.publicKey.toBase58()}`
  );
  console.log(
    `signer wallet balance is: ${
      (await connection.getBalance(adminKeypair.publicKey)) / LAMPORTS_PER_SOL
    } SOL`
  );

  let tx = newTransactionWithComputeUnitPriceAndLimit();

  let mintAccount = new PublicKey(
    "EZe5CXFAVyCB5v3sAUmYiUuneEn4kUxxj51841v1QbVQ"
  );

  let name = "glow sol";
  let symbol = "gsol";
  let uri = "https://solana.com";

  tx.add(
    await createMetadataInstructions(
      mintAccount,
      adminKeypair.publicKey,
      name,
      symbol,
      uri
    )
  );

  try {
    await sendAndConfirmTransaction(connection, tx, [
      adminKeypair,
      // mintAccount,
    ]).then(log);
  } catch (error) {
    console.error(error);
  }
}

async function checkTokenAccountExistence() {
  const connection = getConnection();
  let mintAccount = NATIVE_MINT;
  let account = new PublicKey("6b2ExeL4GkWYCkRKR7zxxDAX7GxcHRLfbJzqNvU5a84j");

  let tokenAccount = getAssociatedTokenAddressSync(
    mintAccount,
    account,
    true,
    TOKEN_PROGRAM_ID
  );

  console.log("sol address:", tokenAccount.toBase58());

  let accountInfo = await connection.getAccountInfo(tokenAccount);
  console.log("accountInfo:", accountInfo);
}

async function main() {
  // await wrapSol(userKeypair, getConnection());
  await createToken();
}

createToken().then(() => process.exit());
