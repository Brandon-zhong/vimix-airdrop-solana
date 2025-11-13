import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import idlJson from "../target/idl/vimix_airdrop.json";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import {
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
  const connection = getConnection();
  console.log(`signer wallet public key is: ${operator.publicKey}`);
  console.log(
    `signer wallet balance is: ${(await connection.getBalance(operator.publicKey)) / LAMPORTS_PER_SOL
    } SOL`
  );

  // return;

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
  const network = "solana_devnet";
  const airdropKeypair = adminKeypair;

  const expireAt = new anchor.BN(Math.floor(Date.now() / 1000) + 300);
  // const expireAt = new anchor.BN(1762492444)

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
    operator.publicKey,
    true,
    tokenProgramId
  );
  console.log("userTokenVault: ", userTokenVault.toBase58());

  let tx = newTransactionWithComputeUnitPriceAndLimit();

  let verifyInstIdx = 2;

  console.log("user address: ", airdropKeypair.publicKey.toBase58());
  // return;

  const proofInfo = getProofByUser(network, airdropKeypair.publicKey);

  const [claimRecord, claimRecordBump] = PublicKey.findProgramAddressSync(
    [
      CLAIM_RECORD_SEEDS,
      phase.toArrayLike(Buffer, "le", 1),
      airdropKeypair.publicKey.toBuffer(),
      airdropTokenMint.toBuffer(),
    ],
    program.programId
  );
  console.log(
    "claim record(init), bump: ",
    claimRecord.toBase58(),
    claimRecordBump
  );

  const proof = proofInfo.proof.map((x) => Buffer.from(x, "hex"));
  const proofBuf = Buffer.concat(proof);

  let { data, signature } = signClaimReward(
    airdropKeypair,
    proofBuf,
    operator.publicKey,
    BigInt(expireAt.toString())
  );
  console.log("data", data);
  console.log("signature", signature);
  // return;

  const verifySignInst =
    anchor.web3.Ed25519Program.createInstructionWithPublicKey({
      publicKey: airdropKeypair.publicKey.toBytes(),
      message: data,
      signature: signature,
    });

  tx.add(verifySignInst);

  const inst = await program.methods
    .claimAirdropWithReceiver(
      phase,
      airdropKeypair.publicKey,
      new anchor.BN(proofInfo.amount), // amount
      proofBuf, // proof hash
      // new anchor.BN(proofInfo.index), // leaves index
      expireAt, // expireAt
      signature,
      new anchor.BN(verifyInstIdx) // verify_ix_index
    )
    .accounts({
      signer: operator.publicKey,
      airdropTokenMint: airdropTokenMint,
      merkleRoot: merkleRoot,
      merkleTokenVault: merkleTokenVault,
      userTokenVault: userTokenVault,
      claimRecord: claimRecord,
      ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: tokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  tx.add(inst);

  try {
    await sendVersionedTx(connection, operator, tx).then(log);
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

  console.log("proof hash: ", sha256(proof));
  console.log("receiver:", receiver.toBytes(), receiver.toBase58());
  console.log("data(expire): ", data);

  data = Buffer.concat([sha256(proof), receiver.toBytes(), data]);

  const dataHash = sha256(data);

  const dataHashStr = Buffer.from(dataHash).toString("hex");
  // console.log("dataHashStr: ", dataHashStr);

  const dataHashStrBytes = new TextEncoder().encode(dataHashStr);

  // console.log("dataHashStrBytes: ", dataHashStrBytes)

  const signature = ed.sign(dataHashStrBytes, authority.secretKey.slice(0, 32));

  // console.log("Signature:", signature);
  return { data: dataHashStrBytes, signature };
}

main().then(() => process.exit());
