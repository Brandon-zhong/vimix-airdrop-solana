use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid admin")]
    InvalidAdmin,

    #[msg("Invalid merkle proof")]
    InvalidMerkleProof,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Signature verification failed.")]
    SigVerificationFailed,

    #[msg("Signature expire")]
    SignatureExpire,

    #[msg("Airdrop has paused")]
    AirdropHasPaused,
}
