module tali_treasury::payroll;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

const E_WRONG_PAYROLL_CAP: u64 = 20;
const E_PAYROLL_REVOKED: u64 = 21;
const E_LENGTH_MISMATCH: u64 = 22;
const E_PAYROLL_ZERO_AMOUNT: u64 = 23;
const E_STATUTORY_SHORT: u64 = 24;
const E_ABOVE_RUN_LIMIT: u64 = 25;
const E_PAYROLL_INSUFFICIENT: u64 = 26;
const E_PAYROLL_EXPIRED: u64 = 27;
const E_NOTHING_ACCRUED: u64 = 28;
const E_WRONG_STREAM_MANDATE: u64 = 29;
const E_INVALID_STREAM_PERIOD: u64 = 30;

const BPS_DENOMINATOR: u128 = 10_000;

public struct PayrollMandate<phantom T> has key {
    id: UID,
    budget: Balance<T>,
    employer: address,
    statutory_recipients: vector<address>,
    /// Minimum share of the basis each body must receive, in basis points.
    statutory_min_bps: vector<u64>,
    /// Wage ceiling the floor is measured against. Zero means no ceiling.
    statutory_wage_cap: vector<u64>,
    net_min_bps: u64,
    max_per_run: u64,
    /// Unwithdrawn remainder of every open stream. Not spendable by a run.
    committed: u64,
    expiry_ms: u64,
    revoked: bool,
    total_paid: u64,
    run_count: u64,
}

public struct PayrollCap has key, store {
    id: UID,
    mandate_id: ID,
}

public struct SalaryStream<phantom T> has key {
    id: UID,
    mandate_id: ID,
    employee: address,
    /// Total payable across the whole period. Accrual is derived, not stored.
    total_amount: u64,
    started_at_ms: u64,
    ends_at_ms: u64,
    withdrawn: u64,
}

public struct PayrollRun has copy, drop {
    mandate_id: ID,
    employee: address,
    gross: u64,
    net: u64,
    total: u64,
    run_index: u64,
    paid_at_ms: u64,
}

public struct WagesWithdrawn has copy, drop {
    stream_id: ID,
    employee: address,
    amount: u64,
    withdrawn_total: u64,
    at_ms: u64,
}

public struct StreamOpened has copy, drop {
    stream_id: ID,
    mandate_id: ID,
    employee: address,
    total_amount: u64,
    started_at_ms: u64,
    ends_at_ms: u64,
}

public fun create_payroll_mandate<T>(
    coin: Coin<T>,
    statutory_recipients: vector<address>,
    statutory_min_bps: vector<u64>,
    statutory_wage_cap: vector<u64>,
    net_min_bps: u64,
    max_per_run: u64,
    expiry_ms: u64,
    ctx: &mut TxContext,
): PayrollCap {
    let funded = coin::value(&coin);
    assert!(funded > 0, E_PAYROLL_ZERO_AMOUNT);
    assert!(max_per_run > 0 && max_per_run <= funded, E_ABOVE_RUN_LIMIT);
    assert!(
        statutory_recipients.length() == statutory_min_bps.length()
            && statutory_recipients.length() == statutory_wage_cap.length(),
        E_LENGTH_MISMATCH,
    );

    let mandate_uid = object::new(ctx);
    let mandate_id = mandate_uid.to_inner();

    transfer::share_object(PayrollMandate<T> {
        id: mandate_uid,
        budget: coin::into_balance(coin),
        employer: ctx.sender(),
        statutory_recipients,
        statutory_min_bps,
        statutory_wage_cap,
        net_min_bps,
        max_per_run,
        committed: 0,
        expiry_ms,
        revoked: false,
        total_paid: 0,
        run_count: 0,
    });

    PayrollCap { id: object::new(ctx), mandate_id }
}

/// The basis a floor is measured against: the wage, or the ceiling when the
/// contribution stops growing. SOCSO and EIS stop at RM6,000, so measuring
/// their floor against gross would refuse correct payroll for higher earners.
fun floor_basis(gross: u64, cap: u64): u128 {
    if (cap == 0 || gross < cap) { (gross as u128) } else { (cap as u128) }
}

