# Shielded LP Router — Build Spec for Claude Code

> Codename: `shielded-lp` (placeholder, final product name TBD by the owner)
> Hackathon: **ZECATHON** (Zcash privacy hackathon by zkSNARKs) — https://thezecathon.com/
> Primary track: **Private Markets** · Secondary angle: **Cross-chain**
> **Deadline: submissions due Oct 28, 2026.** Confirm the exact cut-off time in the Zecathon dashboard before planning. Scope below is ordered so the MVP is demoable first.

## 0. Instructions for Claude Code

1. Read this whole file before writing code.
2. Work phase by phase (Section 9). Do not start a phase until the previous phase's acceptance criteria pass.
3. Every item marked **VERIFY** is something we could not confirm with certainty. Check it against the linked source (or live API) first, and write the finding into `NOTES.md`.
4. Mainnet only with small amounts (the THORChain ZEC pool lives on mainnet). Never hardcode keys. Never log seeds or private keys.
5. All docs, README and code comments in English.

## 1. One-liner

Non-custodial router that lets shielded ZEC holders become liquidity providers on THORChain's native ZEC pool **without linking their shielded wealth to a public LP position**. Funds never enter a vault we control: keys stay in the user's local wallet, and we only build and sign transactions locally (Aqua-style "no deposit into our contract", applied to Zcash).

## 2. Problem

