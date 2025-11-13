use sha2::{Digest, Sha256};

pub fn verify_merkle_proof(root: [u8; 32], leaf: [u8; 32], proof: Vec<u8>) -> bool {
    if proof.len() % 32 != 0 {
        return false;
    }

    let mut current_hash = leaf;

    for chunk in proof.chunks_exact(32) {
        let mut sibling = [0u8; 32];
        sibling.copy_from_slice(chunk);

        let mut combined = [0u8; 64];
        if current_hash <= sibling {
            combined[..32].copy_from_slice(&current_hash);
            combined[32..].copy_from_slice(&sibling);
        } else {
            combined[..32].copy_from_slice(&sibling);
            combined[32..].copy_from_slice(&current_hash);
        }

        current_hash = Sha256::digest(&combined).into();
    }

    current_hash == root
}