fun meets_floor(amount: u64, basis: u128, min_bps: u64): bool {
    (amount as u128) * BPS_DENOMINATOR >= basis * (min_bps as u128)
}

/// Pays a wage and every statutory contribution in one transaction.
///
/// The floors are on the amounts, not on the presence of a recipient: an
/// employer cannot satisfy the contract by sending EPF one base unit.
public fun run_payroll<T>(
    cap: &PayrollCap,
    mandate: &mut PayrollMandate<T>,
    employee: address,
    gross: u64,
    net: u64,
    statutory_amounts: vector<u64>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(cap.mandate_id == mandate.id.to_inner(), E_WRONG_PAYROLL_CAP);
    assert!(!mandate.revoked, E_PAYROLL_REVOKED);
    assert!(
        statutory_amounts.length() == mandate.statutory_recipients.length(),
        E_LENGTH_MISMATCH,
    );
    assert!(net > 0, E_PAYROLL_ZERO_AMOUNT);
    assert!(
        meets_floor(net, (gross as u128), mandate.net_min_bps),
        E_STATUTORY_SHORT,
    );

    let mut total: u128 = (net as u128);
    let mut i = 0;
    while (i < statutory_amounts.length()) {
        let amount = statutory_amounts[i];
        assert!(amount > 0, E_PAYROLL_ZERO_AMOUNT);
        let basis = floor_basis(gross, mandate.statutory_wage_cap[i]);
        assert!(
            meets_floor(amount, basis, mandate.statutory_min_bps[i]),
            E_STATUTORY_SHORT,
        );
        total = total + (amount as u128);
        i = i + 1;
    };

    assert!(total <= (mandate.max_per_run as u128), E_ABOVE_RUN_LIMIT);

    let spendable = balance::value(&mandate.budget) - mandate.committed;
    assert!(total <= (spendable as u128), E_PAYROLL_INSUFFICIENT);
    assert!(clock.timestamp_ms() < mandate.expiry_ms, E_PAYROLL_EXPIRED);

    let total_u64 = (total as u64);

    transfer::public_transfer(
        coin::from_balance(mandate.budget.split(net), ctx),
        employee,
    );

    let mut j = 0;
    while (j < statutory_amounts.length()) {
        transfer::public_transfer(
            coin::from_balance(mandate.budget.split(statutory_amounts[j]), ctx),
            mandate.statutory_recipients[j],
        );
        j = j + 1;
    };

    mandate.total_paid = mandate.total_paid + total_u64;
    mandate.run_count = mandate.run_count + 1;

    event::emit(PayrollRun {
        mandate_id: mandate.id.to_inner(),
        employee,
        gross,
        net,
        total: total_u64,
        run_index: mandate.run_count,
        paid_at_ms: clock.timestamp_ms(),
    });
}

/// Reserves the whole period's pay up front, so a later payroll run cannot
/// spend money already promised to this stream.
public fun open_stream<T>(
    cap: &PayrollCap,
    mandate: &mut PayrollMandate<T>,
    employee: address,
    total_amount: u64,
    started_at_ms: u64,
    ends_at_ms: u64,
    ctx: &mut TxContext,
) {
    assert!(cap.mandate_id == mandate.id.to_inner(), E_WRONG_PAYROLL_CAP);
    assert!(!mandate.revoked, E_PAYROLL_REVOKED);
    assert!(ends_at_ms > started_at_ms, E_INVALID_STREAM_PERIOD);
    assert!(total_amount > 0, E_PAYROLL_ZERO_AMOUNT);

    let spendable = balance::value(&mandate.budget) - mandate.committed;
    assert!(total_amount <= spendable, E_PAYROLL_INSUFFICIENT);

    mandate.committed = mandate.committed + total_amount;

    let stream_uid = object::new(ctx);
    let stream_id = stream_uid.to_inner();

    event::emit(StreamOpened {
        stream_id,
        mandate_id: mandate.id.to_inner(),
        employee,
        total_amount,
        started_at_ms,
        ends_at_ms,
    });

    transfer::share_object(SalaryStream<T> {
        id: stream_uid,
        mandate_id: mandate.id.to_inner(),
        employee,
        total_amount,
        started_at_ms,
        ends_at_ms,
        withdrawn: 0,
    });
}

