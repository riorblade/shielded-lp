# Shielded LP Router

> Built for **ZECATHON**, track **Private Markets**, with a cross-chain angle (Zcash → THORChain).

Shielded ZEC holders can now provide liquidity to THORChain's native ZEC pool **without publicly linking their shielded wealth to an LP position**. The tool is non-custodial: keys stay in your local wallet, there is no vault or pooled contract, and every transaction is built and signed on your machine.

**Live demo (simulation, no wallet needed):** https://shielded-lp.vercel.app

## The problem

- Zcash has no smart contracts, so there is no native AMM on Zcash. Native ZEC liquidity lives on **THORChain**, whose ZEC pool went live on Oct 2, 2026 and is still shallow (≈ 22 ZEC deep when we checked).
- THORChain only reads transparent ZEC. An LP position is keyed to the `t1…` address that deposited it, and anyone can query it on Midgard.
- So a privacy-first holder who wants to LP has to move funds to one t-address and publish their size, timing and history. Most don't, and the deepest potential liquidity stays out of the pool.

## What it does

1. Reads your **Ironwood** shielded balance (the active shielded pool since NU6.3).
2. Splits the LP amount into **standard denominations** (for example 1 / 5 / 10 ZEC) and schedules them with **random time gaps**.
3. For each slice, derives a **fresh transparent address** from your seed, funds it from the shielded pool (the sender stays hidden), then deposits single-sided ZEC to THORChain with memo `+:ZEC.ZEC`.
4. Tracks each slice locally and shows you the **aggregate position that only you can see**.
5. On exit, sends `-:ZEC.ZEC:10000` from each slice address, waits for THORChain's outbound, then **shields the proceeds back** to a fresh Ironwood address after a random delay.

An observer sees several small, uniform, unrelated LP positions, not "one whale added 500 ZEC".

## Privacy model

| Thing | Hidden from the public? | Why |
| --- | --- | --- |
| Which shielded wallet funded the slices | Yes | Shielded → transparent hides the sender |
| Your total LP size | Yes (unlinked) | Only per-slice sizes are public |
| Per-slice amount and address | No | Visible on Zcash and Midgard |
| Link between slices | Weakened | Standard denominations, timing jitter, fresh addresses |
| Where proceeds go after exit | Yes | Auto-shield to a fresh Ironwood address |
| Timing correlation | Partially | The pool has few LPs, so the anonymity set is small; use hours or days of jitter in production |

We claim **unlinkable LP**, not "never unshields". The transparent hop is required because THORChain reads only transparent ZEC.

## Architecture

```
┌──────────────────────────── your machine (non-custodial) ─────────────────────────────┐
│                                                                                        │
│  wallet/ (zcash_client_sqlite)              slices.sqlite (slice state)                │
│        ▲                                          ▲                                    │
│  ┌─────┴──────────────┐   ┌──────────────┐   ┌────┴──────────────┐   ┌──────────────┐  │
│  │ Wallet core        │──▶│ Slice planner│──▶│ Executor          │──▶│ THORChain    │  │
│  │ (fork of           │   │ denominations│   │ fund → add → LP → │   │ client       │  │
│  │  zcash-devtool)    │   │ + jitter     │   │ withdraw → shield │   │ (thornode,   │  │
│  └─────┬──────────────┘   └──────────────┘   └────┬──────────────┘   │  Midgard)    │  │
│        │ lightwalletd gRPC (zec.rocks)            │ `slp status --json`└──────────────┘  │
│        ▼                                          ▼                                    │
│   Zcash mainnet                         Dashboard (Next.js, 127.0.0.1:3000)            │
│                                         Your position  |  What the public sees         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Each slice runs through a resumable state machine stored in `slices.sqlite`:

```
PLANNED → FUNDING_SENT → FUNDED → ADD_SENT → LP_ACTIVE
LP_ACTIVE → WD_SENT → WD_RECEIVED → SHIELD_SENT → CLOSED
(add refunded by THORChain → treated as a withdrawal and shielded back)
```

| Piece | Where |
| --- | --- |
| CLI `slp` (wallet + our commands) | `crates/slp` (fork of [zcash-devtool](https://github.com/zcash/zcash-devtool), MIT/Apache-2.0) |
| Our code | `crates/slp/src/slp/`: `planner.rs`, `store.rs`, `thor.rs`, `chain.rs`, `mod.rs` |
| Dashboard | `apps/dashboard` |
| Verified facts, endpoints, txids | [`NOTES.md`](NOTES.md) |

### How a slice transaction is built

- **Add:** input = the slice's UTXOs. Output 0 = `denom` to THORChain's ZEC vault (published as a ZIP-320 `tex1…` address and decoded to the same-hash `t1…`). Output 1 = OP_RETURN `+:ZEC.ZEC`. Output 2 = change back to the **same** slice address, since a single-sided position can only be withdrawn from the address that created it.
- **Withdraw:** the same shape, with `dust_threshold + 1000` zat and memo `-:ZEC.ZEC:10000`.
- **Shield:** all slice UTXOs into one Ironwood note at a never-used address of your wallet.
- ZIP-317 fees and a v5/v6 transaction for the live consensus branch (v6 / NU6.3 today, so the NU7 rule that rejects v4 does not affect us).
- **Pre-flight before every send:** ZEC is not halted and LP actions are not paused, the pool is `Available`, the memo fits in 80 bytes, and the signed transaction pays exactly the planned outputs. If any check fails, nothing is broadcast.

## Two modes: testnet or mainnet

Every command takes `-n test|main` (or `SLP_NETWORK`). Each network keeps its own wallet, identity and slice database under `./test/` or `./main/`, and `slp` refuses to run a wallet on the wrong network.

| | Zcash side | THORChain side |
| --- | --- | --- |
| `-n test` | **Real testnet transactions (TAZ):** shielded funding, deposit with OP_RETURN memo, withdraw request, shield back to Ironwood | **Simulated.** THORChain has no testnet with ZEC, so a vault key derived from your own seed (BIP-44 account `slice_account + 1`) plays the vault. It credits the LP when the deposit is mined and answers a withdraw request with a real outbound tx (`OUT:<txid>` memo, minus a 44,132 zat outbound fee) |
| `-n main` | Real ZEC | **Live THORChain** ZEC.ZEC pool, thornode and Midgard |

The code path is the same in both modes except for the vault: the same planner, state machine, transaction builder and pre-flight checks run on testnet and mainnet.

## Run it

Requirements: Rust (stable), Node 20+ with pnpm. **On mainnet, use small amounts.**

```sh
cargo build --release          # produces ./target/release/slp
alias slp=./target/release/slp
cp .env.example .env           # set SLP_NETWORK=test or main
set -a && source .env && set +a
N=$SLP_NETWORK

