use anchor_lang::prelude::*;
use instructions::*;

mod errors;
mod instructions;
mod state;
mod utils;

declare_id!("5hFNEgPoU55nCmohrdN6rGdAxqim32qtDzaMHnNiREzF");

#[program]
pub mod vimix_airdrop {
    use super::*;

    pub fn init_merkle_root(
        ctx: Context<InitMerkleRoot>,
        phase: u8,
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::init_merkle_root(ctx, phase, merkle_root)
    }

    pub fn update_merkle_root(
        ctx: Context<UpdateMerkleRoot>,
        _phase: u8,
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::update_merkle_root(ctx, merkle_root)
    }

    pub fn claim_airdrop_with_receiver(
        ctx: Context<ClaimAirdropWithReceiver>,
        phase: u8,
        proof_owner: Pubkey,
        amount: u64,
        proof: Vec<u8>,
        expire_at: i64,
        signature: [u8; 64],
        verify_ix_index: u8,
    ) -> Result<()> {
        instructions::claim_airdrop_with_receiver(
            ctx,
            phase,
            proof_owner,
            amount,
            proof,
            expire_at,
            signature,
            verify_ix_index,
        )
    }

    pub fn claim_airdrop(
        ctx: Context<ClaimAirdrop>,
        phase: u8,
        amount: u64,
        proof: Vec<u8>,
    ) -> Result<()> {
        instructions::claim_airdrop(ctx, phase, amount, proof)
    }

    pub fn withdraw_unclaimed_tokens(
        ctx: Context<WithdrawUnclaimedTokens>,
        phase: u8,
    ) -> Result<()> {
        instructions::withdraw_unclaimed_tokens(ctx, phase)
    }

    pub fn update_airdrop_pause(
        ctx: Context<UpdateAirdropPause>,
        _phase: u8,
        paused: bool,
    ) -> Result<()> {
        instructions::update_airdrop_pause(ctx, paused)
    }
}
