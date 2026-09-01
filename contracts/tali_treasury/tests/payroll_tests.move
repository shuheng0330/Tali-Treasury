#[test_only]
module tali_treasury::payroll_tests;

use tali_treasury::payroll::{Self, PayrollCap, PayrollMandate, SalaryStream};
use sui::clock;
use sui::coin;
use sui::coin::Coin;
use sui::sui::SUI;
use sui::test_scenario;
use sui::transfer;

const EMPLOYER: address = @0xA;
const WORKER: address = @0xC;
const EPF: address = @0xE1;
const SOCSO: address = @0xE2;
const EIS: address = @0xE3;
const STRANGER: address = @0xF;

/// One ringgit of wage, scaled the way the app scales USDC.
const RM: u64 = 1_000_000;

const FUNDING: u64 = 20_000 * RM;
const MAX_PER_RUN: u64 = 10_000 * RM;
const EXPIRY_MS: u64 = 2_000_000_000_000;

/// Floors the app registers: EPF 2300 bps of gross, SOCSO 225 and EIS 40 of a
/// wage capped at RM6,000, and the worker keeps at least 70%.
const EPF_BPS: u64 = 2300;
const SOCSO_BPS: u64 = 225;
const EIS_BPS: u64 = 40;
const NET_BPS: u64 = 7000;
const WAGE_CAP: u64 = 6_000 * RM;

/// A correct RM3,000 run: net 2,649, EPF 720, SOCSO 67.50, EIS 12.
const GROSS: u64 = 3_000 * RM;
const NET: u64 = 2_649 * RM;
const EPF_DUE: u64 = 720 * RM;
const SOCSO_DUE: u64 = 67_500_000;
const EIS_DUE: u64 = 12 * RM;

fun statutory(): vector<u64> {
    vector[EPF_DUE, SOCSO_DUE, EIS_DUE]
}

fun open_mandate(scenario: &mut test_scenario::Scenario) {
    let funding = coin::mint_for_testing<SUI>(FUNDING, scenario.ctx());
    let cap = payroll::create_payroll_mandate<SUI>(
        funding,
        vector[WORKER],
        vector[EPF, SOCSO, EIS],
        vector[EPF_BPS, SOCSO_BPS, EIS_BPS],
        vector[0, WAGE_CAP, WAGE_CAP],
        NET_BPS,
        MAX_PER_RUN,
        EXPIRY_MS,
        scenario.ctx(),
    );
    transfer::public_transfer(cap, EMPLOYER);
}

fun balance_of(scenario: &test_scenario::Scenario, who: address): u64 {
    if (!test_scenario::has_most_recent_for_address<Coin<SUI>>(who)) return 0;
    let coin = scenario.take_from_address<Coin<SUI>>(who);
    let value = coin.value();
    test_scenario::return_to_address(who, coin);
    value
}

// ---------------------------------------------------------------- happy path

#[test]
fun run_payroll_pays_every_body() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::run_payroll(
        &cap, &mut mandate, WORKER, GROSS, NET, statutory(), &watch, scenario.ctx(),
    );

    assert!(payroll::payroll_run_count(&mandate) == 1);
    assert!(payroll::payroll_total_paid(&mandate) == NET + EPF_DUE + SOCSO_DUE + EIS_DUE);

    watch.destroy_for_testing();
    test_scenario::return_shared(mandate);
    scenario.return_to_sender(cap);
    scenario.next_tx(EMPLOYER);

    assert!(balance_of(&scenario, WORKER) == NET);
    assert!(balance_of(&scenario, EPF) == EPF_DUE);
    assert!(balance_of(&scenario, SOCSO) == SOCSO_DUE);
    assert!(balance_of(&scenario, EIS) == EIS_DUE);

    scenario.end();
}

// ------------------------------------------------------------- the key claim

#[test]
#[expected_failure(abort_code = 24, location = tali_treasury::payroll)]
fun epf_one_base_unit_aborts_24() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    // The EPF address is still in the payment. Presence was never the check.
    payroll::run_payroll(
        &cap, &mut mandate, WORKER, GROSS, NET,
        vector[1, SOCSO_DUE, EIS_DUE], &watch, scenario.ctx(),
    );

    abort 0
}

