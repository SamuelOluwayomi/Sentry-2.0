use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use tracing::{info, warn, error};



#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BundleStatus {
    Submitted,
    Pending,
    Landed,
    Failed,
    Invalid,
}
 
impl std::fmt::Display for BundleStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BundleStatus::Submitted => write!(f, "Submitted"),
            BundleStatus::Pending => write!(f, "Pending"),
            BundleStatus::Landed => write!(f, "Landed"),
            BundleStatus::Failed => write!(f, "Failed"),
            BundleStatus::Invalid => write!(f, "Invalid"),
        }
    } 
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleRun {
    pub bundle_id: String,
    pub signature: String,
    pub tip_lamports: u64,
    pub tip_account: String,
    pub status: BundleStatus,
    pub submitted_at: DateTime<Utc>,
    pub landed_at: Option<DateTime<Utc>>,
    pub error_reason: Option<String>,
    pub run_number: u32,

    // Multi-stage lifecycle tracking
    pub submit_slot: Option<u64>,
    pub landed_slot: Option<u64>,
    pub processed_at: Option<DateTime<Utc>>,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub finalized_at: Option<DateTime<Utc>>,
    pub confirmation_source: Option<String>,

    // Failure classification 
    pub failure_type: Option<String>,
    pub failure_stage: Option<String>,
    pub recovery: Option<String>,
}

impl BundleRun {
    /// Create a new BundleRun with default lifecycle fields.
    pub fn new(
        bundle_id: String,
        signature: String,
        tip_lamports: u64,
        tip_account: String,
        status: BundleStatus,
        run_number: u32,
    ) -> Self {
        Self {
            bundle_id,
            signature,
            tip_lamports,
            tip_account,
            status,
            submitted_at: Utc::now(),
            landed_at: None,
            error_reason: None,
            run_number,
            submit_slot: None,
            landed_slot: None,
            processed_at: None,
            confirmed_at: None,
            finalized_at: None,
            confirmation_source: None,
            failure_type: None,
            failure_stage: None,
            recovery: None,
        }
    }

    /// Classify a failure with structured metadata.
    pub fn classify_failure(&mut self, failure_type: &str, stage: &str, recovery: &str) {
        self.failure_type = Some(failure_type.to_string());
        self.failure_stage = Some(stage.to_string());
        self.recovery = Some(recovery.to_string());
    }
}

const LOG_FILE: &str = "lifecycle_log.jsonl";
const LOGS_DIR: &str = "../logs";

/// Append a bundle run to both the engine-local and project-level lifecycle log files.
pub fn log_run(run: &BundleRun) {
    let json = serde_json::to_string(run).expect("serialize BundleRun");

    // Write to engine-local log
    let log_file_env = std::env::var("LIFECYCLE_LOG_PATH").unwrap_or_else(|_| LOG_FILE.to_string());
    let path = Path::new(&log_file_env);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }

    match OpenOptions::new().create(true).append(true).open(path) {
        Ok(mut file) => {
            if let Err(e) = writeln!(file, "{}", json) {
                error!("Failed to write lifecycle log: {}", e);
            } else {
                info!("Logged run #{} -> {} | status={}", run.run_number, run.bundle_id, run.status);
            }
        }
        Err(e) => {
            error!("Failed to open lifecycle log file: {}", e);
        }
    }

    // Also write to project-level logs/ directory
    let logs_dir_env = std::env::var("LOGS_DIR").unwrap_or_else(|_| LOGS_DIR.to_string());
    let logs_dir = Path::new(&logs_dir_env);
    if let Err(e) = std::fs::create_dir_all(logs_dir) {
        warn!("Could not create logs directory: {}", e);
        return;
    }
    let project_log = logs_dir.join("lifecycle_log.jsonl");
    match OpenOptions::new().create(true).append(true).open(&project_log) {
        Ok(mut file) => {
            if let Err(e) = writeln!(file, "{}", json) {
                warn!("Failed to write project lifecycle log: {}", e);
            }
        }
        Err(e) => {
            warn!("Failed to open project lifecycle log: {}", e);
        }
    }
}

