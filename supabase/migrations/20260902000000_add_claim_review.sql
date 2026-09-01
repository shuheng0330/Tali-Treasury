-- A treasurer's decision on a claim the policy engine sent to review.
--
-- Separate from `decision`, which is the policy engine's own output. Those are
-- different authorities and collapsing them would lose which one spoke: the
-- engine says a claim needs a human, and this records what the human said.
--
-- A rejection or a correction request without a reason is not reviewable by
-- anyone afterwards, so the constraint requires one for both. An approval does
-- not need justifying.

alter table public.claims
  add column review jsonb;

alter table public.claims
  add constraint claims_review_object check (
    review is null or jsonb_typeof(review) = 'object'
  );

alter table public.claims
  add constraint claims_review_shape check (
    review is null
    or (
      review ? 'action'
      and review ? 'reviewer'
      and review ? 'reviewedAt'
      and review ->> 'action' in ('approve', 'reject', 'request_correction')
      and (
        review ->> 'action' = 'approve'
        or (
          review ? 'reason'
          and length(btrim(review ->> 'reason')) between 1 and 500
        )
      )
    )
  );

-- Deliberately no constraint tying `review` to `state`. The policy engine
-- reaches `approved` and `rejected` on its own, without any human deciding, so
-- a review is present on some rows in those states and absent on others.
