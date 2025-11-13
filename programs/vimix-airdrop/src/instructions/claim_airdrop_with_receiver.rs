use crate::{
    claim_airdrop::proof_data,
    errors::ErrorCode,
    state::{ClaimRecord, MerkleRoot},
    utils::{self, *},
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use sha2::{Digest, Sha256};

use solana_program::{
    instruction::Instruction,
    sysvar::instructions::{load_instruction_at_checked, ID as IX_ID},
};

#[derive(Accounts)]
#[instruction(_phase: u8, _proof_owner: Pubkey)]
pub struct ClaimAirdropWithReceiver<'info> {
    #[account(mut)]
    signer: Signer<'info>,
    #[account(
        mint::token_program = token_program,
    )]
    airdrop_token_mint: Box<InterfaceAccount<'info, Mint>>,

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
        associated_token::authority = signer,
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
            _proof_owner.as_ref(),
            airdrop_token_mint.key().as_ref(),
        ],
        bump
    )]
    claim_airdrop_record: Box<Account<'info, ClaimRecord>>,

    /// CHECK: This is the instructions sysvar. We are validating its address
    /// against the official program ID `solana_program::sysvar::instructions::ID`
    /// in the `#[account(address = ...)]` constraint. It is safe to read from this account.
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,

    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>,
}

pub fn verify_signature(
    ctx: &Context<ClaimAirdropWithReceiver>,
    proof_owner: Pubkey,
    proof: &Vec<u8>,
    receiver: Pubkey,
    expire_at: i64,
    signature: [u8; 64],
    verify_ix_index: u8,
) -> Result<()> {
    let hash_data: [u8; 32] = Sha256::digest(proof.as_slice()).into();
    let mut data = [0u8; 32 + 32 + 8];
    data[..32].copy_from_slice(hash_data.as_ref());
    data[32..64].copy_from_slice(receiver.as_ref());
    data[64..72].copy_from_slice(expire_at.to_le_bytes().as_ref());

    let hash_data: [u8; 32] = Sha256::digest(data.as_ref()).into();

    let hex_payload = hex::encode(hash_data);
    // msg!("hex_payload: {:?}", hex_payload);
    // msg!("hex_payload bytes: {:?}", hex_payload.as_bytes());

    // Get what should be the Ed25519Program instruction
    let ix: Instruction =
        load_instruction_at_checked(verify_ix_index as usize, &ctx.accounts.ix_sysvar)?;

    // Check that ix is what we expect to have been sent
    utils::verify_ed25519_ix(
        &ix,
        &proof_owner.to_bytes(),
        hex_payload.as_bytes(),
        &signature,
    )?;

    Ok(())
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
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        expire_at > Clock::get()?.unix_timestamp,
        ErrorCode::SignatureExpire
    );
    require!(
        !ctx.accounts.merkle_root.paused,
        ErrorCode::AirdropHasPaused
    );

    verify_signature(
        &ctx,
        proof_owner,
        &proof,
        ctx.accounts.signer.key(),
        expire_at,
        signature,
        verify_ix_index,
    )?;

    let proof_data = proof_data(phase, proof_owner, amount);

    require!(
        verify_merkle_proof(
            ctx.accounts.merkle_root.merkle_root,
            proof_data,
            proof,
            // leaves_index,
            // ctx.accounts.merkle_root.total_leaves,
        ),
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
