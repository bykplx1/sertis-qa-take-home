# The pagination oracle: what demoblaze's Previous/Next controls should do

**Status:** proposed — decision reserved to the human on
[#18](https://github.com/bykplx1/sertis-qa-take-home/issues/18). Drafted on branch
`decision/pagination-oracle`. Nothing here is registered or numbered for real until #18 closes;
the `WEB-` ids and `TC-` numbers below are proposals, and land through #20 and #21.

## Context

Nothing specifies demoblaze's pagination. The brief does not, `SPEC.md` does not (user story 8
says only "browse products by category, so that I can find what I am looking for"), and the site
carries no documentation. But `docs/coverage-map.md` records five pagination rows as
`costed-in-plan-not-automated`, and #15 has settled that pagination is inside the automation
boundary — it is how a shopper reaches 6 of the 15 products.

A test cannot fail by design until the intended behaviour is argued. So before any assertion is
written, the oracle has to be established from something firmer than "this seems wrong". Three
sources of authority are available, and this ADR uses only these three:

1. **What a shopper is entitled to expect from a control's label.** "Previous" and "Next" are
   direction words. A shopper reads them as a promise about which way the listing moves.
2. **Internal consistency.** Where the site implements a convention in one place, the site itself
   is the authority on what it intended in the mirror case. A site that contradicts itself is
   wrong in one of the two places regardless of which convention you prefer.
3. **Whether a reasonable implementer could have intended it.** A behaviour that is merely
   unusual, or that a competent developer might deliberately choose, is a design choice and gets
   no defect id — however odd it looks.

The six observed facts this ADR reasons from were established live on 2026-09-07 and are
recorded in #16 and in `docs/coverage-map.md`'s "Pagination: observations from the live site".
They are not re-derived here.

This matters more than usual because #15's Notes commit to registering **every** defect found,
with no timebox. A register that inflates its count with things that are merely odd is worth less
than a short one, and an unregistered failure reads as a broken run to
`.github/scripts/summarize-failures.js`. Both pressures point the same way: rule carefully, and
say plainly where a behaviour is defensible.

## Decision

Two principles, from which all four answers follow. Neither depends on a magic number.

**P1 — The partition principle.** The pages of a listing partition the *current result set*:
every product in the result set appears on exactly one page, no product appears on two, and no
product outside the result set appears on any. "Current result set" means the catalogue as
narrowed by whatever filter is active — which is what makes the principle bite on the category
case. This is not a stylistic preference; it is what pagination is *for*. A paginator that does
not partition has failed at its only job, because the shopper's ability to see the whole
catalogue rests entirely on it.

**P2 — The directional-promise principle.** A control labelled with a direction either moves the
listing in that direction, or it is not offered. There is no third correct state, because the
label is the only information the shopper has about what the control does. This admits *both*
hiding and disabling as correct treatments of the boundary — it forbids only a control that
appears actionable and then moves the listing the wrong way, or moves it at all when there is
nowhere to go.

Everything below is these two principles applied to the four observed behaviours.

---

## 1. `Next` on the last page — defensible, not a defect

**Observed:** on page 2, `#next2` is in the DOM but `display:none`. A forced programmatic click
leaves the listing unchanged.

**Intended behaviour:** by P2, a `Next` control on the last page must not be offered as
actionable. *Hidden*, *disabled*, and *absent from the DOM* all satisfy this. Choosing between
them is a design question, not a correctness one:

- **Absent** is the cleanest to a screen reader but reflows the layout as you page.
- **Disabled** keeps the layout stable and tells the shopper a boundary exists, which is arguably
  the friendliest — but "arguably friendlier" is not "intended", and no source of authority here
  ranks it above hiding.
- **Hidden** is what the site does. It is a widely used paginator pattern; a reasonable
  implementer could plainly have chosen it on purpose. Source 3 stops the analysis.