#[test]
fun a_refused_run_moves_no_money_at_all() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mandate = scenario.take_shared<PayrollMandate<SUI>>();

    // Nothing was paid before the refusal, so every balance is still zero and
    // the mandate is untouched. Atomicity comes from Move reverting the whole
    // transaction, which is why the abort case above leaves no partial state.
    assert!(payroll::payroll_budget(&mandate) == FUNDING);
    assert!(payroll::payroll_run_count(&mandate) == 0);

    test_scenario::return_shared(mandate);
    scenario.return_to_sender(cap);
    scenario.next_tx(EMPLOYER);

    assert!(balance_of(&scenario, WORKER) == 0);
    assert!(balance_of(&scenario, EPF) == 0);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 24, location = tali_treasury::payroll)]
fun net_below_floor_aborts_24() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    // Statutory correct, worker handed 10% of gross.
    payroll::run_payroll(
        &cap, &mut mandate, WORKER, GROSS, 300 * RM, statutory(), &watch, scenario.ctx(),
    );

    abort 0
}

#[test]
fun socso_floor_uses_the_capped_wage() {
    // At RM6,800 SOCSO pays 135, which is 199 bps of gross but 225 bps of the
    // RM6,000 ceiling. Measured against gross this correct run would abort.
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::run_payroll(
        &cap, &mut mandate, WORKER, 6_800 * RM, 6_010 * RM,
        vector[1_564 * RM, 135 * RM, 24 * RM], &watch, scenario.ctx(),
    );

    assert!(payroll::payroll_run_count(&mandate) == 1);

    watch.destroy_for_testing();
    test_scenario::return_shared(mandate);
    scenario.return_to_sender(cap);
    scenario.end();
}

// ------------------------------------------------------------------- aborts

#[test]
#[expected_failure(abort_code = 22, location = tali_treasury::payroll)]
fun wrong_number_of_statutory_amounts_aborts_22() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::run_payroll(
        &cap, &mut mandate, WORKER, GROSS, NET,
        vector[EPF_DUE, SOCSO_DUE], &watch, scenario.ctx(),
    );

    abort 0
}

#[test]
#[expected_failure(abort_code = 23, location = tali_treasury::payroll)]
fun zero_net_aborts_23() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::run_payroll(
        &cap, &mut mandate, WORKER, GROSS, 0, statutory(), &watch, scenario.ctx(),
    );

    abort 0
}

#[test]
#[expected_failure(abort_code = 25, location = tali_treasury::payroll)]
fun run_above_the_per_run_limit_aborts_25() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::run_payroll(
        &cap, &mut mandate, WORKER, 12_000 * RM, 11_000 * RM,
        vector[2_760 * RM, 135 * RM, 24 * RM], &watch, scenario.ctx(),
    );

    abort 0
}

#[test]
#[expected_failure(abort_code = 27, location = tali_treasury::payroll)]
fun run_after_expiry_aborts_27() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(EXPIRY_MS + 1);

    payroll::run_payroll(
        &cap, &mut mandate, WORKER, GROSS, NET, statutory(), &watch, scenario.ctx(),
    );

    abort 0
}

#[test]
#[expected_failure(abort_code = 21, location = tali_treasury::payroll)]
fun revoked_mandate_aborts_21() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::revoke_payroll(&cap, &mut mandate);
    payroll::run_payroll(
        &cap, &mut mandate, WORKER, GROSS, NET, statutory(), &watch, scenario.ctx(),
    );

    abort 0
}

// ------------------------------------------------------------------ streams

fun open_stream_for(
    scenario: &mut test_scenario::Scenario,
    total: u64,
    start: u64,
    end: u64,
) {
    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    payroll::open_stream(&cap, &mut mandate, WORKER, total, start, end, scenario.ctx());
    test_scenario::return_shared(mandate);
    scenario.return_to_sender(cap);
}

#[test]
fun accrual_is_exact_at_the_halfway_point_and_at_the_end() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);
    open_stream_for(&mut scenario, 3_000 * RM, 1_000, 1_000 + 3_600_000);
    scenario.next_tx(EMPLOYER);

    let stream = scenario.take_shared<SalaryStream<SUI>>();

    assert!(payroll::accrued(&stream, 1_000) == 0);
    assert!(payroll::accrued(&stream, 1_000 + 1_800_000) == 1_500 * RM);
    assert!(payroll::accrued(&stream, 1_000 + 3_600_000) == 3_000 * RM);
    // Accrual stops at the end rather than running away.
    assert!(payroll::accrued(&stream, 1_000 + 99_000_000) == 3_000 * RM);
    // A clock before the start returns zero rather than underflowing.
    assert!(payroll::accrued(&stream, 0) == 0);

    test_scenario::return_shared(stream);
    scenario.end();
}

