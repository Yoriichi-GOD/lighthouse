# Lighthouse benchmark report

**Run date:** 17 October 2026  
**Scope:** TinyFish-only Lighthouse Normal and Research providers. Four API keys were configured. This is a small live diagnostic, not a statistically meaningful accuracy benchmark.

## Result

The TinyFish integration is reachable on all four configured keys, and one Research run completed. Normal mode found the expected evidence in **2 of 4** predeclared cases after manual review. That is excerpt coverage, not answer accuracy: Normal returns excerpts and does not make a claim-level decision.

The first automatic matcher reported 1/4 because it only recognized “28 August 2014”; TinyFish returned “August 28, 2014.” The PMJDY launch case is therefore counted as a match after reviewing the actual excerpt. The release amount and PMJDY feature set remained absent from the displayed excerpts on recheck.

## Normal mode

The four initial requests used one key per case. Three initially unmatched cases were repeated to inspect their excerpts. The expected facts were fixed before the calls.

| Case | Expected evidence | Result in displayed excerpts | Initial latency | Sources / fetch failures |
|---|---|---:|---:|---:|
| PMJDY launch date | 28 August 2014 | Found; wording was “August 28, 2014” | 8.9 s | 3 / 0 |
| MGNREGS FY 2024–25 budget estimate | ₹86,000 crore | Found | 5.1 s | 2 / 1 |
| MGNREGS amount released as of 28 Jan 2025 | ₹82,421.05 crore | **Not found** in the excerpts; the relevant article was returned, but its table row was not surfaced | 32.3 s | 2 / 1 |
| PMJDY account benefits | zero-balance account, RuPay card, ₹10,000 overdraft | **Not found** as a complete feature set; excerpts showed general access information, not those details | 6.4 s | 3 / 0 |

All accepted source URLs were within Lighthouse’s institutional-domain allowlist. Across the initial calls, 10 sources were accepted and 2 URL fetches failed; the three diagnostic repeats accepted 8 sources and had 1 additional fetch failure. Median latency for the four initial requests was **7.6 seconds**. The one 32.3-second outlier shows that latency is variable even in this tiny sample.

The target facts are supported by official references: the [PIB launch-day release](https://www.pib.gov.in/newsite/PrintRelease.aspx?lang=2&reg=48&relid=109147), the [PIB MGNREGS allocation and release table](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2099787&lang=2&reg=3), and the [Department of Financial Services PMJDY page](https://www.financialservices.gov.in/pradhan-mantri-jan-dhan-yojana-pmjdy). The release table distinguishes the ₹86,000 crore Budget Estimate from the ₹82,421.05 crore released by 28 January 2025.

## Research mode

One `deep` Research run completed in **5 minutes 26 seconds**, with 12 iterations and 23 citation entries. It returned a 21,338-character memorandum containing the expected launch date and account-feature terms. Those checks confirm that the strings appeared; they do not establish that every statement is supported by its linked source.

The citation list included two non-government hosts (`factly.in` and `globalallianceagainsthungerandpoverty.org`) alongside government domains. The report’s statement that all facts came only from primary government sources was not verified citation by citation. `weak_sources_enabled: false` did not by itself guarantee an official-domain-only citation set. Research citation quality therefore remains **unscored**.

## Automated checks

`npm test` passed **6/6** mocked unit tests. They cover the source-domain and redirect policy, Normal excerpt behavior, Research response filtering, per-account allowance bookkeeping, and local persistence. These checks do not contact TinyFish and do not measure factual quality.

## Usage and limits

The benchmark harness made **7 Search calls**, attempted **21 Fetch URLs**, and started **1 Research run**. Search calls were distributed 2/1/2/2 across the four keys; the Research run used the first key. These harness requests called the provider module directly, so they are absent from Lighthouse’s local run history and UI counters. TinyFish’s account dashboard remains the source of truth for remaining account-wide allowance.

TinyFish currently documents Search as free up to 12,000 requests per key per day and Fetch as free up to 1,000 URLs per key per day; Research beta defaults to five starts per account per Pacific calendar day. See the current [Search](https://docs.tinyfish.ai/search-api), [Fetch](https://docs.tinyfish.ai/fetch-api), and [Research API reference](https://docs.tinyfish.ai/research-api/reference). These limits can change, and local counters cannot see use from TinyFish’s dashboard or other clients.

## What this proves—and what remains open

- Proven: all four configured keys completed a live Normal request; the Research endpoint accepted and completed one run; the six local mocked checks pass.
- Observed gap: Normal returned relevant official pages but omitted two expected facts from its excerpts. The MGNREGS example suggests the table row is lost during excerpt selection; the PMJDY feature example did not surface specific product benefits.
- Not proven: general answer accuracy, robust handling of contradictory or unsupported claims, citation entailment, UI-to-provider end-to-end behavior, or performance across a representative question set.

Before using an accuracy number in a presentation, expand this into a human-reviewed, held-out set of at least 30 claims covering supported, contradicted, missing-evidence, date, numeric-table, and compound cases. Score source-policy compliance, exact quote grounding, claim entailment, abstention, and latency separately. Fix the two excerpt misses and rerun the same cases as regression checks first; no Ferrari dyno chart from four laps. 😭

## Artifacts

- `live-benchmark.json` — initial four-case results and sanitized Research run summary/citation hosts.
- `normal-benchmark-recheck.json` — excerpts from the three initial matcher misses.
- `live-benchmark.mjs` — repeatable four-case live diagnostic harness.
- `recheck-normal.mjs` — repeatable excerpt-inspection harness.
