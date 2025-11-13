use anchor_lang::prelude::*;
use anchor_lang::InitSpace;

#[account]
#[derive(Debug, InitSpace)]
pub struct MerkleRoot {
    pub bump: u8,
    pub admin: Pubkey,
    pub phase: u8,
    pub merkle_root: [u8; 32],
    pub paused: bool,
    pub padding: [u8; 32],
}

impl MerkleRoot {
    pub const SEEDS: &'static [u8] = b"merkle_root";
}
