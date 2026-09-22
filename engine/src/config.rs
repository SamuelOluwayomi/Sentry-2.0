use anyhow::Result;
use std::env;

#[derive(Debug, Clone, PartialEq)]
pub enum TxProvider {
    Beam,
    Jito,
}

impl TxProvider {
    pub fn from_env() -> Self {
        match env::var("TX_PROVIDER")
            .unwrap_or_else(|_| "beam".to_string())
            .to_lowercase()
            .as_str()
        {
            "jito" => TxProvider::Jito,
            _ => TxProvider::Beam,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            TxProvider::Beam => "beam",
            TxProvider::Jito => "jito",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub solana_rpc_url: String,
    /// Yellowstone-compatible gRPC endpoint (Solami: grpc.solami.dev)
    pub grpc_endpoint: String,
    pub grpc_token: String,
    pub tx_provider: TxProvider,
    /// Beam HTTP endpoint for transaction landing
    pub beam_endpoint: String,
    /// Jito block engine URL, used when TX_PROVIDER=jito
    pub jito_block_engine_url: String,
    pub wallet_private_key: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenv::dotenv().ok();

        // Accept both GRPC_* (Solami) and YELLOWSTONE_* (legacy SolInfra) names.
        let grpc_endpoint = env::var("GRPC_ENDPOINT")
            .or_else(|_| env::var("YELLOWSTONE_ENDPOINT"))
            .expect("GRPC_ENDPOINT not set");

        let grpc_token = env::var("GRPC_TOKEN")
            .or_else(|_| env::var("YELLOWSTONE_TOKEN"))
            .expect("GRPC_TOKEN not set");

        let solana_rpc_url = env::var("SOLANA_RPC_URL")
            .expect("SOLANA_RPC_URL not set");

        let beam_endpoint = env::var("BEAM_ENDPOINT")
            .unwrap_or_else(|_| "https://beam.solami.dev".to_string());

        let jito_block_engine_url = env::var("JITO_BLOCK_ENGINE_URL")
            .unwrap_or_else(|_| "https://mainnet.block-engine.jito.wtf".to_string());

        let wallet_private_key = env::var("WALLET_PRIVATE_KEY")
            .expect("WALLET_PRIVATE_KEY not set");

        Ok(Self {
            solana_rpc_url,
            grpc_endpoint,
            grpc_token,
            tx_provider: TxProvider::from_env(),
            beam_endpoint,
            jito_block_engine_url,
            wallet_private_key,
        })
    }

    pub fn yellowstone_endpoint(&self) -> &str { &self.grpc_endpoint }
    pub fn yellowstone_token(&self)    -> &str { &self.grpc_token }
}
