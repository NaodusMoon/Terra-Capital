#![no_std]

use soroban_sdk::auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation};
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, token, vec, Address, Env, IntoVal, String,
    Symbol, Vec,
};

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

#[contractclient(name = "TokenizationClient")]
pub trait TokenizationInterface {
    fn get_asset(env: Env, asset_id: u64) -> Asset;
    fn execute_sale(env: Env, seller: Address, buyer: Address, asset_id: u64, quantity: i128) -> i128;
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    TokenizationContract,
    PaymentToken,
    PaymentTokenByNetwork(Symbol),
    ActiveNetwork,
    Treasury,
    FeeBps,
    LiquidityDestination,
    LiquidityShareBps,
}

#[derive(Clone)]
#[contracttype]
pub struct PurchaseReceipt {
    pub asset_id: u64,
    pub seller: Address,
    pub buyer: Address,
    pub quantity: i128,
    pub total_paid: i128,
    pub fee_paid: i128,
    pub seller_amount: i128,
}

#[contract]
pub struct TerraMarketplace;

#[contractimpl]
impl TerraMarketplace {
    const BPS_DENOMINATOR: i128 = 10_000;
    const MAX_FEE_BPS: i128 = 2_000;

    pub fn init(
        env: Env,
        admin: Address,
        tokenization_contract: Address,
        payment_token: Address,
        treasury: Address,
        fee_bps: i128,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();

        if fee_bps < 0 || fee_bps > Self::MAX_FEE_BPS {
            panic!("invalid fee bps");
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::TokenizationContract, &tokenization_contract);
        env.storage().instance().set(&DataKey::PaymentToken, &payment_token);
        env.storage().instance().set(&DataKey::ActiveNetwork, &Symbol::new(&env, "testnet"));
        env.storage()
            .instance()
            .set(&DataKey::PaymentTokenByNetwork(Symbol::new(&env, "testnet")), &payment_token);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage().instance().set(&DataKey::LiquidityShareBps, &0_i128);
    }

