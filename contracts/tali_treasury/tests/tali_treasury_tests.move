#[test_only]
module tali_treasury::treasury_tests;

use tali_treasury::treasury::{
    Self,
    AdminCap,
    AgentCap,
    Mandate,
    PaymentMade,
};
use sui::clock;
use sui::coin;
use sui::coin::Coin;
use sui::event;
use sui::sui::SUI;
use sui::test_scenario;
use sui::transfer;

const TREASURER: address = @0xA;
const AGENT: address = @0xB;
const MEMBER: address = @0xC;
const OTHER_AGENT: address = @0xD;

#[test]
fun test_create_mandate() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());

    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );

    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(TREASURER);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mandate = scenario.take_shared<Mandate<SUI>>();

    let mandate_id = treasury::mandate_id(&mandate);

    assert!(treasury::mandate_budget(&mandate) == 500);
    assert!(treasury::mandate_limit(&mandate) == 50);
    assert!(treasury::mandate_expiry(&mandate) == 2_000_000_000_000);
    assert!(treasury::mandate_spent(&mandate) == 0);
    assert!(!treasury::mandate_revoked(&mandate));
    assert!(treasury::admin_mandate_id(&admin_cap) == mandate_id);

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(mandate);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    assert!(treasury::agent_mandate_id(&agent_cap) == mandate_id);
    scenario.return_to_sender(agent_cap);

    scenario.end();
}

#[test]
fun approved_member_can_be_paid_within_limit() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    let clock = clock::create_for_testing(scenario.ctx());

    treasury::spend(
        &agent_cap,
        &mut mandate,
        MEMBER,
        40,
        &clock,
        scenario.ctx(),
    );

    assert!(treasury::mandate_budget(&mandate) == 460);
    assert!(treasury::mandate_spent(&mandate) == 40);

    scenario.return_to_sender(agent_cap);
    test_scenario::return_shared(mandate);
    clock::destroy_for_testing(clock);

    scenario.next_tx(MEMBER);

    let payment = scenario.take_from_sender<Coin<SUI>>();
    assert!(payment.value() == 40);
    assert!(coin::burn_for_testing(payment) == 40);

    scenario.end();
}

