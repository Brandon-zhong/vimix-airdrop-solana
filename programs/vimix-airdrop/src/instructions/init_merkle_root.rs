use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

#[derive(Accounts)]
#[instruction(_phase: u8)]
pub struct InitMerkleRoot<'info> {
    #[account(mut)]
    admin: Signer<'info>,
    #[account(
        mint::token_program = token_program,
    )]
    airdrop_token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = admin,
        space = 8 + MerkleRoot::INIT_SPACE,
        seeds = [MerkleRoot::SEEDS,  _phase.to_le_bytes().as_ref(), airdrop_token_mint.key().as_ref()],
        bump
    )]
    merkle_root: Box<Account<'info, MerkleRoot>>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::authority = merkle_root,
        associated_token::mint = airdrop_token_mint,
        associated_token::token_program = token_program
    )]
    merkle_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>,
}

pub fn init_merkle_root(
    ctx: Context<InitMerkleRoot>,
    phase: u8,
    merkle_root: [u8; 32],
) -> Result<()> {
    ctx.accounts.merkle_root.set_inner(MerkleRoot {
        bump: ctx.bumps.merkle_root,
        phase,
        admin: ctx.accounts.admin.key(),
        merkle_root,
        paused: false,
        padding: [0; 32],
    });
    Ok(())
}
