import { PublicKey, Keypair } from "@solana/web3.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { loadKeypairFromFile } from "./helpers";
import { Key } from "@metaplex-foundation/mpl-token-metadata";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

// admin keypair
export const adminKeypair = loadKeypairFromFile("./.keys/devnet/admin.json");

export const ProgramID = new PublicKey(
  "5hFNEgPoU55nCmohrdN6rGdAxqim32qtDzaMHnNiREzF" // devnet
);

export const airdropTokenMint = new PublicKey(
  "3N5Su3zJyWtTYXiyknHb1eV4T9j3RokeFyveWWizHYB9" // devnet
);

export const tokenProgramId = TOKEN_2022_PROGRAM_ID;

export const lutAddress = new PublicKey(
  "HWiYJM37xCWEFNQo3cEoxyRG7mpfyy7h5WixHZXsZrJi" // devnet phase 1
);

export const MERKLE_ROOT_SEEDS = Buffer.from("merkle_root");
export const CLAIM_RECORD_SEEDS = Buffer.from("claim_record");
