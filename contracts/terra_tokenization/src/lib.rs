#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, String};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Asset(u64),
    NextAssetId,
    Balance((u64, Address)),
}

#[derive(Clone)]
#[contracttype]
pub struct Asset {
    pub id: u64,
    pub seller: Address,
    pub category: String,
    pub title: String,
    pub price_per_token: i128,
    pub total_tokens: i128,
    pub available_tokens: i128,
    pub active: bool,
}

#[contract]
pub struct TerraTokenization;

#[contractimpl]
impl TerraTokenization {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextAssetId, &1_u64);
    }

    pub fn create_asset(
        env: Env,
        seller: Address,
        category: String,
        title: String,
        price_per_token: i128,
        total_tokens: i128,
    ) -> u64 {
        seller.require_auth();

        if price_per_token <= 0 || total_tokens <= 0 {
            panic!("invalid asset values");
        }

        let id = env
            .storage()
            .instance()
            .get::<DataKey, u64>(&DataKey::NextAssetId)
            .unwrap_or(1);

        let asset = Asset {
            id,
            seller,
            category,
            title,
            price_per_token,
            total_tokens,
            available_tokens: total_tokens,
            active: true,
        };

        env.storage().persistent().set(&DataKey::Asset(id), &asset);
        env.storage().instance().set(&DataKey::NextAssetId, &(id + 1));

        id
    }

    pub fn buy_tokens(env: Env, buyer: Address, asset_id: u64, quantity: i128) -> i128 {
        buyer.require_auth();

        if quantity <= 0 {
            panic!("quantity must be > 0");
        }

        let mut asset = env
            .storage()
            .persistent()
            .get::<DataKey, Asset>(&DataKey::Asset(asset_id))
            .unwrap_or_else(|| panic!("asset not found"));

        if !asset.active {
            panic!("asset not active");
        }

        if asset.available_tokens < quantity {
            panic!("insufficient available tokens");
        }

        asset.available_tokens -= quantity;
        env.storage().persistent().set(&DataKey::Asset(asset_id), &asset);

        let key = DataKey::Balance((asset_id, buyer.clone()));
        let prev = env.storage().persistent().get::<DataKey, i128>(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(prev + quantity));

        asset.price_per_token * quantity
    }

    pub fn get_asset(env: Env, asset_id: u64) -> Asset {
        env.storage()
            .persistent()
            .get::<DataKey, Asset>(&DataKey::Asset(asset_id))
            .unwrap_or_else(|| panic!("asset not found"))
    }

    pub fn list_assets(env: Env, from_id: u64, limit: u32) -> Map<u64, Asset> {
        let mut out: Map<u64, Asset> = Map::new(&env);
        let max = if limit > 50 { 50 } else { limit };

        let next_id = env
            .storage()
            .instance()
            .get::<DataKey, u64>(&DataKey::NextAssetId)
            .unwrap_or(1);

        let mut current = from_id;
        let mut count: u32 = 0;

        while current < next_id && count < max {
            if let Some(asset) = env
                .storage()
                .persistent()
                .get::<DataKey, Asset>(&DataKey::Asset(current))
            {
                out.set(current, asset);
                count += 1;
            }
            current += 1;
        }

        out
    }

    pub fn get_buyer_balance(env: Env, asset_id: u64, buyer: Address) -> i128 {
        let key = DataKey::Balance((asset_id, buyer));
        env.storage().persistent().get::<DataKey, i128>(&key).unwrap_or(0)
    }

    pub fn set_asset_active(env: Env, seller: Address, asset_id: u64, active: bool) {
        seller.require_auth();

        let mut asset = env
            .storage()
            .persistent()
            .get::<DataKey, Asset>(&DataKey::Asset(asset_id))
            .unwrap_or_else(|| panic!("asset not found"));

        if asset.seller != seller {
            panic!("only seller can update asset");
        }

        asset.active = active;
        env.storage().persistent().set(&DataKey::Asset(asset_id), &asset);
    }
}