/// Poll Solana RPC at each commitment level to build the full lifecycle timeline.
/// Tracks: Processed -> Confirmed -> Finalized with timestamps and slot numbers.
pub async fn track_bundle(
    tx_provider_url: &str,
    rpc_url: &str,
    yellowstone_endpoint: Option<&str>,
    yellowstone_token: Option<&str>,
    bundle_id: &str,
    run: &mut BundleRun,
    max_polls: u32,
    poll_interval_ms: u64,
) {
    let client = reqwest::Client::new();
    let rpc_client = solana_rpc_client::rpc_client::RpcClient::new(rpc_url.to_string());

    let sig = match run.signature.parse::<solana_sdk::signature::Signature>() {
        Ok(s) => s,
        Err(e) => {
            error!("Cannot parse signature for lifecycle tracking: {}", e);
            run.status = BundleStatus::Failed;
            run.error_reason = Some(format!("Invalid signature: {}", e));
            run.classify_failure("invalid_signature", "pre-tracking", "Check transaction construction");
            return;
        }
    };

    let _ = (yellowstone_endpoint, yellowstone_token); // handled in main.rs

    for attempt in 1..=max_polls {
        tokio::time::sleep(tokio::time::Duration::from_millis(poll_interval_ms)).await;

        // 1. Poll Solana RPC for signature status at all commitment levels
        match rpc_client.get_signature_statuses(&[sig]) {
            Ok(response) => {
                if let Some(Some(status)) = response.value.into_iter().next() {
                    if let Some(ref err) = status.err {
                        error!(
                            "Transaction failed on-chain: {:?} (poll {}/{})",
                            err, attempt, max_polls
                        );
                        run.status = BundleStatus::Failed;
                        run.error_reason = Some(format!("On-chain error: {:?}", err));
                        run.classify_failure(
                            "on_chain_error",
                            "execution",
                            "Check instruction logic and account state",
                        );
                        return;
                    }

                    // Record the slot
                    if run.landed_slot.is_none() {
                        run.landed_slot = Some(status.slot);
                    }

                    // Track each commitment level transition
                    if let Some(ref conf_status) = status.confirmation_status {
                        let level = format!("{:?}", conf_status);

                        // Processed
                        if run.processed_at.is_none() {
                            run.processed_at = Some(Utc::now());
                            info!(
                                "Lifecycle [Processed] slot={} (poll {}/{})",
                                status.slot, attempt, max_polls
                            );
                        }

                        // Confirmed
                        if level == "Confirmed" || level == "Finalized" {
                            if run.confirmed_at.is_none() {
                                run.confirmed_at = Some(Utc::now());
                                if run.confirmation_source.is_none() {
                                    run.confirmation_source =
                                        Some("rpc_polling_fallback".to_string());
                                }
                                info!(
                                    "Lifecycle [Confirmed] slot={} (poll {}/{})",
                                    status.slot, attempt, max_polls
                                );
                            }
                        }

                        // Finalized
                        if level == "Finalized" {
                            if run.finalized_at.is_none() {
                                run.finalized_at = Some(Utc::now());
                                info!(
                                    "Lifecycle [Finalized] slot={} (poll {}/{})",
                                    status.slot, attempt, max_polls
                                );
                            }
                        }

                        // Mark as landed once we have at least Confirmed
                        if run.confirmed_at.is_some() && run.status != BundleStatus::Landed {
                            run.status = BundleStatus::Landed;
                            run.landed_at = Some(run.confirmed_at.unwrap());
                            if run.confirmation_source.is_none() {
                                run.confirmation_source =
                                    Some("rpc_polling_fallback".to_string());
                            }
                            info!(
                                "Bundle landed on-chain at slot {} (poll {}/{})",
                                status.slot, attempt, max_polls
                            );
                        }

                        // If finalized, we are done polling
                        if run.finalized_at.is_some() {
                            let proc_to_conf = match (run.processed_at, run.confirmed_at) {
                                (Some(p), Some(c)) => {
                                    let delta = (c - p).num_milliseconds();
                                    format!("{}ms", delta)
                                }
                                _ => "--".to_string(),
                            };
                            let conf_to_final = match (run.confirmed_at, run.finalized_at) {
                                (Some(c), Some(f)) => {
                                    let delta = (f - c).num_milliseconds();
                                    format!("{}ms", delta)
                                }
                                _ => "--".to_string(),
                            };
                            info!(
                                "Lifecycle complete: processed->confirmed={} confirmed->finalized={}",
                                proc_to_conf, conf_to_final
                            );
                            return;
                        }
                    }
                } else {
                    info!(
                        "Solana RPC: signature not on-chain yet (poll {}/{})",
                        attempt, max_polls
                    );
                }
            }
            Err(e) => {
                warn!(
                    "Solana RPC get_signature_statuses error: {} (poll {}/{})",
                    e, attempt, max_polls
                );
            }
        }

        // 2. If not yet processed, check provider-specific inflight status.
        // This is only available for Jito (getInflightBundleStatuses).
        // Beam uses the Solana RPC confirmation path exclusively.
        let is_jito = tx_provider_url.contains("jito") || tx_provider_url.contains("block-engine");
        if run.processed_at.is_none() && is_jito {
            let inflight_url = format!(
                "{}/api/v1/getInflightBundleStatuses",
                tx_provider_url.trim_end_matches('/')
            );
            let body = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getInflightBundleStatuses",
                "params": [[bundle_id]]
            });

            match client.post(&inflight_url).json(&body).send().await {
                Ok(resp) => {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        if let Some(status_str) = json
                            .pointer("/result/value/0/status")
                            .and_then(|s| s.as_str())
                        {
                            match status_str {
                                "Failed" => {
                                    error!(
                                        "Provider marked bundle as Failed (poll {}/{})",
                                        attempt, max_polls
                                    );
                                    run.status = BundleStatus::Failed;
                                    run.error_reason =
                                        Some("Block engine rejected bundle".to_string());
                                    run.classify_failure(
                                        "jito_rejection",
                                        "block_engine",
                                        "Check tip amount and leader schedule",
                                    );
                                    return;
                                }
                                "Landed" => {
                                    let slot = json
                                        .pointer("/result/value/0/landed_slot")
                                        .and_then(|s| s.as_u64());
                                    info!(
                                        "Provider reports Landed at slot {:?} (poll {}/{})",
                                        slot, attempt, max_polls
                                    );
                                    if let Some(s) = slot {
                                        run.landed_slot = Some(s);
                                    }
                                }
                                "Pending" => {
                                    info!(
                                        "Provider: bundle still Pending (poll {}/{})",
                                        attempt, max_polls
                                    );
                                }
                                _ => {}
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("HTTP error polling provider inflight status: {}", e);
                }
            }
        }
    }

    // Timed out -- mark status accordingly
    if run.status == BundleStatus::Submitted || run.status == BundleStatus::Pending {
        if run.confirmed_at.is_some() {
            // We confirmed but did not finalize in time (normal -- finalization is slow)
            run.status = BundleStatus::Landed;
            run.landed_at = run.confirmed_at;
            info!("Bundle confirmed but finalization timed out (normal)");
        } else if run.processed_at.is_some() {
            // Processed but not confirmed
            run.status = BundleStatus::Pending;
            run.error_reason = Some("Processed but not confirmed within timeout".to_string());
            run.classify_failure(
                "confirmation_timeout",
                "confirmation",
                "May need higher tip or retry during less congested slot",
            );
        } else {
            // Never appeared on-chain
            run.status = BundleStatus::Failed;
            run.error_reason = Some("Transaction never appeared on-chain".to_string());
            run.classify_failure(
                "not_landed",
                "submission",
                "Check blockhash freshness and provider leader availability",
            );
        }
    }
}
