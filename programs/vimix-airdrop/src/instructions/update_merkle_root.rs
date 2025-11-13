use crate::{errors::ErrorCode, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenInterface},
};

#[derive(Accounts)]
#[instruction(_phase: u8)]
pub struct UpdateMerkleRoot<'info> {
    #[account(mut)]
    admin: Signer<'info>,
    #[account(
        mint::token_program = token_program,
    )]
    airdrop_token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [MerkleRoot::SEEDS,  _phase.to_le_bytes().as_ref(), airdrop_token_mint.key().as_ref()],
        bump,
        constraint = merkle_root.admin == admin.key() @ ErrorCode::InvalidAdmin,
    )]
    merkle_root: Box<Account<'info, MerkleRoot>>,

    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>,
}

pub fn update_merkle_root(ctx: Context<UpdateMerkleRoot>, merkle_root: [u8; 32]) -> Result<()> {
    ctx.accounts.merkle_root.merkle_root = merkle_root;
    Ok(())
}
