use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use axum::{
    extract::{Json, State},
    http::{Method},
    routing::post,
    Router,
};
use tower_http::cors::CorsLayer;
use tokio::net::TcpListener;
use local_ip_address::local_ip;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Peer {
    pub id: String, // Likely IP + Port or unique ID
    pub ip: String,
    pub port: u16,
    pub nickname: String,
    pub last_seen: u64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ChallengePayload {
    pub from_player: String,
    pub item_title: String,
    pub item_points: i32,
    pub message: String,
}

pub struct AppState {
    mdns: Option<ServiceDaemon>,
    server_handle: Option<tokio::task::AbortHandle>,
    _local_port: u16,
}

// Global state using Arc<Mutex> for thread safety across commands
pub struct DiscoveryState(pub Arc<Mutex<AppState>>);

impl DiscoveryState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(AppState {
            mdns: None,
            server_handle: None,
            _local_port: 0,
        })))
    }
}

#[tauri::command]
pub async fn start_discovery(
    state: tauri::State<'_, DiscoveryState>,
    app_handle: AppHandle,
    nickname: String,
) -> Result<u16, String> {
    // 1. Start HTTP Server (Receiver)
    // Find an ephemeral port (0)
    let listener = TcpListener::bind("0.0.0.0:0").await.map_err(|e| e.to_string())?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    let port = addr.port();
    
    // Axum Router
    let app = Router::new()
        .route("/challenge", post(receive_challenge))
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods([Method::POST])
                .allow_headers(tower_http::cors::Any),
        )
        .with_state(app_handle.clone()); // Pass handle to handler

    let handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    
    // Store state
    {
        let mut state_guard = state.0.lock().map_err(|_| "Failed to lock state")?;
        state_guard._local_port = port;
        state_guard.server_handle = Some(handle.abort_handle());
        
        // 2. Start mDNS
        let mdns = ServiceDaemon::new().map_err(|e| e.to_string())?;
        state_guard.mdns = Some(mdns.clone());
    
        // Register Service
        let service_type = "_theochallengers._tcp.local.";
        // Unique instance name to avoid collisions on same machine
        let instance_name = format!("{}_{}", nickname, port); 
        
        let ip = local_ip().map_err(|_| "Failed to get local IP")?;
        
        let mut properties = HashMap::new();
        properties.insert("nickname".to_string(), nickname.clone());
        properties.insert("port".to_string(), port.to_string()); // Legacy property
    
        let service_info = ServiceInfo::new(
            service_type, // Type
            &instance_name, // Instance Name
            &format!("{}.local.", instance_name), // Hostname (not really used by mdns-sd in this field but required)
            ip.to_string(), // IP
            port,
            Some(properties), // Properties (Optional in mdns-sd crate < 0.8, looks like it takes direct map now)
        ).map_err(|e| e.to_string())?;
    
        mdns.register(service_info).map_err(|e| e.to_string())?;
    
        // Browse
        let browse_mdns = mdns.clone();
        let app_handle_browse = app_handle.clone();
        
        // Spawn browser task
        let browsing_task = async move {
            let receiver = browse_mdns.browse(service_type).unwrap();
            while let Ok(event) = receiver.recv_async().await {
               match event {
                   ServiceEvent::ServiceResolved(info) => {
                       // Extract details
                       let addresses = info.get_addresses();
                       // Prefer IPv4
                       if let Some(ip_addr) = addresses.iter().find(|ip| ip.is_ipv4()).or(addresses.iter().next()) {
                            // Check properties
                            let props = info.get_properties();
                            let nick_prop = props.get_property_val_str("nickname").unwrap_or("Unknown");
                            
                            let peer = Peer {
                                id: info.get_fullname().to_string(),
                                ip: ip_addr.to_string(),
                                port: info.get_port(),
                                nickname: nick_prop.to_string(),
                                last_seen: 0
                            };
                            
                            let _ = app_handle_browse.emit("peer-found", peer);
                       }
                   }
                   ServiceEvent::ServiceRemoved(_service_type, fullname) => {
                        let _ = app_handle_browse.emit("peer-lost", fullname);
                   }
                   _ => {}
               }
            }
        };
        tokio::spawn(browsing_task);
    } // Unlock

    Ok(port)
}

#[tauri::command]
pub fn stop_discovery(state: tauri::State<'_, DiscoveryState>) -> Result<(), String> {
    let mut state_guard = state.0.lock().map_err(|_| "Failed to lock state")?;
    
    if let Some(mdns) = &state_guard.mdns {
        let _ = mdns.shutdown();
    }
    state_guard.mdns = None;

    if let Some(handle) = &state_guard.server_handle {
        handle.abort();
    }
    state_guard.server_handle = None;
    
    Ok(())
}

// Handler
async fn receive_challenge(
    State(app_handle): State<AppHandle>,
    Json(payload): Json<ChallengePayload>,
) -> Json<String> {
    println!("Received challenge from {}", payload.from_player);
    let _ = app_handle.emit("challenge-received", payload);
    Json("OK".to_string())
}
