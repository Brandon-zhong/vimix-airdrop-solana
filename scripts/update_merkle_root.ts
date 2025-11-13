import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import idlJson from "../target/idl/vimix_airdrop.json";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { log, newTransactionWithComputeUnitPriceAndLimit, sendVersionedTx } from "./helpers";
import {
  tokenProgramId,
  MERKLE_ROOT_SEEDS,
  CLAIM_RECORD_SEEDS,
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

  const merkleInfoBefore = await (program.account as any).merkleRoot.fetch(
    merkleRoot
  );
  console.log("merkle info before: ", JSON.stringify(merkleInfoBefore));
  // return;

  let tx = newTransactionWithComputeUnitPriceAndLimit();

  // initialize global state
  const inst = await program.methods
    .updateMerkleRoot(
      phase,
      new Uint8Array(
        Buffer.from(
          "acfbe0b31b3bd998c47d7abe118c03bbae4407abbea48427b5528d03d427af4f",
          "hex"
        )
      ),
    )
    .accounts({
      admin: operator.publicKey,
      airdropTokenMint: airdropTokenMint,
      merkleRoot: merkleRoot,
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
  console.log("merkle info: ", JSON.stringify(merkleInfo));
}

main().then(() => process.exit());
