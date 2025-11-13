import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import idlJson from "../target/idl/vimix_airdrop.json";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { log, newTransactionWithComputeUnitPriceAndLimit, sendVersionedTx } from "./helpers";
import {
  tokenProgramId,
  MERKLE_ROOT_SEEDS,
  ProgramID,
  adminKeypair,
  airdropTokenMint,
} from "./constants";
import { getConnection } from "./connection";

async function main() {
  const operator = adminKeypair;
  const connection = getConnection();
  console.log(`signer wallet public key is: ${operator.publicKey}`);
  console.log(
    `signer wallet balance is: ${(await connection.getBalance(operator.publicKey)) / LAMPORTS_PER_SOL
    } SOL`
  );
  console.log("airdrop token mint:", airdropTokenMint.toBase58());

  // return;

  const phase = new anchor.BN(1);

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

  const merkleTokenVault = getAssociatedTokenAddressSync(
    airdropTokenMint,
    merkleRoot,
    true,
    tokenProgramId
  );
  console.log("merkleTokenVault: ", merkleTokenVault.toBase58());

  // return;

  let tx = newTransactionWithComputeUnitPriceAndLimit();

  const addressesToStore = [
    airdropTokenMint,
    merkleRoot,
    merkleTokenVault,
    // 常用程序地址
    anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    tokenProgramId,
    SystemProgram.programId,
  ];
  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: operator.publicKey,
      payer: operator.publicKey,
      recentSlot: await connection.getSlot(),
    });
  tx.add(lookupTableInst);

  console.log("新创建的 LUT 地址:", lookupTableAddress.toBase58());

  // 3. 创建一个向 LUT 添加地址的指令
  const extendInst = AddressLookupTableProgram.extendLookupTable({
    payer: operator.publicKey,
    authority: operator.publicKey,
    lookupTable: lookupTableAddress,
    addresses: addressesToStore,
  });
  tx.add(extendInst);

  // initialize global state
  const inst = await program.methods
    .initMerkleRoot(
      phase,
      new Uint8Array(
        Buffer.from(
          "acfbe0b31b3bd998c47d7abe118c03bbae4407abbea48427b5528d03d427af4f",
          "hex"
        )
      )
    )
    .accounts({
      admin: operator.publicKey,
      airdropTokenMint: airdropTokenMint,
      merkleRoot: merkleRoot,
      merkleTokenVault: merkleTokenVault,
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

  const merkleInfo = await (program.account as any).merkleRoot.fetch(
    merkleRoot
  );
  console.log("merkle root info: ", JSON.stringify(merkleInfo));
}

main().then(() => process.exit());
