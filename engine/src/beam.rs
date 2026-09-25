use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use bincode;
use chrono::Utc;
use rand::seq::SliceRandom;
use solana_sdk::{
    instruction::Instruction,
    message::Message,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};
use std::str::FromStr;
use tracing::{error, info, warn};

use crate::lifecycle::{BundleRun, BundleStatus};

const MEMO_PROGRAM_ID: &str = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const TIP_ADDRESSES_URL: &str = "https://api.solami.dev/onchain/tip-addresses";
const TIP_FLOOR_LAMPORTS: u64 = 30_000;

// Hardcoded fallback tip accounts taken from the live API response.
const FALLBACK_TIP_ACCOUNTS: &[&str] = &[
    "15qWd4huAkoxvhDsHMfpUn27TW1YBYMMJJ2jkAkbeam",
    "9XuGciSwr5wb7dLTQm91JhuBTvj3GG8WjuRDc3obeam",
    "kiQioJNyFG7pU36ELLsRKXkeT48kFbk3b6rSgrWbeam",
    "kjmVhW1UzJrW2sU5bY5NtZ79jpvjSStsj37Pzmabeam",
    "kREnjPWFpt4AHeY5pijPmyXaCrMnbatUQJo7d3Xbeam",
    "praRZG6N6MdbsT4EFpKgZJWReZGXQhAMFcH68oCbeam",
    "SqoKQKU5uwBxovq3R7yEBxFwptc4z7vwoghU3M9beam",
    "sV72TY66T1RfmDSeHPPbwX6wwJ3bBv5hd4ehJ8tbeam",
    "swf8MyEeLo7gtRUo27UuJj6naCASUrypU7dbteSbeam",
    "uiuaQsxA47JybQAVN4FTfYuoEDkMiXV1r591Aewbeam",
];

/// Fetch Beam tip accounts from the live Solami API.
/// Falls back to the hardcoded list if the API is unreachable.
async fn get_tip_accounts(client: &reqwest::Client) -> Vec<String> {
    match client.get(TIP_ADDRESSES_URL).send().await {
        Ok(resp) => match resp.json::<Vec<String>>().await {
            Ok(accounts) if !accounts.is_empty() => {
                info!("Beam tip accounts: {} fetched from API", accounts.len());
                accounts
            }
            _ => {
                warn!("Beam tip account API returned empty list, using fallback");
                FALLBACK_TIP_ACCOUNTS
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            }
        },
        Err(e) => {
            warn!("Beam tip account fetch failed ({}), using fallback", e);
            FALLBACK_TIP_ACCOUNTS
                .iter()
                .map(|s| s.to_string())
                .collect()
        }
    }
}

/// Return the baseline tip.
pub async fn get_dynamic_tip() -> Result<u64> {
    Ok(TIP_FLOOR_LAMPORTS)
}

/// Build a transaction containing a memo instruction and an inline tip transfer,

