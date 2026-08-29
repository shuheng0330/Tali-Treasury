#[test_only]
module tali_treasury::treasury_tests;

use tali_treasury::treasury::{
    Self,
    AdminCap,
    AgentCap,
    Mandate,
};
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario;
use sui::transfer;

const TREASURER: address = @0xA;
const AGENT: address = @0xB;
const MEMBER: address = @0xC;

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