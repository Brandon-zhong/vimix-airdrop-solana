use crate::{errors::ErrorCode, state::MerkleRoot};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

#[derive(Accounts)]
#[instruction(_phase: u8)]
pub struct WithdrawUnclaimedTokens<'info> {
    #[account(mut)]
    admin: Signer<'info>,
    #[account(
        mint::token_program = token_program,
    )]
    airdrop_token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        seeds = [MerkleRoot::SEEDS,  _phase.to_le_bytes().as_ref(), airdrop_token_mint.key().as_ref()],
        bump,
        constraint = merkle_root.admin == admin.key() @ ErrorCode::InvalidAdmin,
    )]
    merkle_root: Box<Account<'info, MerkleRoot>>,

    #[account(
        mut,
        associated_token::authority = merkle_root,
        associated_token::mint = airdrop_token_mint,
        associated_token::token_program = token_program
    )]
    merkle_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::authority = admin,
        associated_token::mint = airdrop_token_mint,
        associated_token::token_program = token_program
    )]
    user_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>,
}

pub fn withdraw_unclaimed_tokens(ctx: Context<WithdrawUnclaimedTokens>, phase: u8) -> Result<()> {
    require!(
        ctx.accounts.merkle_token_vault.amount > 0,
        ErrorCode::InvalidAmount
    );

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                mint: ctx.accounts.airdrop_token_mint.to_account_info(),
                from: ctx.accounts.merkle_token_vault.to_account_info(),
                to: ctx.accounts.user_token_vault.to_account_info(),
                authority: ctx.accounts.merkle_root.to_account_info(),
            },
            &[&[
                MerkleRoot::SEEDS,
                phase.to_le_bytes().as_ref(),
                ctx.accounts
                    .airdrop_token_mint
                    .to_account_info()
                    .key
                    .as_ref(),
                &[ctx.bumps.merkle_root],
            ][..]],
        ),
        ctx.accounts.merkle_token_vault.amount,
        ctx.accounts.airdrop_token_mint.decimals,
    )?;

    Ok(())
}