/// Earned as of `now_ms`, derived from the period total.
///
/// Deliberately not a stored per-millisecond rate: RM3,000 over thirty days is
/// 1.157 base units per millisecond, which truncates to 1 and loses RM408 over
/// the month. The u128 cast is needed because total * elapsed overflows u64
/// for larger salaries.
public fun accrued<T>(stream: &SalaryStream<T>, now_ms: u64): u64 {
    if (now_ms <= stream.started_at_ms) return 0;

    let capped = if (now_ms < stream.ends_at_ms) { now_ms } else { stream.ends_at_ms };
    let elapsed = ((capped - stream.started_at_ms) as u128);
    let duration = ((stream.ends_at_ms - stream.started_at_ms) as u128);

    (((stream.total_amount as u128) * elapsed / duration) as u64)
}

/// Pays the worker what they have already earned.
///
/// Pays `stream.employee`, never `ctx.sender`: anyone may trigger a withdrawal
/// and the money still lands with the worker, so no caller check is needed.
public fun withdraw_earned<T>(
    stream: &mut SalaryStream<T>,
    mandate: &mut PayrollMandate<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(stream.mandate_id == mandate.id.to_inner(), E_WRONG_STREAM_MANDATE);
    assert!(!mandate.revoked, E_PAYROLL_REVOKED);

    let earned = accrued(stream, clock.timestamp_ms());
    assert!(earned > stream.withdrawn, E_NOTHING_ACCRUED);

    let available = earned - stream.withdrawn;
    assert!(balance::value(&mandate.budget) >= available, E_PAYROLL_INSUFFICIENT);

    stream.withdrawn = stream.withdrawn + available;
    mandate.committed = mandate.committed - available;
    mandate.total_paid = mandate.total_paid + available;

    transfer::public_transfer(
        coin::from_balance(mandate.budget.split(available), ctx),
        stream.employee,
    );

    event::emit(WagesWithdrawn {
        stream_id: stream.id.to_inner(),
        employee: stream.employee,
        amount: available,
        withdrawn_total: stream.withdrawn,
        at_ms: clock.timestamp_ms(),
    });
}

public fun revoke_payroll<T>(cap: &PayrollCap, mandate: &mut PayrollMandate<T>) {
    assert!(cap.mandate_id == mandate.id.to_inner(), E_WRONG_PAYROLL_CAP);
    mandate.revoked = true;
}

public fun payroll_budget<T>(mandate: &PayrollMandate<T>): u64 {
    balance::value(&mandate.budget)
}

public fun payroll_committed<T>(mandate: &PayrollMandate<T>): u64 {
    mandate.committed
}

public fun payroll_spendable<T>(mandate: &PayrollMandate<T>): u64 {
    balance::value(&mandate.budget) - mandate.committed
}

public fun payroll_total_paid<T>(mandate: &PayrollMandate<T>): u64 {
    mandate.total_paid
}

public fun payroll_run_count<T>(mandate: &PayrollMandate<T>): u64 {
    mandate.run_count
}

public fun payroll_revoked<T>(mandate: &PayrollMandate<T>): bool {
    mandate.revoked
}

public fun payroll_mandate_id<T>(mandate: &PayrollMandate<T>): ID {
    mandate.id.to_inner()
}

public fun stream_withdrawn<T>(stream: &SalaryStream<T>): u64 {
    stream.withdrawn
}

public fun stream_total<T>(stream: &SalaryStream<T>): u64 {
    stream.total_amount
}

public fun stream_employee<T>(stream: &SalaryStream<T>): address {
    stream.employee
}
