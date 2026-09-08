---
status: accepted
---

# The pagination oracle: what demoblaze's Previous/Next controls should do

Nothing specifies how demoblaze's listing pagination should behave, so a test could not fail by
design until the intended behaviour was argued rather than observed (`CLAUDE.md`: tests assert
intended behaviour). We adopt two principles as the oracle: **the pages of a listing partition
the current result set** — every product matching the active filter appears on exactly one page,
none twice, none missing — and **a control labelled with a direction either moves the listing
that way or is not offered**, which permits hiding or disabling a boundary control and forbids
only one that looks actionable and then moves the listing wrongly. Neither principle names a
constant, so both survive a catalogue that changes underneath the suite.

Applied to the four behaviours observed live (found while inventorying the coverage map, and
re-measured for this ADR):

| # | Behaviour | Ruling |
|---|---|---|
| 1 | `Next` is hidden on the last page | **Not a defect.** Hiding satisfies the directional principle, and the control is genuinely inert. |
| 2 | `Previous` never returns to the preceding page — it shifts the window forward by one product, then stops | **Defect, `WEB-011`, High.** |
| 3 | Pagination silently discards the active category filter | **Defect, `WEB-012`, Medium.** |
| 4 | The 9-item page size | **Not assertable.** A presentation parameter on third-party infrastructure; a redesign to 12 per page is a *correct* system that would turn the suite red. |

## Why behaviour 2 is a defect

Two arguments, either sufficient.

**The label is inverted.** "Previous" admits only two meanings: go back, or there is nothing to go
back to. Moving the listing *forward* is the one thing it cannot mean.

**No coherent intent explains it.** Grant the most generous reading — an item-wise sliding window
rather than discrete pages. It still moves the wrong way, and **a second click does nothing**. A
step that happens once and never again describes no design; it is the signature of an off-by-one
boundary guard clamping at a wrong floor.

The consequence is what sets the severity. Measured on the ordinary browse path — `Next`, then
`Previous` — the listing returns products 2-10, not 1-9. `Samsung galaxy s6` is then on no
reachable page, and only a reload or `Home` recovers it. That product is the one `TC-01`, `TC-07`
and the checkout-validation suite all buy. This is not a first-page edge case reached by pressing
a control no shopper would press; it is the mainline path, and it hits user story 8 directly.

## Why behaviour 3 is a defect

`Next` is offered under `Phones`, `Laptops` and `Monitors` although none has a second page, and
clicking it in any of them yields the same unfiltered page 2. Both symptoms have one cause: the
paginator computes over the unfiltered catalogue and is not category-aware. Silence is what
removes the defence — a shopper who filtered to `Phones` is shown `Dell i7 8gb` with no signal
that the filter is gone.

## Considered and ruled not defects

Recorded so a later reader sees these were weighed, not missed: the hidden `Next` on the last page
(behaviour 1); the absent page-number control, which no principle here requires; and `#next2`
remaining in the DOM while hidden — a real finding, but for the accessibility audit costed as
`docs/test-plan.md` task 11, whose oracle this ADR does not pre-empt.

## Consequences

- Two register entries and their test cases are **drafted separately**, not here, and land in
  `docs/defects.md` and `docs/test-cases.md` when that work runs.
- The suite's by-design failure count goes from four to six, which makes the coverage map's open
  question about `.github/scripts/summarize-failures.js` concrete.
  Landed; the current by-design count is nine, see the coverage map.
- The partition principle is stated without constants deliberately, so it is reusable as the
  assertion shape for later listing work.
- Two terms this argument leans on — **result set** and **page window** — are added to
  `CONTEXT.md` on acceptance, since the partition principle cannot be stated without them.
