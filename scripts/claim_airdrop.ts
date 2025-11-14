import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import idlJson from "../target/idl/vimix_airdrop.json";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Keypair,
  AddressLookupTableAccount,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getProofByUser, log, newTransactionWithComputeUnitPriceAndLimit, sendVersionedTx } from "./helpers";
import {
  tokenProgramId,
  MERKLE_ROOT_SEEDS,
  CLAIM_RECORD_SEEDS,
  ProgramID,
  adminKeypair,
  airdropTokenMint,
  lutAddress,
} from "./constants";
import { getConnection } from "./connection";
import * as fs from "fs";
import * as path from "path";

import * as ed from "@noble/ed25519";
import * as CryptoJS from "crypto-js";
// 设置 SHA-512 实现
import { sha512 } from "@noble/hashes/sha512";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function sha256(input: Buffer): Buffer {
  const wordArray = CryptoJS.lib.WordArray.create(input);
  const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
  const hashBuffer = Buffer.from(hash, "hex");
  return hashBuffer;
}

async function main() {
  const operator = adminKeypair;
  const receiver = adminKeypair.publicKey;
  const connection = getConnection();
  console.log(`signer wallet public key is: ${operator.publicKey}`);
  console.log(
    `signer wallet balance is: ${(await connection.getBalance(operator.publicKey)) / LAMPORTS_PER_SOL
    } SOL`
  );

  console.log("正在从链上获取地址查找表账户...");
  const lookupTableAccountResponse = await connection.getAddressLookupTable(
    lutAddress
  );

  const lookupTableAccount: AddressLookupTableAccount | null =
    lookupTableAccountResponse.value;

  if (!lookupTableAccount) {
    throw new Error(`无法在链上找到地址查找表: ${lutAddress.toBase58()}`);
  }

  const phase = new anchor.BN(1);
  const network = "solana_devnet"

  idlJson.address = ProgramID.toBase58();
  console.log("program id: ", idlJson.address);
  const program = new Program(idlJson as anchor.Idl, {
    connection,
    publicKey: operator.publicKey,
  });

  const [merkleRoot, merkleRootBump] = PublicKey.findProgramAddressSync(
    [
      MERKLE_ROOT_SEEDS,
      phase.toArrayLike(Buffer, "le", 1),
      airdropTokenMint.toBuffer(),
    ],
    program.programId
  );
  console.log(
    "merkle_root(init), bump: ",
    merkleRoot.toBase58(),
    merkleRootBump
  );

  const merkleRootInfo = await (program.account as any).merkleRoot.fetch(
    merkleRoot
  );
  console.log("merkleRootInfo: ", JSON.stringify(merkleRootInfo));

  console.log(
    "merkleRoot: ",
    Buffer.from(merkleRootInfo.merkleRoot).toString("hex")
  );

  const merkleTokenVault = getAssociatedTokenAddressSync(
    airdropTokenMint,
    merkleRoot,
    true,
    tokenProgramId
  );
  console.log("merkleTokenVault: ", merkleTokenVault.toBase58());

  const userTokenVault = getAssociatedTokenAddressSync(
    airdropTokenMint,
    receiver,
    true,
    tokenProgramId
  );
  console.log("userTokenVault: ", userTokenVault.toBase58());

  let tx = newTransactionWithComputeUnitPriceAndLimit();

  const proofInfo = getProofByUser(network, operator.publicKey);

  // const testpubkey = new PublicKey(
  //   "9UjpBegDsRGubapP4DAkys4BbbLHd22iP7EE77H2f9Hi"
  // );

  const [claimRecord, claimRecordBump] = PublicKey.findProgramAddressSync(
    [
      CLAIM_RECORD_SEEDS,
      phase.toArrayLike(Buffer, "le", 1),
      operator.publicKey.toBuffer(),
      airdropTokenMint.toBuffer(),
    ],
    program.programId
  );
  console.log(
    "claim record(init), bump: ",
    claimRecord.toBase58(),
    claimRecordBump
  );

  // return;

  const proof = proofInfo.proof.map((x) => Buffer.from(x, "hex"));
  const proofBuf = Buffer.concat(proof);

  const inst = await program.methods
    .claimAirdrop(
      phase,
      new anchor.BN(proofInfo.amount), // amount
      proofBuf // proof hash
    )
    .accounts({
      signer: operator.publicKey,
      airdropTokenMint: airdropTokenMint,
      receiver: receiver,
      merkleRoot: merkleRoot,
      merkleTokenVault: merkleTokenVault,
      userTokenVault: userTokenVault,
      claimRecord: claimRecord,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: tokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  tx.add(inst);


  try {
    await sendVersionedTx(connection, [operator], tx, [lookupTableAccount]).then(log);
  } catch (error) {
    console.error(error);
  }

  await new Promise((f) => setTimeout(f, 10000));

  // const claimRecordInfo = await (program.account as any).claimRecord.fetch(
  //   claimRecord
  // );
  // console.log("claimRecordInfo: ", JSON.stringify(claimRecordInfo));
}



function signClaimReward(
  authority: Keypair,
  proof: Buffer,
  receiver: PublicKey,
  expireAt: bigint
): { data: Uint8Array; signature: Uint8Array } {
  let data = Buffer.alloc(8);
  data.writeBigInt64LE(expireAt, 0);

  data = Buffer.concat([sha256(proof), receiver.toBytes(), data]);

  const dataHash = sha256(data);

  const signature = ed.sign(
    Uint8Array.from(dataHash),
    authority.secretKey.slice(0, 32)
  );

  //   console.log("Signature:", Buffer.from(signature).toString("base64"));
  return { data: Uint8Array.from(dataHash), signature };
}

main().then(() => process.exit());