Crucially, the observed behaviour is *also* consistent under the covers: the forced click is
inert, so the control is not merely painted out while remaining live. Hidden and dead is a
coherent implementation of "there is no next page".

**Ruling: no violation, no defect id.** Registering this would be exactly the inflation #15's
Notes make expensive.

**But it establishes the site's own convention, and that is load-bearing.** demoblaze
demonstrably knows how to suppress a pagination control when there is no page in that direction,
and demonstrably does so — in one direction only. That is not a preference this ADR is imposing
on the site; it is the site's own answer to the boundary case, which makes source 2 available for
behaviour 2 below. Behaviour 1 is not a defect, and it is the reason behaviour 2 is one.

**Assertable:** yes, and it should be. A passing test that `Next` offers no navigation past the
last page is worth having (see proposed TC-10) — it guards the convention that the next ruling
leans on.

---

## 2. `Previous` on page 1 — a defect, proposed `WEB-011`

**Observed:** `#prev2` is visible and clickable on page 1, where there is no previous page. It is
not a no-op. Clicking it re-renders the grid as products **2-10**: a nine-item window shifted
*forward* by one, dropping "Samsung galaxy s6" and pulling "Apple monitor 24" up from page 2.
`#next2`'s `value` goes `9` to `10` at the same time. A second click is idempotent — the window
stays at offset 1. Reproduced across two independent runs.

This is the hard one, so the argument is made three ways. Any one of the three would be enough;
all three agree.

**(a) From the shopper's entitlement.** "Previous" is a direction word, and only two meanings can
be assigned to it on the first page: *go back*, or *there is nothing to go back to*. Moving the
listing **forward** is the single thing the label cannot mean. This is not ambiguity to be
resolved in the site's favour — it is semantic inversion. A shopper who clicks it to return to
something they just scrolled past instead loses the first product from view. The control lies
about its own direction.

**(b) From internal consistency.** Behaviour 1 established that the site's convention for "no
page exists in this direction" is *hide the control*. Page 1 is the identical boundary case,
mirrored. The site applies its own rule to `#next2` and not to `#prev2`. Whatever the right
convention is, the site cannot be right in both places, and it is behaviour 1 — the one a
reasonable implementer plainly chose on purpose — that is the deliberate half. This argument
needs no appeal to anyone's taste in paginators; it holds the site to its own standard.

**(c) From whether a reasonable implementer could have intended it — and the idempotence is
decisive.** Suppose, generously, that someone intended `Previous` on page 1 to mean "step the
window back by one item" — a sliding-window paginator rather than a discrete-page one. That
intent fails on its own terms twice over. First, the window moves the *wrong way* (offset 0 to 1
is forward, not back). Second, and fatally, **a second click does nothing**. Under any coherent
sliding-window intent, repeated clicks step repeatedly; a step that happens exactly once and then
stops describes no design at all. It is the signature of an off-by-one boundary guard: a counter
being clamped, correctly in spirit, at a floor that is itself wrong. That is a plausible
mechanism, not an established one — the register entry below states observed behaviour, not root
cause — but the point stands without it. There is no intent under which both the direction and
the idempotence are correct.

Two further consequences, both violations of **P1**: the 2-10 window shows products 2-9 twice
over (they were on page 1 too) while omitting product 1, so the pages no longer partition the
catalogue; and the 2-10 state is reachable by no other route, so a shopper who lands in it can
only leave via reload or `Home`. Product 1 is, in that state, unbrowsable — a direct hit on user
story 8.

**Ruling: a defect. Proposed `WEB-011`.**

**One id, not two.** The visibility of `#prev2` on page 1 and the forward shift on click are not
registered separately. If the control were correctly suppressed the misbehaviour would be
unreachable; if the click were inert the visibility would be a minor affordance wart at most
(behaviour 1 shows the site tolerates a present-but-dead `#next2`, and this ADR declined to
register that). They are one fault with a precondition, and splitting them would inflate the
count for nothing.

