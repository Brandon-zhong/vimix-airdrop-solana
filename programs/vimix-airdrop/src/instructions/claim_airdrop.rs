use crate::{
    errors::ErrorCode,
    state::{ClaimRecord, MerkleRoot},
    utils::*,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use sha2::{Digest, Sha256};

#[derive(Accounts)]
#[instruction(_phase: u8)]
pub struct ClaimAirdrop<'info> {
    #[account(mut)]
    signer: Signer<'info>,

    #[account(
        mint::token_program = token_program,
    )]
    airdrop_token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: We don't read or write the data of this account,
    /// but only use its public key as an authority constraint.
    /// The Anchor's associated_token constraint will ensure that the owner of the token account below is indeed this address.
    #[account()]
    receiver: UncheckedAccount<'info>,

    #[account(
        seeds = [MerkleRoot::SEEDS,  _phase.to_le_bytes().as_ref(), airdrop_token_mint.key().as_ref()],
        bump,
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
        payer = signer,
        associated_token::authority = receiver,
        associated_token::mint = airdrop_token_mint,
        associated_token::token_program = token_program
    )]
    user_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = signer,
        space = 8 + ClaimRecord::INIT_SPACE,
        seeds = [
            ClaimRecord::SEEDS,
            _phase.to_le_bytes().as_ref(),
            signer.key().as_ref(),
            airdrop_token_mint.key().as_ref(),
        ],
        bump
    )]
    claim_airdrop_record: Box<Account<'info, ClaimRecord>>,

    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>,
}

pub fn proof_data(phase: u8, user: Pubkey, amount: u64) -> [u8; 32] {
    let mut data = [0u8; 1 + 32 + 8];
    data[..1].copy_from_slice(phase.to_le_bytes().as_ref());
    data[1..33].copy_from_slice(user.as_ref());
    data[33..].copy_from_slice(amount.to_le_bytes().as_ref());
    // msg!("proof data: {:?}", data);
    Sha256::digest(data.as_ref()).into()
}

pub fn claim_airdrop(
    ctx: Context<ClaimAirdrop>,
    phase: u8,
    amount: u64,
    proof: Vec<u8>,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        !ctx.accounts.merkle_root.paused,
        ErrorCode::AirdropHasPaused
    );

    let proof_data = proof_data(phase, ctx.accounts.signer.key(), amount);

    require!(
        verify_merkle_proof(ctx.accounts.merkle_root.merkle_root, proof_data, proof,),
        ErrorCode::InvalidMerkleProof
    );

    ctx.accounts.merkle_token_vault.reload()?;
    require!(
        ctx.accounts.merkle_token_vault.amount >= amount,
        ErrorCode::InsufficientBalance
    );

    ctx.accounts.claim_airdrop_record.set_inner(ClaimRecord {
        bump: ctx.bumps.claim_airdrop_record,
    });

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
        amount,
        ctx.accounts.airdrop_token_mint.decimals,
    )?;

    Ok(())
}
