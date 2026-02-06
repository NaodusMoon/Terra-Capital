use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::{Duration, SystemTime}};

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum StellarNetwork {
    Testnet,
    Public,
}

#[derive(Debug, Clone, Serialize)]
struct NetworkHealth {
    network: &'static str,
    horizon_version: String,
    core_version: String,
    current_protocol_version: i32,
    history_latest_ledger: i64,
    fetched_at_unix_ms: u128,
}

#[derive(Debug)]
struct CachedNetwork {
    data: NetworkHealth,
    fetched_at: SystemTime,
}

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    cache: Arc<RwLock<HashMap<StellarNetwork, CachedNetwork>>>,
    ttl: Duration,
}

#[derive(Debug, Deserialize)]
struct NetworkQuery {
    network: Option<StellarNetwork>,
}

#[derive(Debug, Serialize)]
struct ApiResponse {
    ok: bool,
    data: NetworkHealth,
    source: &'static str,
    cache_ttl_seconds: u64,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    ok: bool,
    error: String,
}

#[derive(Debug, Deserialize)]
struct HorizonRoot {
    horizon_version: String,
    core_version: String,
    current_protocol_version: i32,
    history_latest_ledger: i64,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "terra_capital_offchain=info,axum=info".to_string()),
        )
        .init();

    let port = std::env::var("BACKEND_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(8080);

    let ttl_seconds = std::env::var("NETWORK_CACHE_TTL_SECONDS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(15);

    let state = AppState {
        client: reqwest::Client::builder()
            .user_agent("terra-capital-offchain/0.1.0")
            .timeout(Duration::from_secs(12))
            .build()
            .expect("failed to build reqwest client"),
        cache: Arc::new(RwLock::new(HashMap::new())),
        ttl: Duration::from_secs(ttl_seconds),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/stellar/network", get(get_network_status))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("terra-capital-offchain listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind backend listener");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "service": "terra-capital-offchain"
    }))
}

async fn get_network_status(
    State(state): State<AppState>,
    Query(query): Query<NetworkQuery>,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ErrorResponse>)> {
    let network = query.network.unwrap_or(StellarNetwork::Testnet);

    {
        let read = state.cache.read().await;
        if let Some(cached) = read.get(&network) {
            if cached.fetched_at.elapsed().unwrap_or_default() < state.ttl {
                return Ok(Json(ApiResponse {
                    ok: true,
                    data: cached.data.clone(),
                    source: "cache",
                    cache_ttl_seconds: state.ttl.as_secs(),
                }));
            }
        }
    }

    let data = fetch_network_health(&state.client, network)
        .await
        .map_err(internal_error)?;

    {
        let mut write = state.cache.write().await;
        write.insert(
            network,
            CachedNetwork {
                data: data.clone(),
                fetched_at: SystemTime::now(),
            },
        );
    }

    Ok(Json(ApiResponse {
        ok: true,
        data,
        source: "horizon",
        cache_ttl_seconds: state.ttl.as_secs(),
    }))
}

fn horizon_url(network: StellarNetwork) -> &'static str {
    match network {
        StellarNetwork::Testnet => "https://horizon-testnet.stellar.org",
        StellarNetwork::Public => "https://horizon.stellar.org",
    }
}

fn network_name(network: StellarNetwork) -> &'static str {
    match network {
        StellarNetwork::Testnet => "testnet",
        StellarNetwork::Public => "public",
    }
}

async fn fetch_network_health(client: &reqwest::Client, network: StellarNetwork) -> Result<NetworkHealth, reqwest::Error> {
    let root = client
        .get(horizon_url(network))
        .header("Accept", "application/json")
        .send()
        .await?
        .error_for_status()?
        .json::<HorizonRoot>()
        .await?;

    let fetched_at_unix_ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    Ok(NetworkHealth {
        network: network_name(network),
        horizon_version: root.horizon_version,
        core_version: root.core_version,
        current_protocol_version: root.current_protocol_version,
        history_latest_ledger: root.history_latest_ledger,
        fetched_at_unix_ms,
    })
}

fn internal_error(err: reqwest::Error) -> (StatusCode, Json<ErrorResponse>) {
    error!("backend error while querying horizon: {}", err);
    (
        StatusCode::BAD_GATEWAY,
        Json(ErrorResponse {
            ok: false,
            error: format!("failed to query horizon: {err}"),
        }),
    )
}
