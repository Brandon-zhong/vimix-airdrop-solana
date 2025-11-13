import * as fs from "fs";
import * as anchor from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  type ConfirmOptions,
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
  TransactionMessage,
  AddressLookupTableAccount,
  VersionedTransaction,
  TransactionSignature,
} from "@solana/web3.js";
import * as path from "path";
import {
  AuthorityType,
  createAssociatedTokenAccount,
  createAssociatedTokenAccountIdempotent,
  createInitializeMetadataPointerInstruction,
  createSetAuthorityInstruction,
  createUpdateFieldInstruction,
  getMint,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ExtensionType,
  TYPE_SIZE,
  LENGTH_SIZE,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  pack,
  TokenMetadata,
} from "@solana/spl-token-metadata";
// const TOKEN_PROGRAM_ID = new PublicKey(
//   "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
// );
import {
  createInitializeMint2Instruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
} from "@solana/spl-token";

export async function airdropSol(
  connection: Connection,
  publicKey: PublicKey,
  amount: number
) {
  let airdropTx = await connection.requestAirdrop(
    publicKey,
    amount * anchor.web3.LAMPORTS_PER_SOL
  );
  await confirmTransaction(connection, airdropTx);
}

export function loadKeypairFromFile(filepath: string): anchor.web3.Keypair {
  try {
    // Read the JSON keypair file
    const keypairFile = fs.readFileSync(filepath, "utf-8");
    const keypairData = JSON.parse(keypairFile);

    // Convert the keypair data to a Uint8Array
    const secretKey = Uint8Array.from(keypairData);

    // Create a Keypair object from the secret key
    const keypair = anchor.web3.Keypair.fromSecretKey(secretKey);

    return keypair;
  } catch (error) {
    console.error("Error loading keypair:", error);
    throw error;
  }
}

export async function confirmTransaction(
  connection: Connection,
  txHash: string
) {
  const latestBlockHash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: txHash,
  });
}

export async function log(signature: string): Promise<string> {
  console.log(
    `Your transaction details: ${signature}
        - https://solscan.io/tx/${signature}?cluster=devnet
      `
  );
  return signature;
}

export function saveKeypairToFile(
  keypair: anchor.web3.Keypair,
  filepath: string
) {
  const keypairFile = path.join(
    filepath,
    `${keypair.publicKey.toBase58()}.json`
  );
  fs.writeFileSync(keypairFile, JSON.stringify(Array.from(keypair.secretKey)));
}

export async function checkMintExistence(
  connection: Connection,
  mintAddress: PublicKey
): Promise<boolean> {
  try {
    await getMint(connection, mintAddress);
    return true;
  } catch (err) {
    return false;
  }
}

export async function createMintInstructions(
  connection: Connection,
  payer: Signer,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number,
  keypair = Keypair.generate(),
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_PROGRAM_ID
): Promise<Transaction> {
  const lamports = await getMinimumBalanceForRentExemptMint(connection);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: keypair.publicKey,
      space: MINT_SIZE,
      lamports,
      programId,
    }),
    createInitializeMint2Instruction(
      keypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority,
      programId
    )
  );

  return transaction;
}

export async function createMintInstructions2022(
  connection: Connection,
  payer: Signer,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number,
  tokenMint: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_2022_PROGRAM_ID
): Promise<Transaction> {
  // const lamports = await getMinimumBalanceForRentExemptMint(connection);

  const metadata: TokenMetadata = {
    mint: tokenMint,
    name: name,
    symbol: symbol,
    uri: uri,
    additionalMetadata: [["new-field", "new-value"]],
  };

  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintLen + metadataLen
  );

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: tokenMint,
      space: mintLen,
      lamports: mintLamports,
      programId,
    }),
    createInitializeMetadataPointerInstruction(
      tokenMint,
      mintAuthority,
      tokenMint,
      programId
    ),
    createInitializeMint2Instruction(
      tokenMint,
      decimals,
      mintAuthority,
      freezeAuthority,
      programId
    ),
    createInitializeInstruction({
      programId: programId,
      mint: tokenMint,
      metadata: tokenMint,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
      mintAuthority: payer.publicKey,
      updateAuthority: payer.publicKey,
    })
  );

  return transaction;
}

export function newTransactionWithComputeUnitPriceAndLimit(): Transaction {
  return new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 1000000,
    }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 30000,
    })
  );
}

export function mintSetAuthorityInstruction(
  account: PublicKey,
  currentAuthority: PublicKey,
  newAuthority: PublicKey | null,
  multiSigners: Signer[] = [],
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_2022_PROGRAM_ID
): Transaction {
  return new Transaction().add(
    createSetAuthorityInstruction(
      account,
      currentAuthority,
      AuthorityType.MintTokens,
      newAuthority,
      multiSigners,
      programId
    ),
    createSetAuthorityInstruction(
      account,
      currentAuthority,
      AuthorityType.FreezeAccount,
      newAuthority,
      multiSigners,
      programId
    )
  );
}

export async function createTokenAccount(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey
) {
  return await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    owner
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export function readAirdropCsv(csvFile: string): Record<string, number> {
  const data = fs.readFileSync(path.join(__dirname, csvFile), "utf8");
  const userTotals = new Map<string, number>();
  data
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(","))
    .filter(([addr, amt]) => {
      try {
        new PublicKey(addr);
        return !isNaN(parseFloat(amt));
      } catch {
        return false;
      }
    })
    .forEach(([addr, amt]) => {
      const amount = parseFloat(amt);
      if (userTotals.has(addr)) {
        const existingAmount = userTotals.get(addr)!;
        userTotals.set(addr, existingAmount + amount);
      } else {
        userTotals.set(addr, amount);
      }
    })
  return Object.fromEntries(userTotals.entries());
}

export function getProofByUser(
  network: string,
  user: PublicKey
):
  | {
    amount: string;
    proof: string[];
  }
  | undefined {
  const data = fs.readFileSync(
    path.join(__dirname, "../data_merkle_proofs_" + network + ".json"),
    "utf-8"
  );
  interface merkleRoot {
    merkle_root: string;
    leaves: Map<
      string,
      {
        amount: string;
        proof: string[];
      }
    >;
  }

  const merkleInfo: merkleRoot = JSON.parse(data);

  return merkleInfo.leaves[user.toBase58()];
}

export async function sendVersionedTx(connection: Connection, signer: Keypair,
  tx: Transaction, addressLookupTableAccounts?: AddressLookupTableAccount[]): Promise<TransactionSignature> {
  const { blockhash } = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
    instructions: tx.instructions,
  }).compileToV0Message(addressLookupTableAccounts);
  const versionedTx = new VersionedTransaction(messageV0);
  versionedTx.sign([signer]);
  // const serializedTx = versionedTx.serialize();
  // const txSize = serializedTx.length;
  // console.log(`✅ 这笔版本化交易的大小是: ${txSize} 字节`);
  return connection.sendTransaction(versionedTx);

}