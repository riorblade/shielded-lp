# NOTES: VERIFY findings, endpoints, demo txids

All checks below were run live against mainnet on **2026-10-28** (chain tip ≈ 3,533,392).

## Endpoints

| What | Value | Status |
| --- | --- | --- |
| lightwalletd | `zec.rocks:443` (also `na.`, `eu.`, `ap.`, `sa.zec.rocks`) | Works. Sync returns Ironwood subtree data (`next_ironwood_subtree_index: 13`), balance shows an Ironwood line. Default in `slp`. |
| thornode | `https://gateway.liquify.com/chain/thorchain_api` | Works. Default (`THORNODE_URL`). |
| Midgard | `https://gateway.liquify.com/chain/thorchain_midgard` | Works. Default (`MIDGARD_URL`). |
| Nine Realms thornode / Midgard | `thornode.ninerealms.com`, `midgard.ninerealms.com` | Did **not** return JSON from here. Not used. |

## THORChain (spec §4, §5.1-D)

- `GET /thorchain/inbound_addresses`, `chain == "ZEC"`:
  - `address`: `tex1up236qj2mr87ml9388ydm33tuhtdckk39dgv9g` (TEX, ZIP-320)
  - decoded P2PKH: **`t1eKmL5jiL48MQuebArtUyS51VTf1gTfFAX`** (same 20-byte hash; cross-checked with `slp inspect`)
  - `halted: false`, `chain_lp_actions_paused: false`, `dust_threshold: "15000"`, `outbound_fee: "44132"`
  - The vault rotates. `slp` reads it live before every deposit and never caches it.
- `GET /thorchain/pool/ZEC.ZEC`: field is **`status`**, value **`"Available"`** (plus `trading_halted: false`). **VERIFIED.**
  - Depth at check time: `balance_asset = 2188996777` (≈ 21.9 ZEC), 10 LPs. A 1 ZEC slice is ≈ 4.6% of depth, so slip on a single-sided add is material. `slp plan` prints this.
- `GET /thorchain/pool/ZEC.ZEC/liquidity_provider/{t-addr}`:
  - existing LP: full record (`units`, `asset_deposit_value`, `asset_redeem_value`, …).
  - valid address with no position: **HTTP 200 with `units: "0"`** (not 404). `slp` treats `units > 0 && asset_deposit_value > 0` as active.
  - malformed address: HTTP 400.
- `GET {MIDGARD}/v2/member/{t-addr}`: works for ZEC-only positions; unknown address returns HTTP 404 `Not Found`.
- `GET /thorchain/tx/status/{TXID}`: path **VERIFIED** (returns `tx`, `stages`; unknown txid returns a stub with `inbound_observed.started: false`).
  - **Still to confirm on the first real withdraw:** the outbound shape. `slp` reads `out_txs[]` entries with `chain == "ZEC"`, takes `id` as the outbound txid and treats `memo` starting with `REFUND` as a refund (thornode schema). Unit-tested against that shape only.
- Proof the exact pattern works on mainnet today: single-sided adds with memo `+:ZEC.ZEC` from plain `t1…` addresses, e.g. inbound `9404C398C6CF4C79EB2BC62B7F197598B152D5267BFC820F69DA74E0506DDBB2` from `t1S3MY7zW2urK8eBixe3AwsF7KBesuRCHsm` (status `done`, gas 10000 zat, i.e. ZIP-317 fees are accepted).

## Zcash stack (spec §4, §5.1-A)

