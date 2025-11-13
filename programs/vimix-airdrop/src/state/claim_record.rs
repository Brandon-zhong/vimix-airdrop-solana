use anchor_lang::prelude::*;
use anchor_lang::InitSpace;

#[account]
#[derive(Debug, InitSpace)]
pub struct ClaimRecord {
    pub bump: u8,
}

impl ClaimRecord {
    pub const SEEDS: &'static [u8] = b"claim_record";
}