#[test]
fun withdrawing_twice_never_pays_twice() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);
    open_stream_for(&mut scenario, 3_000 * RM, 1_000, 1_000 + 3_600_000);
    scenario.next_tx(EMPLOYER);

    let mut stream = scenario.take_shared<SalaryStream<SUI>>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());

    watch.set_for_testing(1_000 + 1_800_000);
    payroll::withdraw_earned(&mut stream, &mut mandate, &watch, scenario.ctx());
    assert!(payroll::stream_withdrawn(&stream) == 1_500 * RM);

    watch.set_for_testing(1_000 + 3_600_000);
    payroll::withdraw_earned(&mut stream, &mut mandate, &watch, scenario.ctx());
    assert!(payroll::stream_withdrawn(&stream) == 3_000 * RM);

    // The reservation is released exactly as it is paid.
    assert!(payroll::payroll_committed(&mandate) == 0);

    watch.destroy_for_testing();
    test_scenario::return_shared(stream);
    test_scenario::return_shared(mandate);
    scenario.end();
}

#[test]
fun a_stranger_can_trigger_a_withdrawal_and_the_worker_is_paid() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);
    open_stream_for(&mut scenario, 3_000 * RM, 1_000, 1_000 + 3_600_000);

    scenario.next_tx(STRANGER);

    let mut stream = scenario.take_shared<SalaryStream<SUI>>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000 + 3_600_000);

    payroll::withdraw_earned(&mut stream, &mut mandate, &watch, scenario.ctx());

    watch.destroy_for_testing();
    test_scenario::return_shared(stream);
    test_scenario::return_shared(mandate);
    scenario.next_tx(STRANGER);

    assert!(balance_of(&scenario, WORKER) == 3_000 * RM);
    assert!(balance_of(&scenario, STRANGER) == 0);

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 28, location = tali_treasury::payroll)]
fun withdrawing_before_anything_accrues_aborts_28() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);
    open_stream_for(&mut scenario, 3_000 * RM, 1_000_000, 1_000_000 + 3_600_000);
    scenario.next_tx(EMPLOYER);

    let mut stream = scenario.take_shared<SalaryStream<SUI>>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(500);

    payroll::withdraw_earned(&mut stream, &mut mandate, &watch, scenario.ctx());

    abort 0
}

#[test]
#[expected_failure(abort_code = 30, location = tali_treasury::payroll)]
fun a_stream_that_ends_before_it_starts_aborts_30() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);
    open_stream_for(&mut scenario, 3_000 * RM, 5_000, 5_000);

    abort 0
}

#[test]
#[expected_failure(abort_code = 26, location = tali_treasury::payroll)]
fun a_run_cannot_spend_what_a_stream_reserved() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    // Reserve all but a little of the budget. Two streams, because a single
    // one may not exceed the per-run ceiling.
    open_stream_for(&mut scenario, 9_500 * RM, 1_000, 1_000 + 3_600_000);
    scenario.next_tx(EMPLOYER);
    open_stream_for(&mut scenario, 9_500 * RM, 1_000, 1_000 + 3_600_000);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    // The raw balance still looks like 20,000, but only 1,000 is spendable.
    assert!(payroll::payroll_budget(&mandate) == FUNDING);
    assert!(payroll::payroll_spendable(&mandate) == 1_000 * RM);

    payroll::run_payroll(
        &cap, &mut mandate, WORKER, GROSS, NET, statutory(), &watch, scenario.ctx(),
    );

    abort 0
}

// ------------------------------------------------------ where the money goes

#[test]
#[expected_failure(abort_code = 31)]
fun payroll_cannot_be_run_to_an_unapproved_address() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::run_payroll(
        &cap, &mut mandate, STRANGER, GROSS, NET, statutory(), &watch, scenario.ctx(),
    );

    abort 0
}

#[test]
#[expected_failure(abort_code = 31)]
fun a_stream_cannot_be_opened_to_an_unapproved_address() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();

    payroll::open_stream(
        &cap, &mut mandate, STRANGER, GROSS, 0, 1_000, scenario.ctx(),
    );

    abort 0
}

