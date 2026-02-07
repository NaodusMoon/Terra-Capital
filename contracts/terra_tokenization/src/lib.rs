#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, String};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Marketplace,
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
    const MAX_TEXT_LEN: u32 = 120;

    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextAssetId, &1_u64);
    }

    pub fn set_marketplace(env: Env, marketplace: Address) {
        let admin = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Admin)
            .unwrap_or_else(|| panic!("not initialized"));
        admin.require_auth();
        env.storage().instance().set(&DataKey::Marketplace, &marketplace);
    }

    pub fn get_marketplace(env: Env) -> Option<Address> {
        env.storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Marketplace)
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
        if category.len() == 0 || category.len() > Self::MAX_TEXT_LEN {
            panic!("invalid category length");
        }
        if title.len() == 0 || title.len() > Self::MAX_TEXT_LEN {
            panic!("invalid title length");
        }

        let id = env
            .storage()
            .instance()
            .get::<DataKey, u64>(&DataKey::NextAssetId)
            .unwrap_or(1);
        if id == u64::MAX {
            panic!("asset id overflow");
        }

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
        let next_id = id.checked_add(1).unwrap_or_else(|| panic!("next asset id overflow"));
        env.storage().instance().set(&DataKey::NextAssetId, &next_id);

        id
    }

    pub fn buy_tokens(env: Env, buyer: Address, asset_id: u64, quantity: i128) -> i128 {
        // Cuando existe marketplace configurado, se fuerza el flujo cross-contract
        // para que no se puedan saltar pagos/comisiones.
        if env.storage().instance().has(&DataKey::Marketplace) {
            panic!("use marketplace contract");
        }
        buyer.require_auth();
        Self::apply_sale(env, asset_id, quantity, buyer)
    }

    pub fn execute_sale(
        env: Env,
        seller: Address,
        buyer: Address,
        asset_id: u64,
        quantity: i128,
    ) -> i128 {
        let marketplace = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Marketplace)
            .unwrap_or_else(|| panic!("marketplace not configured"));
        marketplace.require_auth();

        let total = Self::apply_sale(env.clone(), asset_id, quantity, buyer);
        let asset = env
            .storage()
            .persistent()
            .get::<DataKey, Asset>(&DataKey::Asset(asset_id))
            .unwrap_or_else(|| panic!("asset not found"));
        if asset.seller != seller {
            panic!("seller mismatch");
        }
        total
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

    fn apply_sale(env: Env, asset_id: u64, quantity: i128, buyer: Address) -> i128 {
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

        asset.available_tokens = asset
            .available_tokens
            .checked_sub(quantity)
            .unwrap_or_else(|| panic!("available token underflow"));
        env.storage().persistent().set(&DataKey::Asset(asset_id), &asset);

        let key = DataKey::Balance((asset_id, buyer.clone()));
        let prev = env.storage().persistent().get::<DataKey, i128>(&key).unwrap_or(0);
        let updated_balance = prev
            .checked_add(quantity)
            .unwrap_or_else(|| panic!("buyer balance overflow"));
        env.storage().persistent().set(&key, &updated_balance);

        asset
            .price_per_token
            .checked_mul(quantity)
            .unwrap_or_else(|| panic!("cost overflow"))
    }
}