    pub fn set_fee_config(env: Env, treasury: Address, fee_bps: i128) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        if fee_bps < 0 || fee_bps > Self::MAX_FEE_BPS {
            panic!("invalid fee bps");
        }

        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
    }

    pub fn set_payment_token(env: Env, payment_token: Address) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::PaymentToken, &payment_token);
    }

    pub fn set_network_payment_token(env: Env, network: Symbol, payment_token: Address) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();
        if !Self::is_supported_network(env.clone(), network.clone()) {
            panic!("unsupported network");
        }
        env.storage()
            .instance()
            .set(&DataKey::PaymentTokenByNetwork(network), &payment_token);
    }

    pub fn set_active_network(env: Env, network: Symbol) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();
        if !Self::is_supported_network(env.clone(), network.clone()) {
            panic!("unsupported network");
        }
        env.storage().instance().set(&DataKey::ActiveNetwork, &network);
    }

    pub fn get_active_network(env: Env) -> Option<Symbol> {
        env.storage().instance().get::<DataKey, Symbol>(&DataKey::ActiveNetwork)
    }

    pub fn get_network_payment_token(env: Env, network: Symbol) -> Option<Address> {
        env.storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::PaymentTokenByNetwork(network))
    }

    pub fn set_liquidity_config(env: Env, destination: Option<Address>, share_bps: i128) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        if share_bps < 0 || share_bps > Self::BPS_DENOMINATOR {
            panic!("invalid liquidity bps");
        }

        if let Some(address) = destination {
            env.storage()
                .instance()
                .set(&DataKey::LiquidityDestination, &address);
            env.storage()
                .instance()
                .set(&DataKey::LiquidityShareBps, &share_bps);
        } else {
            env.storage().instance().remove(&DataKey::LiquidityDestination);
            env.storage().instance().set(&DataKey::LiquidityShareBps, &0_i128);
        }
    }

    pub fn preview_purchase(env: Env, buyer: Address, asset_id: u64, quantity: i128) -> PurchaseReceipt {
        let tokenization = Self::get_tokenization_contract(env.clone());
        let tokenization_client = TokenizationClient::new(&env, &tokenization);
        let asset = tokenization_client.get_asset(&asset_id);
        if quantity <= 0 {
            panic!("quantity must be > 0");
        }
        if !asset.active {
            panic!("asset not active");
        }
        if asset.available_tokens < quantity {
            panic!("insufficient available tokens");
        }

        let total = asset
            .price_per_token
            .checked_mul(quantity)
            .unwrap_or_else(|| panic!("cost overflow"));
        let fee_bps = Self::get_fee_bps(env.clone());
        let fee = Self::calc_bps(total, fee_bps);
        let seller_amount = total
            .checked_sub(fee)
            .unwrap_or_else(|| panic!("seller amount underflow"));

        PurchaseReceipt {
            asset_id,
            seller: asset.seller,
            buyer,
            quantity,
            total_paid: total,
            fee_paid: fee,
            seller_amount,
        }
    }

    pub fn buy_tokens(env: Env, buyer: Address, asset_id: u64, quantity: i128) -> PurchaseReceipt {
        buyer.require_auth();
        if quantity <= 0 {
            panic!("quantity must be > 0");
        }

        let tokenization = Self::get_tokenization_contract(env.clone());
        let tokenization_client = TokenizationClient::new(&env, &tokenization);
        let asset = tokenization_client.get_asset(&asset_id);
        if !asset.active {
            panic!("asset not active");
        }
        if asset.available_tokens < quantity {
            panic!("insufficient available tokens");
        }

        let total = asset
            .price_per_token
            .checked_mul(quantity)
            .unwrap_or_else(|| panic!("cost overflow"));
        let fee_bps = Self::get_fee_bps(env.clone());
        let fee = Self::calc_bps(total, fee_bps);
        let seller_amount = total
            .checked_sub(fee)
            .unwrap_or_else(|| panic!("seller amount underflow"));

        let payment_token = Self::get_payment_token(env.clone());
        let token_client = token::Client::new(&env, &payment_token);

        if seller_amount > 0 {
            token_client.transfer(&buyer, &asset.seller, &seller_amount);
        }

        if fee > 0 {
            let treasury = Self::get_treasury(env.clone());
            let liquidity_share_bps = Self::get_liquidity_share_bps(env.clone());
            let liquidity_destination = env
                .storage()
                .instance()
                .get::<DataKey, Address>(&DataKey::LiquidityDestination);

            if let Some(destination) = liquidity_destination {
                let liquidity_amount = Self::calc_bps(fee, liquidity_share_bps);
                let treasury_amount = fee
                    .checked_sub(liquidity_amount)
                    .unwrap_or_else(|| panic!("treasury amount underflow"));

                if treasury_amount > 0 {
                    token_client.transfer(&buyer, &treasury, &treasury_amount);
                }
                if liquidity_amount > 0 {
                    token_client.transfer(&buyer, &destination, &liquidity_amount);
                }
            } else {
                token_client.transfer(&buyer, &treasury, &fee);
            }
        }

        Self::authorize_sale_call(
            env.clone(),
            tokenization.clone(),
            asset.seller.clone(),
            buyer.clone(),
            asset_id,
            quantity,
        );

        let _ = tokenization_client.execute_sale(&asset.seller, &buyer, &asset_id, &quantity);

        PurchaseReceipt {
            asset_id,
            seller: asset.seller,
            buyer,
            quantity,
            total_paid: total,
            fee_paid: fee,
            seller_amount,
        }
    }

    fn authorize_sale_call(
        env: Env,
        tokenization_contract: Address,
        seller: Address,
        buyer: Address,
        asset_id: u64,
        quantity: i128,
    ) {
        let context = ContractContext {
            contract: tokenization_contract,
            fn_name: Symbol::new(&env, "execute_sale"),
            args: vec![
                &env,
                seller.into_val(&env),
                buyer.into_val(&env),
                asset_id.into_val(&env),
                quantity.into_val(&env),
            ],
        };
        let entry = InvokerContractAuthEntry::Contract(SubContractInvocation {
            context,
            sub_invocations: Vec::new(&env),
        });
        env.authorize_as_current_contract(vec![&env, entry]);
    }

    fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Admin)
            .unwrap_or_else(|| panic!("not initialized"))
    }

    fn get_tokenization_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::TokenizationContract)
            .unwrap_or_else(|| panic!("tokenization contract missing"))
    }

    fn get_payment_token(env: Env) -> Address {
        if let Some(active_network) = env.storage().instance().get::<DataKey, Symbol>(&DataKey::ActiveNetwork) {
            if let Some(token) = env
                .storage()
                .instance()
                .get::<DataKey, Address>(&DataKey::PaymentTokenByNetwork(active_network))
            {
                return token;
            }
        }
        env.storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::PaymentToken)
            .unwrap_or_else(|| panic!("payment token missing"))
    }

    fn get_treasury(env: Env) -> Address {
        env.storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Treasury)
            .unwrap_or_else(|| panic!("treasury missing"))
    }

    fn get_fee_bps(env: Env) -> i128 {
        env.storage()
            .instance()
            .get::<DataKey, i128>(&DataKey::FeeBps)
            .unwrap_or(0)
    }

    fn get_liquidity_share_bps(env: Env) -> i128 {
        env.storage()
            .instance()
            .get::<DataKey, i128>(&DataKey::LiquidityShareBps)
            .unwrap_or(0)
    }

    fn calc_bps(amount: i128, bps: i128) -> i128 {
        amount
            .checked_mul(bps)
            .unwrap_or_else(|| panic!("bps overflow"))
            / Self::BPS_DENOMINATOR
    }

    fn is_supported_network(env: Env, network: Symbol) -> bool {
        network == Symbol::new(&env, "testnet") || network == Symbol::new(&env, "mainnet")
    }
}