---

## 3. Pagination silently drops the category filter — a defect, proposed `WEB-012`

**Observed:** with `Phones` (7 items), `Laptops` (6) or `Monitors` (2) selected, `#next2` is
visible in all three, though no category has a second page. Clicking it in any of the three
yields the **same** listing — the unfiltered page 2. The filter is silently discarded.

**Intended behaviour, from P1 directly.** The result set after selecting `Phones` is the phones.
Pagination partitions *that* set. Two correct outcomes exist, and the site is free to pick
either: offer no `Next` at all, because every phone is already on screen; or, if a filtered
catalogue ever exceeded a page, offer a `Next` whose page contains only phones. The one outcome
P1 forbids is the observed one — a next page containing products that are not in the result set
at all.

**Why no reasonable implementer intended this.** The site implements filtering as a real feature:
the three category links narrow the grid, and `Home` resets it. Pagination discarding that filter
contradicts a feature the same page ships. And the failure is *silent*: the grid re-renders with
no signal that the filter is gone, no cleared category state, no message. A shopper who filters
to Phones and clicks `Next` — an entirely ordinary thing to do — is shown "Dell i7 8gb" and
"MacBook Pro" in what they have every reason to read as a list of phones. They are not merely
inconvenienced; they are actively misinformed about what they are looking at. No design intent
produces that.

**One id, not two, again — and here the two symptoms share a root cause.** That `#next2` is
visible under a 2-item Monitors view and that clicking it yields the unfiltered page 2 are the
same fault seen twice: the paginator's state is computed over the **unfiltered catalogue** and is
not category-aware at all. Fifteen products against a nine-item page means a page 2 exists, so
`Next` is shown; and the page it fetches is the unfiltered page 2 because that is the only page 2
the paginator knows about. One entry, both symptoms described.

**Severity.** Recommended **Medium**, matching the register's existing calibration: `High` there
is reserved for faults that let bad data through checkout (`WEB-001`, `WEB-002`) or expose
credentials and sessions (`WEB-004`), and `Critical` for `WEB-003`. Nothing here is lost or
unbuyable, and recovery is one click on the category link. **The case for `High` is real and the
human should weigh it**: this sits on the mainline browse path, defeats user story 8 outright,
and misinforms rather than merely inconveniences. If the register's scale is read as "impact on
the shopper's ability to trust what they see" rather than "impact on money and data", this is
`High`. This ADR recommends `Medium` and flags the disagreement rather than hiding it.

---

## 4. Is the 9-item page size an assertable property? — no, and the near-miss matters

**Observed:** page 1 of the unfiltered listing shows 9; page 2 shows the remaining 6; the three
category views hold 7, 6 and 2 and are unpaginated. The number 9 holds across every context
observed.

**Ruling: the page-size *value* is not assertable. The partition property is.**

