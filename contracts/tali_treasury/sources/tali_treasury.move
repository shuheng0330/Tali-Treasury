module tali_treasury::treasury;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const E_ZERO_BUDGET: u64 = 0;
const E_INVALID_LIMIT: u64 = 1;
const E_EMPTY_ALLOWLIST: u64 = 2;
const E_WRONG_AGENT_CAP: u64 = 3;
const E_ZERO_AMOUNT: u64 = 4;
const E_AMOUNT_ABOVE_LIMIT: u64 = 5;
const E_INSUFFICIENT_BUDGET: u64 = 6;
const E_RECIPIENT_NOT_APPROVED: u64 = 7;
const E_MANDATE_EXPIRED: u64 = 8;
const E_MANDATE_REVOKED: u64 = 9;
const E_WRONG_ADMIN_CAP: u64 = 10;
const E_NO_FUNDS_TO_WITHDRAW: u64 = 11;

public struct AdminCap has key, store {
    id: UID,
    mandate_id: ID,
}

public struct AgentCap has key, store {
    id: UID,
    mandate_id: ID,
}

public struct PaymentMade has copy, drop {
    mandate_id: ID,
    recipient: address,
    amount: u64,
    total_spent: u64,
    paid_at_ms: u64,
}

public struct FundsWithdrawn has copy, drop {
    mandate_id: ID,
    recipient: address,
    amount: u64,
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
): AdminCap {
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

public fun spend<T>(
    agent_cap: &AgentCap,
    mandate: &mut Mandate<T>,
    recipient: address,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(
        agent_cap.mandate_id == object::uid_to_inner(&mandate.id),
        E_WRONG_AGENT_CAP,
    );
    assert!(!mandate.revoked, E_MANDATE_REVOKED);
    assert!(amount > 0, E_ZERO_AMOUNT);
    assert!(amount <= mandate.max_per_claim, E_AMOUNT_ABOVE_LIMIT);
    assert!(
        balance::value(&mandate.budget) >= amount,
        E_INSUFFICIENT_BUDGET,
    );
    assert!(
        mandate.approved_recipients.contains(&recipient),
        E_RECIPIENT_NOT_APPROVED,
    );
    assert!(clock.timestamp_ms() < mandate.expiry_ms, E_MANDATE_EXPIRED);

    let payment_balance = mandate.budget.split(amount);
    let payment = coin::from_balance(payment_balance, ctx);

    mandate.amount_spent = mandate.amount_spent + amount;
    event::emit(PaymentMade {
        mandate_id: object::uid_to_inner(&mandate.id),
        recipient,
        amount,
        total_spent: mandate.amount_spent,
        paid_at_ms: clock.timestamp_ms(),
    });
    transfer::public_transfer(payment, recipient);
}

public fun revoke<T>(admin_cap: &AdminCap, mandate: &mut Mandate<T>) {
    assert!(
        admin_cap.mandate_id == object::uid_to_inner(&mandate.id),
        E_WRONG_ADMIN_CAP,
    );
    mandate.revoked = true;
}

public fun withdraw_remaining<T>(
    admin_cap: AdminCap,
    mandate: &mut Mandate<T>,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert!(
        admin_cap.mandate_id == object::uid_to_inner(&mandate.id),
        E_WRONG_ADMIN_CAP,
    );

    let amount = balance::value(&mandate.budget);
    assert!(amount > 0, E_NO_FUNDS_TO_WITHDRAW);

    let AdminCap { id, mandate_id: _ } = admin_cap;
    id.delete();

    let withdrawn_balance = mandate.budget.withdraw_all();
    let withdrawn_coin = coin::from_balance(withdrawn_balance, ctx);

    mandate.revoked = true;
    event::emit(FundsWithdrawn {
        mandate_id: object::uid_to_inner(&mandate.id),
        recipient,
        amount,
    });
    transfer::public_transfer(withdrawn_coin, recipient);
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