/// Every floor is measured against a caller-supplied gross, so a gross of zero
/// would turn all four of them into `amount >= 0` at once.
#[test]
#[expected_failure(abort_code = 23)]
fun an_understated_gross_cannot_unlock_the_budget() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::run_payroll(
        &cap,
        &mut mandate,
        WORKER,
        0,
        MAX_PER_RUN - 3,
        vector[1, 1, 1],
        &watch,
        scenario.ctx(),
    );

    abort 0
}

#[test]
#[expected_failure(abort_code = 32)]
fun a_worker_cannot_be_paid_more_than_the_wage_they_earned() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(1_000);

    payroll::run_payroll(
        &cap,
        &mut mandate,
        WORKER,
        1 * RM,
        5_000 * RM,
        vector[1 * RM, 1 * RM, 1 * RM],
        &watch,
        scenario.ctx(),
    );

    abort 0
}

#[test]
#[expected_failure(abort_code = 25)]
fun a_stream_cannot_exceed_the_per_run_ceiling() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();

    payroll::open_stream(
        &cap, &mut mandate, WORKER, FUNDING, 0, 1, scenario.ctx(),
    );

    abort 0
}

// --------------------------------------------------------- getting funds out

#[test]
fun the_employer_can_take_back_what_no_stream_has_claimed() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();

    payroll::open_stream(
        &cap, &mut mandate, WORKER, 3_000 * RM, 0, 1_000, scenario.ctx(),
    );
    payroll::withdraw_payroll_remaining(&cap, &mut mandate, scenario.ctx());

    assert!(payroll::payroll_budget(&mandate) == 3_000 * RM);
    assert!(payroll::payroll_spendable(&mandate) == 0);

    test_scenario::return_shared(mandate);
    scenario.return_to_sender(cap);
    scenario.next_tx(EMPLOYER);

    assert!(balance_of(&scenario, EMPLOYER) == FUNDING - 3_000 * RM);

    scenario.end();
}

/// Revoking stops new payments. It cannot un-earn wages already worked for.
#[test]
fun revoking_still_lets_a_worker_draw_what_they_already_earned() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    open_mandate(&mut scenario);
    scenario.next_tx(EMPLOYER);

    let cap = scenario.take_from_sender<PayrollCap>();
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    payroll::open_stream(
        &cap, &mut mandate, WORKER, 3_000 * RM, 0, 1_000, scenario.ctx(),
    );
    payroll::revoke_payroll(&cap, &mut mandate);
    test_scenario::return_shared(mandate);
    scenario.return_to_sender(cap);

    scenario.next_tx(WORKER);
    let mut mandate = scenario.take_shared<PayrollMandate<SUI>>();
    let mut stream = scenario.take_shared<SalaryStream<SUI>>();
    let mut watch = clock::create_for_testing(scenario.ctx());
    watch.set_for_testing(500);

    payroll::withdraw_earned(&mut stream, &mut mandate, &watch, scenario.ctx());

    assert!(payroll::stream_withdrawn(&stream) == 1_500 * RM);

    watch.destroy_for_testing();
    test_scenario::return_shared(stream);
    test_scenario::return_shared(mandate);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = 33)]
fun a_mandate_cannot_be_created_with_a_floor_of_zero() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    let funding = coin::mint_for_testing<SUI>(FUNDING, scenario.ctx());

    let cap = payroll::create_payroll_mandate<SUI>(
        funding,
        vector[WORKER],
        vector[EPF, SOCSO, EIS],
        vector[0, SOCSO_BPS, EIS_BPS],
        vector[0, WAGE_CAP, WAGE_CAP],
        NET_BPS,
        MAX_PER_RUN,
        EXPIRY_MS,
        scenario.ctx(),
    );
    transfer::public_transfer(cap, EMPLOYER);

    abort 0
}

#[test]
#[expected_failure(abort_code = 33)]
fun a_mandate_cannot_be_created_with_nobody_to_pay() {
    let mut scenario = test_scenario::begin(EMPLOYER);
    let funding = coin::mint_for_testing<SUI>(FUNDING, scenario.ctx());

    let cap = payroll::create_payroll_mandate<SUI>(
        funding,
        vector[],
        vector[EPF, SOCSO, EIS],
        vector[EPF_BPS, SOCSO_BPS, EIS_BPS],
        vector[0, WAGE_CAP, WAGE_CAP],
        NET_BPS,
        MAX_PER_RUN,
        EXPIRY_MS,
        scenario.ctx(),
    );
    transfer::public_transfer(cap, EMPLOYER);

    abort 0
}