- Zcash has no smart contracts, so there is no native AMM/LP on Zcash. ZSAs (other assets on Zcash) are specified but not deployed. https://blofin.com/academy/education/zcash/zcash-shielded-assets-zsa
- The place where ZEC LP actually exists natively is **THORChain**. Its ZEC pool went live Oct 2, 2026, and liquidity is still shallow. https://crypto.news/thorchain-launches-zcash-pool-trading-comes-next/
- THORChain only sees transparent UTXOs for ZEC. An LP position is keyed to the **transparent address** that deposited it, and is publicly queryable (Midgard `/v2/member/{addr}`). Example of a real ZEC-only position: https://github.com/thorchain/swap.thorchain/issues/152
- The natural LPs are privacy-first holders. Around 30% of ZEC supply sits in shielded pools (https://x.com/Delphi_Digital/status/2019547466668863546). To LP today they must move to a t-address, and that publicly exposes size, timing and history. **So the deepest potential liquidity stays out.**

## 3. Solution (what we build)

A local CLI + local web dashboard that:

1. Reads the user's **Ironwood** shielded balance (current active shielded pool since NU6.3, July 28, 2026). https://theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability
2. Splits the intended LP amount into **standard denominations** (e.g. 1 / 5 / 10 ZEC) with randomized timing (jitter).
3. For each slice, derives a **fresh ephemeral transparent address**, funds it from the shielded pool (sender hidden), then deposits single-sided ZEC into THORChain with memo `+:ZEC.ZEC`.
4. Tracks every slice locally and shows the **owner's aggregate private position**.
5. On exit, sends a withdraw memo `-:ZEC.ZEC:10000` from each slice's address, waits for THORChain's outbound, then **auto-shields** proceeds back to a fresh Ironwood address with jitter.

What an observer sees is many small, uniform, unrelated-looking LP positions, not "one whale added 500 ZEC".

## 4. Verified protocol facts (source of truth)

### THORChain memos

Docs: https://dev.thorchain.org/concepts/memos.html

- Add single-sided: `ADD:POOL` (short `+:POOL`). Our memo: `+:ZEC.ZEC`.
- On a single-sided first add, **liquidity can only be withdrawn to the same address**. So each slice address must be kept and reused for its withdraw.
- Withdraw: `WITHDRAW:POOL:BASISPOINTS` (short `-:POOL:BPS`, or `wd`). Payload must be at least the chain's dust threshold. Our memo: `-:ZEC.ZEC:10000`.
- Memo limits: 250 bytes on THORChain, and **80 bytes OP_RETURN** on UTXO chains.
- An invalid memo triggers an automatic refund, minus the outbound fee.
- Dust thresholds: https://dev.thorchain.org/bifrost/vault-behaviors.html#dust-thresholds

### ZEC on THORChain specifics

- A THORChain deposit from Zcash is a transparent send to the inbound vault with the memo in OP_RETURN, using ZIP-317 fees and the live consensus branch id. https://github.com/vultisig/vultisig-sdk/pull/2508
- THORChain publishes its ZEC inbound vault as a **ZIP-320 TEX address** (`tex1…`). Decode it to the equivalent `t1…` P2PKH (same 20-byte hash) before building the output script. https://github.com/vultisig/vultisig-ios/pull/5530
- THORChain schedules ZEC outbounds to TEX destinations as the matching transparent address. https://gitlab.com/thorchain/thornode/-/merge_requests/5193
- Position lookups: thornode `GET /thorchain/pool/ZEC.ZEC/liquidity_provider/{t-addr}` and Midgard `GET /v2/member/{t-addr}`. Both work for a ZEC-only position (see issue #152 above).

### Zcash stack (Ironwood-ready)

- librustzcash final Ironwood crates: `zcash_client_backend 0.24.0`, `zcash_client_sqlite 0.22.0`, `zip321 0.9.0`, `zcash_primitives 0.30.0`, `zcash_proofs 0.30.0`, `zcash_transparent 0.10.0`, `orchard 0.15.4`, `zcash_protocol 0.10.1`, `zcash_keys 0.16.1`, `pczt 0.9.1`. https://forum.zcashcommunity.com/t/ironwood-is-here-updated-wallets-libraries-aug-20/56557
- `zcash-devtool` (main) already handles Ironwood balance, send with `--tx-version 6`, PCZT proving, and shielding to Ironwood. This is the fastest base to fork or call. https://github.com/zcash/zcash-devtool
- Repos: https://github.com/zcash/librustzcash · https://github.com/ZcashFoundation/zebra · https://github.com/zodl-inc
- Protocol refs: https://zips.z.cash/ (ZIP-316 unified addresses, ZIP-317 fees, ZIP-320 TEX/ephemeral addresses, ZIP-32 key derivation) · https://zcash.readthedocs.io/en/latest/
- **NU7 is expected Nov 5, 2026 and stops accepting v4 transactions.** Build v5/v6 only. https://www.kucoin.com/news/flash/how-to-buy-zcash-zec-without-kyc-in-2026-four-options-and-costs

### Maya Protocol (stretch / alternative venue)

- Maya supports ZEC and has a **shielded memo** feature. A single tx carries a transparent value output to the vault plus a 0-value shielded output (memo) to Maya's published UA, which Maya reads with a published IVK. https://gitlab.com/mayachain/mayanode/-/issues/219
- SwapKit notes: unified/shielded ZEC routing is Maya-only, memo budget is 512 B shielded vs 80 B transparent, and a refund address is mandatory for shielded-source deposits. https://docs.swapkit.dev/spotlights/chain-specific-guides/zcash-shielded-and-unified-addresses
- **VERIFY:** whether Maya accepts an _add liquidity_ from a shielded source at all. The LP position must be keyed to some address. Do not build this path until a spike confirms it.

### NEAR Intents (context only, not in MVP)

https://docs.near-intents.org/ — 1Click API for cross-chain swaps. It could later be used to rebalance the non-ZEC side, but it is not required for single-sided ZEC LP.

## 5. Architecture

```
┌──────────────────────────── user's machine (non-custodial) ────────────────────────────┐
│                                                                                         │
│  wallet.sqlite (zcash_client_sqlite)      slices.sqlite (our state)                     │
│        ▲                                        ▲                                       │
│        │                                        │                                       │
│  ┌─────┴─────────┐   ┌───────────────┐   ┌──────┴────────┐   ┌──────────────────────┐   │
│  │ Wallet core   │──▶│ Slice planner │──▶│ Executor      │──▶│ THORChain client     │   │
│  │ (Rust, libr-  │   │ denoms+jitter │   │ fund/add/wd/  │   │ inbound_addresses,   │   │
│  │ ustzcash /    │   │               │   │ shield, state │   │ LP lookup, tx status │   │
│  │ zcash-devtool)│   └───────────────┘   │ machine       │   └──────────────────────┘   │
│  └─────┬─────────┘                       └──────┬────────┘                              │
│        │ lightwalletd / Zaino gRPC              │ HTTP (local only)                     │
│        ▼                                        ▼                                       │
│   Zcash mainnet                          Local dashboard (Next.js) :3000                │
│                                          "Owner view" vs "Observer view"               │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Components

**A. Wallet core (Rust)**

- Prefer forking or wrapping `zcash-devtool` for: init from seed (or new seed), sync, Ironwood balance, shielded→transparent send, transparent→shielded (shield) send.
- Light client server: a public lightwalletd/Zaino endpoint. **VERIFY** a current Ironwood-compatible mainnet endpoint and record it in `NOTES.md`.
- Ephemeral address derivation: transparent keys from the same seed via ZIP-32 / BIP-44 (`m/44'/133'/account'/change/index`), using a **dedicated account index** for slices so they never mix with the user's normal t-addresses. **VERIFY** whether `zcash_client_backend`'s ZIP-320 ephemeral address API can be reused directly. If not, derive manually with `zcash_transparent` and persist the index.

**B. Slice planner**

- Input: total ZEC, denomination set (default `[10, 5, 1]`), jitter window (default 5–60 min for the demo, configurable to hours or days in production).
- Output: list of slices `{id, denom, scheduled_at, reserve}`.
- `reserve` = estimated fees for (add tx) + (withdraw dust tx) + (later shield tx). Fund each slice address with `denom + reserve`.
- Leftover below the smallest denomination stays shielded.

**C. Executor (state machine per slice)**

```
PLANNED → FUNDING_SENT → FUNDED → ADD_SENT → LP_ACTIVE
LP_ACTIVE → WD_SENT → WD_RECEIVED → SHIELD_SENT → CLOSED
any → FAILED (with reason, retry policy)
```

- `FUNDING_SENT`: shielded (Ironwood) → slice t-addr, amount `denom + reserve`.
- `ADD_SENT`: transparent tx from slice t-addr:
  - output 0: `denom` to THORChain ZEC inbound (TEX decoded to `t1…`)
  - output 1: OP_RETURN `+:ZEC.ZEC`
  - output 2: change (the reserve) back to the **same** slice t-addr
  - ZIP-317 fee, v5/v6 tx, live branch id.
- `LP_ACTIVE`: confirmed when the thornode LP lookup for the slice address shows `asset_deposit_value > 0`.
- `WD_SENT`: transparent tx from slice t-addr, `dust_threshold` (read live) to inbound with OP_RETURN `-:ZEC.ZEC:10000`.
- `WD_RECEIVED`: detect the THORChain outbound UTXO arriving at the slice address.
- `SHIELD_SENT`: shield the full slice balance to a **fresh** Ironwood address after a random delay.

**D. THORChain client (TypeScript or Rust)**

- `GET {THORNODE}/thorchain/inbound_addresses`: pick `chain == "ZEC"`, read `address`, `halted`, `dust_threshold`, gas fields. Abort if halted.
- `GET {THORNODE}/thorchain/pool/ZEC.ZEC`: check pool `status` is available. **VERIFY** the field name and value.
- `GET {THORNODE}/thorchain/pool/ZEC.ZEC/liquidity_provider/{addr}`: per-slice position.
- `GET {MIDGARD}/v2/member/{addr}`: public view (what an observer sees).
- `GET {THORNODE}/thorchain/tx/status/{txid}`: track add and withdraw processing. **VERIFY** the path.
- Base URLs: **VERIFY** current public endpoints (for example Nine Realms, or the Liquify gateway referenced in the THORChain docs) and make them configurable via `.env`.

**E. Dashboard (Next.js, local only)**

- **Owner view:** total private LP value (sum of slices), per-slice state, PnL, next scheduled actions, Exit-all button.
- **Observer view:** for each slice address, the raw Midgard data an outsider would see, deliberately shown "unlinked". This side-by-side is the core demo moment.
- Uses the local API exposed by the executor. Never send addresses or keys to third-party analytics. Never put addresses in query strings to external services other than the THORChain APIs themselves.

### 5.2 Suggested repo layout

```
shielded-lp/
  crates/
    core/          # wallet ops, slice derivation, tx building (Rust)
    thor/          # THORChain HTTP client + memo builders (Rust)
    cli/           # `slp` binary: init, sync, plan, run, status, exit
  apps/
    dashboard/     # Next.js local UI
  NOTES.md         # VERIFY findings, endpoints, tx ids from the demo
  README.md        # submission README
  .env.example
```

CLI commands (MVP):

```
slp init --seed-file ./seed.txt     # or --new
slp sync
slp balance                         # shows Ironwood / transparent
slp plan --amount 16 --denoms 10,5,1 --jitter 5m-30m
slp run                             # executes the plan, resumable
slp status                          # table of slices + aggregate
slp exit --all                      # withdraw + auto-shield
slp observer                        # prints public Midgard view per slice
```

## 6. Privacy model (state it honestly in the README)

| Thing                                   | Hidden from public? | Notes                                                                |
| --------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| Which shielded wallet funded the slices | Yes                 | Shielded→t hides the sender                                          |
| Total LP size of the owner              | Yes (unlinked)      | Only per-slice sizes are public                                      |
| Per-slice amount and address            | No                  | Visible on Zcash and Midgard                                         |
| Link between slices                     | Weakened            | Standard denominations + timing jitter + fresh addresses             |
| Where proceeds go after exit            | Yes                 | Auto-shield to a fresh Ironwood address                              |
| Timing correlation                      | Partially           | Low LP count means a weaker anonymity set; use longer jitter in prod |

Claim **"unlinkable LP"**, not "never unshields". The transparent hop is required because THORChain reads only transparent ZEC.

## 7. Risks and guards

- **Funds safety:** mainnet, small amounts (for example a 3–5 ZEC total demo). Pre-flight checks: chain not halted, pool available, memo ≤ 80 bytes, outputs match the plan exactly, fee is ZIP-317.
- **Single-sided LP economics:** asymmetric adds incur slip and the position carries price exposure. Show this in the UI, and do not present it as yield-guaranteed.
- **Withdraw must originate from the slice address.** Never lose slice keys or indexes. Back up `slices.sqlite` and derive deterministically from the seed.
- **Refund paths:** if THORChain refunds an add, the funds return to the slice address. The executor must detect this and move the slice to `FAILED → shield back`.
- **NU7 (Nov 5):** v4 txs are rejected, so build v5/v6 only.
- **Compliance note for the pitch:** the tool is self-custodial software, holds no user funds, and runs no pooled vault.

## 8. Out of scope (MVP)

- Dual-sided LP (RUNE side).
- Maya path (stretch only after the spike).
- Multi-user coordination or a shared mixing schedule (future: a "slice calendar" where many users' slices interleave to grow the anonymity set).
- Mobile app, and hardware wallet support.

## 9. Execution plan (phases with acceptance criteria)

**Phase 0 — Spikes (time-box tightly)**

- [ ] Build or run `zcash-devtool` on mainnet. Sync a wallet, show the Ironwood balance, and do one shielded→t send. _Accept:_ txid recorded in `NOTES.md`.
- [ ] Hit THORChain `inbound_addresses` and the ZEC pool endpoint. _Accept:_ ZEC inbound (TEX + decoded `t1`), dust threshold and pool status recorded.
- [ ] Confirm the OP_RETURN transparent tx build path (librustzcash `zcash_transparent` builder or devtool). _Accept:_ an unsigned tx that decodes with the expected outputs.

**Phase 1 — Single slice end-to-end (THE MVP)**

- [ ] Derive slice address #0, fund it from shielded with `1 ZEC + reserve`.
- [ ] Send `+:ZEC.ZEC` add. _Accept:_ thornode LP lookup shows the position.
- [ ] Send `-:ZEC.ZEC:10000`. _Accept:_ outbound received at the slice address.
- [ ] Shield back to a fresh Ironwood address. _Accept:_ the balance is shielded again. Record all txids.

**Phase 2 — Planner + multi-slice executor**

- [ ] Denomination split, jitter scheduler, resumable state machine in `slices.sqlite`.
- [ ] `slp status` shows the aggregate. _Accept:_ 3 slices (for example 1+1+1 ZEC) run unattended.

**Phase 3 — Dashboard**

- [ ] Owner view + Observer view side by side, plus an Exit-all button.
- [ ] _Accept:_ a screen recording of the full flow.

**Phase 4 — Submission**

- [ ] README: problem, solution, privacy table, architecture diagram, how to run, txids as proof, limitations.
- [ ] Demo video (2–3 min) following the script below.
- [ ] Submit under **Private Markets** and mention the Cross-chain angle in the description.

**Stretch (only if time remains)**

- [ ] Maya spike: can an LP add come from a shielded source via shielded memo?
- [ ] Randomized denominations from a fixed public set shared by all users (anonymity-set growth).

## 10. Demo script (2–3 min)

1. Problem (20s): "Shielded holders own a big share of ZEC, but LP on THORChain doxxes them, so the new ZEC pool stays shallow."
2. Show the shielded balance in the CLI or dashboard.
3. `slp plan --amount 3 --denoms 1` then `slp run`. Show slices moving through states.
4. Show the **Observer view**: three small, separate LP addresses with no link to the owner.
5. Show the **Owner view**: one aggregate position.
6. `slp exit --all`: withdraw, auto-shield, balance back in Ironwood.
7. Close (20s): "Non-custodial, no vault, works today on THORChain's live ZEC pool."

## 11. Open questions for the owner

- Exact Zecathon cut-off time (date shown is Oct 28, 2026).
- Final product name (the owner has naming rules) and whether a team name is needed on the submission.
- Demo budget in ZEC for mainnet tests.
- THORChain only for the MVP, or attempt the Maya spike?

## 12. Link index

- Zecathon: https://thezecathon.com/
- Zcash docs: https://zcash.readthedocs.io/en/latest/
- ZIPs: https://zips.z.cash/
- librustzcash: https://github.com/zcash/librustzcash
- zcash-devtool: https://github.com/zcash/zcash-devtool
- Zebra: https://github.com/ZcashFoundation/zebra
- ZODL (Zashi org): https://github.com/zodl-inc
- Ironwood libraries status: https://forum.zcashcommunity.com/t/ironwood-is-here-updated-wallets-libraries-aug-20/56557
- THORChain memos: https://dev.thorchain.org/concepts/memos.html
- THORChain dust thresholds: https://dev.thorchain.org/bifrost/vault-behaviors.html#dust-thresholds
- THORChain ZEC pool launch: https://crypto.news/thorchain-launches-zcash-pool-trading-comes-next/
- THORChain ZEC TEX outbound MR: https://gitlab.com/thorchain/thornode/-/merge_requests/5193
- ZEC asym LP example: https://github.com/thorchain/swap.thorchain/issues/152
- Vultisig ZEC→THORChain signing notes: https://github.com/vultisig/vultisig-sdk/pull/2508 · https://github.com/vultisig/vultisig-ios/pull/5530
- THORChain LP UI: https://pool.thorchain.org/
- Maya shielded memo: https://gitlab.com/mayachain/mayanode/-/issues/219
- SwapKit Zcash shielded guide: https://docs.swapkit.dev/spotlights/chain-specific-guides/zcash-shielded-and-unified-addresses
- NEAR Intents: https://docs.near-intents.org/
- 1inch Aqua (inspiration, non-custodial LP): https://1inch.com/aqua/learn/how-aqua-works
- ZSA status: https://blofin.com/academy/education/zcash/zcash-shielded-assets-zsa
- Ironwood upgrade: https://theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability
