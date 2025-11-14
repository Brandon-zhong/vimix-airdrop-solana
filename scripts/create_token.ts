import {
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createMintToCheckedInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  createMintInstructions,
  createMintInstructions2022,
  log,
  newTransactionWithComputeUnitPriceAndLimit,
  sendVersionedTx,
} from "./helpers";
import { getConnection } from "./connection";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { adminKeypair } from "./constants";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";

async function createToken() {
  const connection = getConnection();
  console.log(
    `signer wallet public key is: ${adminKeypair.publicKey.toBase58()}`
  );
  console.log(
    `signer wallet balance is: ${(await connection.getBalance(adminKeypair.publicKey)) / LAMPORTS_PER_SOL
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
    await sendVersionedTx(connection, [
      adminKeypair,
      mintAccount,
    ], tx).then(log);
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
    `signer wallet balance is: ${(await connection.getBalance(adminKeypair.publicKey)) / LAMPORTS_PER_SOL
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

createToken().then(() => process.exit());