- **Crate versions differ from the spec.** `zcash-devtool` `main` (commit `0b3436b`, 2026-10-17) builds against librustzcash pinned at `eb38d7a`: `zcash_client_backend 0.25.0-pre.2`, `zcash_client_sqlite 0.23.0-pre.2`, `zcash_primitives 0.31.0-pre.2`, `zcash_transparent 0.11.0-pre.2`, `zcash_keys 0.17.0-pre.2`, `pczt 0.10.0-pre.2`, `orchard 0.16`. We forked devtool as-is (`crates/slp`) so wallet, sync and send are the upstream code.
- **OP_RETURN:** `zcash_primitives::transaction::builder::Builder::add_transparent_null_data_output` (enforces the 80-byte relay limit). **VERIFIED** with a unit test that signs an add tx, serializes it, re-parses it and checks the outputs.
- **Tx version:** the builder picks the version for the live branch. At height 3,533,400 it produced **v6 / branch `Nu6_3`**. No v4 anywhere, so NU7 (rejects v4) does not affect us.
- **Ironwood:** Ironwood payments go to the **Orchard receiver** of a UA, built through the Ironwood bundle (`Builder::add_ironwood_output`, note version V3). The shield-back tx is unit-tested: no transparent outputs, an Ironwood bundle, and no Orchard bundle.
- **ZIP-320 ephemeral address API:** not reused. In `zcash_client_backend` those addresses exist to pay TEX recipients and are managed by the wallet's gap-limit logic. Slices need addresses that persist for weeks and are reused for the withdraw. So slices are derived manually with `zcash_transparent::keys::AccountPrivKey` at `m/44'/133'/1000'/0/<slice_id>` (dedicated account 1000, `--slice-account`). The slice id is the address index and is never reused. Before signing, `slp` re-derives the key and refuses if the address does not match the stored one.

## ZIP-317 fees measured by the builder

| Tx | Shape | Fee |
| --- | --- | --- |
| Fund (shielded → slice t-addr) | wallet proposal | 10,000 zat |
| Add | 1 t-in, 3 outs (vault, OP_RETURN, change) | 15,000 zat |
| Withdraw request | same shape, value `dust_threshold + 1000` | 15,000 zat |
| Shield back | 1–2 t-in → 1 Ironwood output (2 padded actions) | 15,000–20,000 zat |

Reserve per slice defaults to 0.001 ZEC (100,000 zat): add + withdraw (fee + 16,000 payload) + shield ≈ 66,000 zat, with margin.

## Testnet mode (added 2026-10-28)

- **THORChain has no usable testnet with ZEC.** The dev docs list every stagenet endpoint as "TBD" ("Stagenet endpoints are being transitioned"), and the stagenet URLs we tried (Nine Realms, Liquify) did not answer. So `-n test` simulates THORChain with a vault key from the user's own seed (`m/44'/1'/1001'/0/0`); all Zcash transactions are real testnet transactions.
- lightwalletd testnet: `testnet.zec.rocks:443` works (tip 4,550,748, Ironwood balance line present).
- **NU7 is active on testnet** since height 4,465,026 and our librustzcash revision knows it, so testnet txs are built for the NU7 branch.
- **Mainnet NU7 height is still `None` in this revision.** NU7 mainnet is expected Nov 5, 2026: update librustzcash before then, or mainnet transactions will be built for the wrong branch.
- Faucet: `https://zecfaucet.com` (JS app). `testnet.zecfaucet.com` did not resolve.
- Explorer links in the dashboard: `testnet.zcashexplorer.app` / `mainnet.zcashexplorer.app`.

## Maya (stretch)

Not attempted. THORChain only for the MVP.

## Phase status

- Phase 0
  - [x] devtool builds and syncs mainnet; Ironwood balance shown.
  - [ ] one shielded→t send: needs a funded wallet (owner).
  - [x] THORChain inbound / pool / LP / tx-status endpoints recorded above.
  - [x] OP_RETURN tx build path: signed add tx decodes with the expected outputs (`cargo test`).
- Phase 1–2: code complete (`slp plan | run | status | exit | observer`, resumable state machine in `slices.sqlite`). **Waiting for mainnet funds** to record txids.
- Phase 3: dashboard done (`apps/dashboard`). Screen recording pending a live run.
- Phase 4: README written. Demo video and submission are for the owner.

## Demo txids (fill in during the mainnet run)

| Step | Slice | txid |
| --- | --- | --- |
| Fund (shielded → t) | #0 | |
| Add `+:ZEC.ZEC` | #0 | |
| Withdraw `-:ZEC.ZEC:10000` | #0 | |
| THORChain outbound | #0 | |
| Shield back to Ironwood | #0 | |

`slp status --json` prints every txid per slice.