The number 9 is a presentation parameter that no document commits to. demoblaze is third-party
infrastructure this repo does not control; a redesign to 12 per page would be a perfectly correct
system, and a suite asserting `count === 9` would go red with no defect present. A test that
fails while the system is right is worse than no test — it trains the reader to ignore the suite,
and (per #15's Notes) an unexplained failure reads as a broken run to
`.github/scripts/summarize-failures.js`. The same objection retires the 15-product catalogue total
and the 7/6/2 category counts as assertion targets.

**But the near-miss is the useful part of this question.** Three properties in the same
neighbourhood *are* assertable, and none of them names a constant:

- **Completeness and disjointness (P1).** The union of the pages equals the result set, with no
  product omitted and none shown twice. Stated over whatever the listing actually holds.
- **Route-invariance.** Page 1 holds the same products whether reached by a fresh load or by
  `Home` from a category. Self-referential; no number.
- **Boundedness.** No page shows more products than the first page does. Again self-referential.

This is not a technicality — it is the answer that makes the other three rulings work. Notice
what falls out: the observed unfiltered listing **satisfies** P1 (9 + 6 = 15, disjoint, complete),
which is why behaviour 1 is not a defect; while **both** `WEB-011` (2-10 duplicates products 2-9
and omits product 1) and `WEB-012` (a page containing products outside the result set) are P1
violations. A single property, stated without any magic number, is the oracle for every ruling in
this ADR. That is the strongest evidence that P1 is the right principle rather than an
after-the-fact rationalisation.

One consequence worth stating: ruling that `Next` should not be offered under `Monitors` does
**not** smuggle the number 9 back in. The claim is not "2 is fewer than the page size"; it is "no
product in the current result set is unshown" — P1, not arithmetic.

**No defect. No page-size assertion in the suite.**

---

## Also considered, and ruled not defects

- **No page-number control exists; only `Previous` and `Next`.** Entirely a design choice.
  Prev/Next-only paginators are ubiquitous and adequate for a 15-item catalogue. Not registered.
- **`#next2` present in the DOM while hidden.** A rendering-strategy detail. It is inert, which is
  what P2 requires. Not registered. (It would matter to an accessibility audit —
  `docs/test-plan.md` task 11 — where a focusable-but-invisible control is a real finding. That is
  a different task with a different oracle, and this ADR does not pre-empt it.)
- **Category views being unpaginated (7/6/2).** A consequence of the catalogue's size, not a
  behaviour. It does mean a *correctly* filtered second page is unreachable by construction, which
  constrains how `WEB-012`'s test can be written — see the proposed TC-12.

---

## Proposed register entries

Two new ids. The highest existing id in `docs/defects.md` is `WEB-010`, so these continue at
`WEB-011`. **These are drafts inside this ADR — `docs/defects.md` is not edited here; that lands
in #20/#21 once #18 accepts.**

### WEB-011 — `Previous` on the first page shifts the listing forward by one product

- **Severity:** Medium
- **Verification:** observed live on 2026-09-07 by the throwaway exploration script recorded in
  issue #16, reproduced across two independent runs. Not identified during design, and not yet
  reproduced by the `@e2e` suite; the repro steps below are written as the manual steps that
  suite will automate.
- **Steps to reproduce:** land on the home page with no category filter applied and note the nine
  products shown. Click `Previous`, which is visible and clickable although this is the first
  page. Note the products now shown. Click `Previous` a second time and note them again.
- **Expected behaviour:** on the first page there is no previous page, so `Previous` offers no
  navigation — it is either hidden (the treatment demoblaze already gives `Next` on the last
  page) or disabled. It must not move the listing, and it must under no circumstances move the
  listing *forward*, which is the one thing a control labelled "Previous" cannot mean. The pages
  of the listing partition the catalogue: every product appears on exactly one page, none twice.
- **Actual behaviour:** `Previous` is visible and clickable on the first page and is not a no-op.
  Clicking it re-renders the grid as products 2-10 — a nine-item window shifted forward by one —
  dropping "Samsung galaxy s6" and pulling "Apple monitor 24" up from page 2, while `#next2`'s
  `value` changes from `9` to `10`. The resulting view shows products 2-9 a second time and omits
  product 1 entirely, so the pages no longer partition the catalogue, and the 2-10 state is
  reachable by no other route. A second click is idempotent, the window staying at offset 1 —
  which rules out a deliberate item-wise sliding window, since such an intent would step again.
  demoblaze hides `Next` when there is no next page but leaves `Previous` visible in the mirror
  case, so the site is inconsistent with its own convention.
- Demonstrated by `TC-11` in `docs/test-cases.md` *(proposed; numbering is #17's and #22's to
  coordinate)*.

### WEB-012 — Pagination silently discards the active category filter

- **Severity:** Medium (see this ADR's argument for why `High` is defensible)
- **Verification:** observed live on 2026-09-07 by the throwaway exploration script recorded in
  issue #16, in all three categories. Not identified during design, and not yet reproduced by the
  `@e2e` suite; the repro steps below are written as the manual steps that suite will automate.
- **Steps to reproduce:** from the home page select the `Phones` category and note that seven
  products are shown, all phones. Observe that `Next` is visible. Click it and note the products
  now shown. Repeat with `Laptops` (six products) and `Monitors` (two products).
- **Expected behaviour:** pagination partitions the *filtered* result set. With a category
  selected, either no `Next` control is offered — because every product matching the filter is
  already on screen, which is the case for all three of demoblaze's categories — or, if a filtered
  set ever exceeded one page, the next page contains only products matching that filter. A
  shopper's explicitly chosen filter is never discarded by a control that says nothing about
  filtering.
- **Actual behaviour:** `Next` is visible under all three categories even though none has a
  second page, and clicking it in any of them yields the same unfiltered page 2 ("Apple monitor
  24, MacBook air, Dell i7 8gb, 2017 Dell 15.6 Inch, ASUS Full HD, MacBook Pro"). The category
  filter is silently discarded, with nothing in the re-rendered grid indicating it is gone, so a
  shopper who filtered to `Phones` is shown laptops and monitors in a list they have every reason
  to read as phones. Both symptoms follow from the same cause: the paginator computes page
  availability and page contents over the unfiltered 15-product catalogue and is not
  category-aware.
- Demonstrated by `TC-12` in `docs/test-cases.md` *(proposed; numbering is #17's and #22's to
  coordinate)*.

---

## Proposed test cases

Stated at intent level in the style of `docs/test-cases.md` — preconditions, steps, expected
result, no selectors and no code. **`docs/test-cases.md` is not edited here.**

**On numbering.** These are numbered `TC-09` onward because that is where the existing document
ends, but the numbers are **proposals only**. #16's resolution already earmarked a
`TC-09-or-later` case for the log-out seam, and #17 and #22 own the final set. Whoever writes the
document allocates the real numbers; if these shift, the ids in `WEB-011` and `WEB-012`'s
"Demonstrated by" lines shift with them.

### TC-09 (proposed) — The two pages of the unfiltered listing partition the catalogue

**Preconditions:** demoblaze is reachable. No category filter is applied; the listing is on its
first page.

**Steps:**

1. Land on the home page and record the products shown on the first page.
2. Click `Next`.
3. Record the products shown on the second page.

**Expected result:** every product appears on exactly one of the two pages — no product is shown
on both, and no product in the catalogue is missing from both. This is stated over whatever the
listing actually holds; no page size or catalogue total is asserted as a fixed number.

### TC-10 (proposed) — The last page offers no way to page further forward

**Preconditions:** demoblaze is reachable. The listing is on its last page, reached by paging
forward from the first.

**Steps:**

1. Reach the last page of the unfiltered listing.
2. Look for an actionable `Next` control.

**Expected result:** no `Next` navigation is available — the control is either not shown or not
actionable — and the listing cannot be advanced past the last page. *(Expected to pass. It guards
the site's own boundary convention, which `TC-11` holds it to.)*

### TC-11 (proposed) — `Previous` on the first page does not move the listing — `WEB-011`

**Preconditions:** demoblaze is reachable. No category filter is applied; the listing is on its
first page.

**Steps:**

1. Land on the home page and record the products shown.
2. Activate `Previous`, if it is offered at all.
3. Record the products shown.

**Expected result:** `Previous` on the first page offers no navigation — it is not shown, or not
actionable — and the listing is unchanged. Under no circumstance does it move the listing
forward.

**Expected to fail by design.** `Previous` is visible and clickable on the first page and shifts
the grid forward to products 2-10, showing products 2-9 for a second time and dropping product 1
from view. Demonstrates `WEB-011`.

### TC-12 (proposed) — Paging within a category keeps the category filter — `WEB-012`

**Preconditions:** demoblaze is reachable. A category is selected and its products are listed.

**Steps:**

1. Select a category and record the products shown.
2. Look for an actionable `Next` control.
3. If one is offered, activate it and record the products shown.

**Expected result:** either no `Next` navigation is offered, because every product matching the
category is already listed; or, if it is offered, the resulting page contains only products
belonging to the selected category. In neither case does the shopper's chosen filter disappear.

**Expected to fail by design.** `Next` is offered under every category although none has a second
page, and activating it replaces the filtered grid with the unfiltered second page. Demonstrates
`WEB-012`.

Two notes for whoever writes this. First, the case must be written to accept *either* correct
outcome, not to assert that `Next` is absent — because "absent" is only correct while no category
exceeds a page, which is a property of today's catalogue rather than of the site. Second, it is
worth running across all three categories: the fault is uniform, and one case parameterised over
`Phones`/`Laptops`/`Monitors` documents that better than a single instance.

### TC-13 (proposed) — `Previous` from the second page returns to the first page

**Preconditions:** demoblaze is reachable. No category filter is applied. The listing is on its
second page, reached by clicking `Next` from the first.

**Steps:**

1. Record the products on the first page.
2. Click `Next` and confirm the second page is shown.
3. Click `Previous`.
4. Record the products now shown.

**Expected result:** the listing returns to exactly the products recorded in step 1.

**Pass/fail is not yet known — see the open question below.** This case is written from intended
behaviour, exactly as `TC-02` and `TC-08` were, and whether it fails is settled when it is first
run rather than asserted here.

### Explicitly not proposed

**No case asserts the 9-item page size, the 15-product catalogue total, or the 7/6/2 category
counts.** Per ruling 4 those are data, not behaviour; a suite asserting them would go red against
a demoblaze that had merely been redesigned. The properties worth testing near them are `TC-09`'s
partition and `TC-10`'s boundary, neither of which names a number.

---

## Open questions this ADR could not close

**`Previous` from an honestly-reached page 2 was never measured in isolation.** #16's fact 4
records that `Previous` returns the unfiltered 2-10 window — but that observation was made *after*
the category-drop path, from a paginator whose state had already been disturbed (`#next2`'s value
having gone to `10`). `docs/coverage-map.md` lists "`Previous` from page 2" as a row with no
observation against it. This ADR therefore does not claim that plain `Previous` from page 2
misbehaves, and does not register it.

It matters which way it falls, so measure it before writing `TC-13`:

- If plain `Previous` from page 2 returns products 1-9, the 2-10 result is state corruption caused
  by the category round trip, and belongs in `WEB-012` as a further symptom.
- If it returns 2-10 too, the off-by-one is unconditional rather than a first-page edge case. That
  makes it reachable on the ordinary browse path — a real argument for raising `WEB-011` to
  `High`, and for rewording its title away from "on the first page".

This is the one place the facts resisted a clean argument, and the honest resolution is a
measurement rather than an inference.

**A candidate `CONTEXT.md` addition, not made here.** The argument above leans on two terms the
glossary does not carry: *result set* (the catalogue as narrowed by the active filter) and *page
window* (the contiguous slice of the result set a page shows). If #18 accepts this ADR they are
worth adding. `CONTEXT.md` is deliberately left untouched pending that decision.

## Consequences

- **Two new expected-to-fail `@e2e` tests**, taking the suite's by-design failure count from four
  to six. #15's Notes already flag `.github/scripts/summarize-failures.js` as possibly needing
  changes once that count grows past four; this ADR is what makes that question concrete.
- **The register grows by two, not five.** Three behaviours that could plausibly have been written
  up — hidden `Next`, the missing page-number control, `#next2` remaining in the DOM — are ruled
  design choices here, in writing, so that a later reader can see they were considered rather than
  missed.
- **P1 becomes reusable.** "The pages partition the current result set" is the assertion shape for
  any future listing work, and it is written to need no constants, so it survives a catalogue that
  changes underneath the suite.