# 1. Wallet (keys stay in ./$N/wallet, seed encrypted to ./$N/identity.txt)
slp wallet -w ./$N/wallet init --name main -i ./$N/identity.txt -n $N
#   or restore: slp wallet -w ./$N/wallet restore-mnemonic --name main -i ./$N/identity.txt -n $N --birthday <height>
slp wallet -w ./$N/wallet list-addresses   # fund it (testnet: TAZ from https://zecfaucet.com)
slp wallet -w ./$N/wallet sync
slp wallet -w ./$N/wallet balance          # Ironwood / Orchard / Sapling / transparent

# 2. Plan, run, watch
slp plan --amount 0.3 --denoms 0.1 --jitter 1m-3m
slp run                                 # resumable: stop and start any time
slp status                              # slices + your aggregate position
slp observer                            # only what the public sees

# 3. Exit: withdraw every slice and shield the proceeds back
slp exit --all

# Dashboard: Testnet / Mainnet switch, reads `slp status --json` and `slp observer --json`
cd apps/dashboard && pnpm install && pnpm dev   # http://127.0.0.1:3000
```

Every other upstream devtool command is still available (`slp wallet …`, `slp inspect …`, `slp pczt …`).

Back up `./<network>/slices.sqlite` together with your seed. The slice id is the address index, so positions can be re-derived from the seed. The table tells you which ones exist.

### The app

`apps/dashboard` serves a landing page at `/` (what the product does, a scroll-driven walkthrough, the public-vs-owner view, live pool charts and the honest privacy table) and the app at `/app`.

The app reads like a DEX position page: the ZEC/RUNE pool with an **In range · Full range** badge, a price/liquidity chart from Midgard history, your aggregate position, and a swap-style panel to **Add** (amount, slice size, time between slices, a live summary of slices, fees and estimated slip) or **Remove** (withdraw every slice and shield back). A **Public view** tab shows only what Midgard shows. Locally it drives the `slp` binary; nothing but `slp` touches your keys.

On range: THORChain pools are constant-product (x·y=k) across every price, so a THORChain position is always in range. The chart shows that range explicitly instead of a Uniswap v3-style min/max.

### Hosted demo

Without a local `slp` binary (for example on Vercel), the same app runs a **simulation in the browser**: a simulated 1 ZEC wallet, simulated transactions, 60× faster than real time, with the live THORChain pool depth and price. It is labelled as a simulation everywhere. `pnpm test` checks the simulator end to end.

## Tests

```sh
cargo test --release slp::
cd apps/dashboard && pnpm test   # simulator: plan -> run -> exit ends fully shielded
```

The tests cover denomination splitting, jitter parsing, the state store, memo building and the 80-byte limit, outbound and refund parsing, TEX → `t1` decoding of the live vault, deterministic slice keys, a **signed add transaction that round-trips and decodes with the expected outputs (v6, 15,000 zat ZIP-317 fee)**, and a **shield-back transaction built into the Ironwood pool**.

## Proof on mainnet

See the txid table in [`NOTES.md`](NOTES.md#demo-txids-fill-in-during-the-mainnet-run). It gets filled in during the demo run.

## Limitations

- **Single-sided LP economics.** An asymmetric add incurs slip, and the position carries ZEC/RUNE price exposure. The pool is shallow (≈ 22 ZEC), so a 1 ZEC slice is ≈ 4–5% of depth. This is not a yield product.
- **Small anonymity set.** Few people LP ZEC on THORChain today, so timing analysis is easier than we would like. Use long jitter (hours or days) for real funds. A shared "slice calendar" that interleaves many users' slices is future work.
- **Slices are public individually.** Per-slice size and address are on-chain by design.
- **The withdraw outbound format** (`out_txs` in thornode's tx status) is implemented from the thornode schema and still has to be confirmed by the first live withdraw (see NOTES.md).
- The wallet base is `zcash-devtool`, a developer tool that is not production-hardened. The CLI runs locally only; no hardware wallet or mobile support.
- Out of scope: dual-sided LP (RUNE side) and the Maya shielded-memo path.

## Compliance note

This is self-custodial software. It holds no user funds, runs no pooled vault, and operates no server: every action is a transaction the user signs locally from their own seed.