pub async fn build_and_submit_bundle(
    rpc_url: &str,
    beam_endpoint: &str,
    keypair: &Keypair,
    tip_lamports: u64,
    run_number: u32,
    memo_text: &str,
) -> Result<BundleRun> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .context("build reqwest client")?;

    // Fetch tip accounts and select one at random.
    let tip_accounts = get_tip_accounts(&client).await;
    let tip_account_str = tip_accounts
        .choose(&mut rand::thread_rng())
        .ok_or_else(|| anyhow!("tip accounts list empty"))?
        .clone();

    let tip_account = Pubkey::from_str(&tip_account_str)
        .with_context(|| format!("parse tip account pubkey: {}", tip_account_str))?;

    let memo_program =
        Pubkey::from_str(MEMO_PROGRAM_ID).expect("hardcoded memo program ID is valid");

    info!(
        "Beam sender: tip={} lamports, account={}, memo={}",
        tip_lamports, tip_account_str, memo_text
    );

    // Instruction 1: memo.
    let memo_ix = Instruction {
        program_id: memo_program,
        accounts: vec![],
        data: memo_text.as_bytes().to_vec(),
    };

    // Instruction 2: inline tip transfer.
    let tip_ix = system_instruction::transfer(&keypair.pubkey(), &tip_account, tip_lamports);

    // Fetch a fresh blockhash at confirmed commitment.
    // Using confirmed (not finalized) maximises the validity window.
    let rpc = solana_rpc_client::rpc_client::RpcClient::new(rpc_url.to_string());

    let force_expired = std::env::var("FORCE_EXPIRED_HASH").is_ok();
    let blockhash = if force_expired {
        warn!("FORCE_EXPIRED_HASH active: using zero blockhash for fault injection");
        solana_sdk::hash::Hash::default()
    } else {
        rpc.get_latest_blockhash().context("get_latest_blockhash")?
    };

    // Simulate before signing.
    let message = Message::new(&[memo_ix.clone(), tip_ix.clone()], Some(&keypair.pubkey()));
    let sim_tx = Transaction::new_unsigned(message);

    let sim_result = rpc.simulate_transaction(&sim_tx);
    match sim_result {
        Ok(ref resp) if resp.value.err.is_some() => {
            let err_str = format!("{:?}", resp.value.err.as_ref().unwrap());
            error!("Simulation failed: {}", err_str);
            let mut fail = BundleRun::new(
                "simulation_failed".to_string(),
                String::new(),
                tip_lamports,
                tip_account_str,
                BundleStatus::Failed,
                run_number,
            );
            fail.error_reason = Some(err_str.clone());
            fail.classify_failure(
                "simulation_failure",
                "pre_submission",
                "Check instruction validity and compute budget",
            );
            return Ok(fail);
        }
        Err(e) => {
            let msg = format!("{:#}", e);
            if msg.contains("BlockhashNotFound") {
                let mut fail = BundleRun::new(
                    String::new(),
                    String::new(),
                    tip_lamports,
                    tip_account_str,
                    BundleStatus::Failed,
                    run_number,
                );
                fail.error_reason = Some("Blockhash expired before simulation".to_string());
                fail.classify_failure(
                    "blockhash_expired",
                    "pre_submission",
                    "Fetch a fresh blockhash and resubmit",
                );
                return Ok(fail);
            }
        }
        _ => {}
    }

    // Sign.
    let message =
        Message::new_with_blockhash(&[memo_ix, tip_ix], Some(&keypair.pubkey()), &blockhash);
    let mut tx = Transaction::new_unsigned(message);
    tx.sign(&[keypair], blockhash);

    let signature = tx.signatures[0].to_string();
    info!("Beam submission: signature={}", signature);

    let raw = bincode::serialize(&tx).context("serialize transaction")?;
    let encoded = B64.encode(&raw);

    // sendTransaction JSON-RPC body, identical to what Jito accepts.
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sendTransaction",
        "params": [
            encoded,
            { "encoding": "base64", "skipPreflight": true }
        ]
    });

    let url = format!("{}/", beam_endpoint.trim_end_matches('/'));
    info!("Posting to Beam: {}", url);

    let submitted_at = Utc::now();

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .context("Beam HTTP POST")?;

    let status_code = resp.status();
    let body_text = resp.text().await.unwrap_or_default();
    info!(
        "Beam response HTTP {}: {}",
        status_code,
        &body_text[..body_text.len().min(200)]
    );

    let parsed: serde_json::Value =
        serde_json::from_str(&body_text).unwrap_or(serde_json::Value::Null);

    if let Some(err) = parsed.get("error") {
        let msg = err["message"]
            .as_str()
            .unwrap_or("beam_rejection")
            .to_string();
        error!("Beam rejected transaction: {}", msg);
        let mut fail = BundleRun::new(
            String::new(),
            signature,
            tip_lamports,
            tip_account_str,
            BundleStatus::Failed,
            run_number,
        );
        fail.error_reason = Some(msg.clone());
        fail.classify_failure(
            if msg.to_lowercase().contains("tip") {
                "zero_tip"
            } else {
                "jito_rejection"
            },
            "submission",
            "Check tip amount is above Beam minimum (30,000 lamports)",
        );
        return Ok(fail);
    }

    // On success, result contains the transaction signature.
    let bundle_id = parsed
        .get("result")
        .and_then(|r| r.as_str())
        .unwrap_or(&signature)
        .to_string();

    info!("Beam accepted: bundle_id={}", bundle_id);

    let mut run = BundleRun::new(
        bundle_id,
        signature,
        tip_lamports,
        tip_account_str,
        BundleStatus::Submitted,
        run_number,
    );
    run.submitted_at = submitted_at;
    Ok(run)
}