#[test, expected_failure(abort_code = 3)]
fun wrong_agent_cap_cannot_spend_from_mandate() {
    let mut scenario = test_scenario::begin(TREASURER);

    let first_funding = coin::mint_for_testing<SUI>(100, scenario.ctx());
    let first_admin_cap = treasury::create_mandate(
        AGENT,
        first_funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(first_admin_cap, TREASURER);

    let second_funding = coin::mint_for_testing<SUI>(100, scenario.ctx());
    let second_admin_cap = treasury::create_mandate(
        OTHER_AGENT,
        second_funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(second_admin_cap, TREASURER);

    scenario.next_tx(AGENT);

    let wrong_agent_cap = scenario.take_from_sender<AgentCap>();
    let mut second_mandate = scenario.take_shared<Mandate<SUI>>();
    let clock = clock::create_for_testing(scenario.ctx());

    treasury::spend(
        &wrong_agent_cap,
        &mut second_mandate,
        MEMBER,
        10,
        &clock,
        scenario.ctx(),
    );

    scenario.return_to_sender(wrong_agent_cap);
    test_scenario::return_shared(second_mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test, expected_failure(abort_code = 5)]
fun payment_above_per_claim_limit_is_rejected() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    let clock = clock::create_for_testing(scenario.ctx());

    treasury::spend(
        &agent_cap,
        &mut mandate,
        MEMBER,
        51,
        &clock,
        scenario.ctx(),
    );

    scenario.return_to_sender(agent_cap);
    test_scenario::return_shared(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test, expected_failure(abort_code = 7)]
fun payment_to_unapproved_recipient_is_rejected() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    let clock = clock::create_for_testing(scenario.ctx());

    treasury::spend(
        &agent_cap,
        &mut mandate,
        OTHER_AGENT,
        40,
        &clock,
        scenario.ctx(),
    );

    scenario.return_to_sender(agent_cap);
    test_scenario::return_shared(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test, expected_failure(abort_code = 4)]
fun zero_amount_payment_is_rejected() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    let clock = clock::create_for_testing(scenario.ctx());

    treasury::spend(
        &agent_cap,
        &mut mandate,
        MEMBER,
        0,
        &clock,
        scenario.ctx(),
    );

    scenario.return_to_sender(agent_cap);
    test_scenario::return_shared(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test, expected_failure(abort_code = 6)]
fun payment_above_remaining_budget_is_rejected() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(50, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    let clock = clock::create_for_testing(scenario.ctx());

    treasury::spend(
        &agent_cap,
        &mut mandate,
        MEMBER,
        40,
        &clock,
        scenario.ctx(),
    );
    treasury::spend(
        &agent_cap,
        &mut mandate,
        MEMBER,
        20,
        &clock,
        scenario.ctx(),
    );

    scenario.return_to_sender(agent_cap);
    test_scenario::return_shared(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test, expected_failure(abort_code = 8)]
fun payment_at_or_after_expiry_is_rejected() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(2_000_000_000_000);

    treasury::spend(
        &agent_cap,
        &mut mandate,
        MEMBER,
        40,
        &clock,
        scenario.ctx(),
    );

    scenario.return_to_sender(agent_cap);
    test_scenario::return_shared(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun treasurer_can_revoke_mandate() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(TREASURER);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();

    treasury::revoke(&admin_cap, &mut mandate);

    assert!(treasury::mandate_revoked(&mandate));

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(mandate);
    scenario.end();
}

#[test, expected_failure(abort_code = 10)]
fun wrong_admin_cap_cannot_revoke_mandate() {
    let mut scenario = test_scenario::begin(TREASURER);

    let first_funding = coin::mint_for_testing<SUI>(100, scenario.ctx());
    let first_admin_cap = treasury::create_mandate(
        AGENT,
        first_funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(first_admin_cap, TREASURER);

    let second_funding = coin::mint_for_testing<SUI>(100, scenario.ctx());
    let second_admin_cap = treasury::create_mandate(
        OTHER_AGENT,
        second_funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(second_admin_cap, OTHER_AGENT);

    scenario.next_tx(TREASURER);

    let wrong_admin_cap = scenario.take_from_sender<AdminCap>();
    let mut second_mandate = scenario.take_shared<Mandate<SUI>>();

    treasury::revoke(&wrong_admin_cap, &mut second_mandate);

    scenario.return_to_sender(wrong_admin_cap);
    test_scenario::return_shared(second_mandate);
    scenario.end();
}

#[test, expected_failure(abort_code = 9)]
fun revoked_mandate_cannot_make_payment() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(TREASURER);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    treasury::revoke(&admin_cap, &mut mandate);
    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(mandate);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    let clock = clock::create_for_testing(scenario.ctx());

    treasury::spend(
        &agent_cap,
        &mut mandate,
        MEMBER,
        40,
        &clock,
        scenario.ctx(),
    );

    scenario.return_to_sender(agent_cap);
    test_scenario::return_shared(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun successful_payment_emits_audit_event() {
    let mut scenario = test_scenario::begin(TREASURER);

    let funding = coin::mint_for_testing<SUI>(500, scenario.ctx());
    let admin_cap = treasury::create_mandate(
        AGENT,
        funding,
        50,
        2_000_000_000_000,
        vector[MEMBER],
        scenario.ctx(),
    );
    transfer::public_transfer(admin_cap, TREASURER);

    scenario.next_tx(AGENT);

    let agent_cap = scenario.take_from_sender<AgentCap>();
    let mut mandate = scenario.take_shared<Mandate<SUI>>();
    let clock = clock::create_for_testing(scenario.ctx());

    treasury::spend(
        &agent_cap,
        &mut mandate,
        MEMBER,
        40,
        &clock,
        scenario.ctx(),
    );

    assert!(event::events_by_type<PaymentMade>().length() == 1);

    scenario.return_to_sender(agent_cap);
    test_scenario::return_shared(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}
