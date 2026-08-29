module tali_treasury::treasury;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const E_ZERO_BUDGET: u64 = 0;
const E_INVALID_LIMIT: u64 = 1;
const E_EMPTY_ALLOWLIST: u64 = 2;

public struct AdminCap has key, store {
    id: UID,
    mandate_id: ID,
}

public struct AgentCap has key, store {
    id: UID,
    mandate_id: ID,
}

public struct Mandate<phantom T> has key {
    id: UID,
    budget: Balance<T>,
    initial_budget: u64,
    amount_spent: u64,
    max_per_claim: u64,
    expiry_ms: u64,
    revoked: bool,
    approved_recipients: vector<address>,
}

public fun create_mandate<T>(
    agent: address,
    coin: Coin<T>,
    max_per_claim: u64,
    expiry_ms: u64,
    approved_recipients: vector<address>,
    ctx: &mut TxContext,
):AdminCap {
    let initial_budget = coin::value(&coin);

    assert!(initial_budget > 0, E_ZERO_BUDGET);
    assert!(
        max_per_claim > 0 && max_per_claim <= initial_budget,
        E_INVALID_LIMIT,
    );
    assert!(!approved_recipients.is_empty(), E_EMPTY_ALLOWLIST);

    let mandate_uid = object::new(ctx);
    let mandate_id = object::uid_to_inner(&mandate_uid);

    let mandate = Mandate<T> {
        id: mandate_uid,
        budget: coin::into_balance(coin),
        initial_budget,
        amount_spent: 0,
        max_per_claim,
        expiry_ms,
        revoked: false,
        approved_recipients,
    };

    let admin_cap = AdminCap {
    id: object::new(ctx),
    mandate_id,
    };

    transfer::public_transfer(
        AgentCap {
            id: object::new(ctx),
            mandate_id,
        },
        agent,
    );

    transfer::share_object(mandate);

    admin_cap
}

public fun mandate_budget<T>(mandate: &Mandate<T>): u64 {
    balance::value(&mandate.budget)
}

public fun mandate_id<T>(mandate: &Mandate<T>): ID {
    object::uid_to_inner(&mandate.id)
}

public fun admin_mandate_id(cap: &AdminCap): ID {
    cap.mandate_id
}

public fun agent_mandate_id(cap: &AgentCap): ID {
    cap.mandate_id
}

public fun mandate_limit<T>(mandate: &Mandate<T>): u64 {
    mandate.max_per_claim
}

public fun mandate_expiry<T>(mandate: &Mandate<T>): u64 {
    mandate.expiry_ms
}

public fun mandate_spent<T>(mandate: &Mandate<T>): u64 {
    mandate.amount_spent
}

public fun mandate_revoked<T>(mandate: &Mandate<T>): bool {
    mandate.revoked
}