//! Shielded LP Router: `slp plan | run | status | exit | observer`.
//!
//! Funds never leave keys derived from the user's own seed. Each slice is a fresh
//! transparent address funded from the shielded pool, which then adds single-sided
//! ZEC liquidity on THORChain and later withdraws and shields back to Ironwood.

mod chain;
mod planner;
mod store;
mod thor;

use std::{path::PathBuf, str::FromStr, time::Duration};

use anyhow::{anyhow, bail};
use clap::{Args, Subcommand};
use rand::{RngExt, rand_core::UnwrapErr, rngs::SysRng};
use secrecy::{ExposeSecret, SecretVec};
use serde_json::json;
use uuid::Uuid;
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::{Account, WalletWrite};
use zcash_client_sqlite::{WalletDb, util::SystemClock};
use zcash_keys::keys::{ReceiverRequirement, UnifiedAddressRequest};
use zcash_protocol::value::Zatoshis;
use zip321::{Payment, TransactionRequest};

use crate::{
    commands::{
        select_account,
        wallet::{send, sync},
    },
    config::WalletConfig,
    data::{Network, get_db_paths},
    remote::ConnectionArgs,
};
use planner::{fmt_zec, parse_jitter, parse_zec};
use store::{Slice, State, Store, now};
use thor::Thor;

#[derive(Debug, Subcommand)]
pub(crate) enum Command {
    /// Split an amount into standard-denomination slices and schedule them
    Plan(Plan),
    /// Execute pending slice actions until nothing is due (resumable)
    Run(Run),
    /// Show every slice and the owner's aggregate private position
    Status(Status),
    /// Withdraw LP slices and auto-shield the proceeds back to Ironwood
    Exit(Exit),
    /// Show only what a public observer sees on Midgard for each slice address
    Observer(Status),
}

impl Command {
    pub(crate) async fn run(self) -> anyhow::Result<()> {
        match self {
            Command::Plan(c) => c.run().await,
            Command::Run(c) => c.run().await,
            Command::Status(c) => c.status().await,
            Command::Exit(c) => c.run().await,
            Command::Observer(c) => c.observer().await,
        }
    }
}

#[derive(Debug, Args, Clone)]
pub(crate) struct Common {
    /// Wallet directory (created with `slp wallet -w <dir> init|restore-mnemonic`)
    #[arg(short, long, env = "SLP_WALLET_DIR", default_value = "./wallet")]
    wallet_dir: String,
    /// Slice state database. Back it up: it maps slices to their key indexes.
    #[arg(long, env = "SLP_STATE", default_value = "./slices.sqlite")]
    state: PathBuf,
    #[arg(long, env = "THORNODE_URL", default_value = thor::DEFAULT_THORNODE)]
    thornode: String,
    #[arg(long, env = "MIDGARD_URL", default_value = thor::DEFAULT_MIDGARD)]
    midgard: String,
}

impl Common {
    fn store(&self) -> anyhow::Result<Store> {
        Store::open(&self.state)
    }
    fn thor(&self) -> Thor {
        Thor::new(&self.thornode, &self.midgard)
    }
}

#[derive(Debug, Args, Clone)]
pub(crate) struct Signer {
    /// age identity file that decrypts the wallet seed
    #[arg(short, long, env = "SLP_IDENTITY")]
    identity: String,
    /// Wallet account that funds slices and receives shielded proceeds
    /// (only needed if the wallet has more than one account)
    #[arg(long)]
    account: Option<Uuid>,
    /// BIP-44 account index reserved for slice addresses. Never change it once used.
    #[arg(long, env = "SLP_SLICE_ACCOUNT", default_value_t = 1000)]
    slice_account: u32,
    #[command(flatten)]
    connection: ConnectionArgs,
}

impl Signer {
    fn seed(&self, wallet_dir: &str) -> anyhow::Result<(Network, SecretVec<u8>)> {
        let mut config = WalletConfig::read(Some(wallet_dir))?;
        let identities = age::IdentityFile::from_file(self.identity.clone())?.into_identities()?;
        let seed = config
            .decrypt_seed(identities.iter().map(|i| i.as_ref() as _))?
            .ok_or_else(|| anyhow!("wallet has no seed (view-only wallets cannot run slices)"))?;
        Ok((config.network(), seed))
    }
}

// ---------------------------------------------------------------- plan

#[derive(Debug, Args)]
pub(crate) struct Plan {
    /// Total ZEC to provide as liquidity (leftover below the smallest denomination stays shielded)
    #[arg(long)]
    amount: String,
    /// Standard denominations in ZEC, comma-separated
    #[arg(long, default_value = "10,5,1")]
    denoms: String,
    /// Random gap between consecutive slices, e.g. "5m-30m" (use hours/days in production)
    #[arg(long, default_value = "5m-60m")]
    jitter: String,
    /// Extra ZEC per slice to pay the add, withdraw and shield transactions
    #[arg(long, default_value = "0.001")]
    reserve: String,
    #[command(flatten)]
    common: Common,
    #[command(flatten)]
    signer: Signer,
}

impl Plan {
    async fn run(self) -> anyhow::Result<()> {
        let denoms = self
            .denoms
            .split(',')
            .map(parse_zec)
            .collect::<anyhow::Result<Vec<_>>>()?;
        let (slices, leftover) = planner::split(parse_zec(&self.amount)?, &denoms);
        if slices.is_empty() {
            bail!("amount is smaller than the smallest denomination");
        }
        let (gap_min, gap_max) = parse_jitter(&self.jitter)?;
        let reserve = parse_zec(&self.reserve)?;
        let mut rng = UnwrapErr(SysRng);
        let times = planner::schedule(slices.len(), now(), || rng.random_range(gap_min..=gap_max));

        let (params, seed) = self.signer.seed(&self.common.wallet_dir)?;
        let store = self.common.store()?;
        let first = store.next_id()?;
        let total: u64 = slices.iter().map(|d| d + reserve).sum();

        // Single-sided adds move the pool price: show the size relative to pool depth.
        if let Ok(pool) = self.common.thor().pool().await {
            let depth: u64 = pool.balance_asset.parse().unwrap_or(0);
            let biggest = slices[0];
            println!(
                "Pool {} depth: {} ZEC. Largest slice is {:.1}% of depth; single-sided adds incur slip and price exposure.",
                thor::POOL,
                fmt_zec(depth),
                100.0 * biggest as f64 / depth.max(1) as f64
            );
        }

        for (i, (denom, at)) in slices.iter().zip(times).enumerate() {
            let id = first + i as u32;
            let key = chain::slice_key(&params, seed.expose_secret(), self.signer.slice_account, id)?;
            let s = Slice::planned(id, chain::encode_t(&params, &key.addr), *denom, reserve, at);
            store.insert(&s)?;
            println!(
                "slice #{id:<3} {:>12} ZEC  at {}  {}",
                fmt_zec(*denom),
                fmt_time(at),
                s.address
            );
        }
        println!(
            "Planned {} slices; needs {} ZEC shielded (incl. reserves). {} ZEC stays shielded.",
            slices.len(),
            fmt_zec(total),
            fmt_zec(leftover)
        );
        println!("Next: `slp run`");
        Ok(())
    }
}

impl Slice {
    fn planned(id: u32, address: String, denom: u64, reserve: u64, at: i64) -> Self {
        Slice {
            id,
            address,
            denom,
            reserve,
            scheduled_at: at,
            state: State::Planned,
            exit_requested: false,
            fund_txid: None,
            add_txid: None,
            wd_txid: None,
            out_txid: None,
            shield_txid: None,
            shield_to: None,
            note: None,
            error: None,
            updated_at: 0,
        }
    }
}

fn fmt_time(t: i64) -> String {
    let d = t - now();
    if d <= 0 {
        "now".into()
    } else {
        format!("+{}m{:02}s", d / 60, d % 60)
    }
}

// ---------------------------------------------------------------- run / exit

#[derive(Debug, Args)]
pub(crate) struct Run {
    /// Seconds between polls of the chain and THORChain
    #[arg(long, default_value_t = 30)]
    poll: u64,
    /// Random delay before shielding withdrawn proceeds, e.g. "1m-10m"
    #[arg(long, default_value = "1m-10m")]
    shield_delay: String,
    /// Do a single pass and return
    #[arg(long)]
    once: bool,
    #[command(flatten)]
    common: Common,
    #[command(flatten)]
    signer: Signer,
}

#[derive(Debug, Args)]
pub(crate) struct Exit {
    /// Exit every LP slice
    #[arg(long)]
    all: bool,
    /// Exit only these slice ids
    #[arg(long, value_delimiter = ',')]
    ids: Vec<u32>,
    /// Random gap between consecutive withdrawals, e.g. "1m-10m"
    #[arg(long, default_value = "1m-10m")]
    jitter: String,
    #[command(flatten)]
    run: Run,
}

impl Exit {
    async fn run(self) -> anyhow::Result<()> {
        if !self.all && self.ids.is_empty() {
            bail!("pass --all or --ids 1,2,3");
        }
        let store = self.run.common.store()?;
        let (gap_min, gap_max) = parse_jitter(&self.jitter)?;
        let mut rng = UnwrapErr(SysRng);
        let mut t = now();
        for mut s in store.all()? {
            if !s.state.is_open() || s.exit_requested || !(self.all || self.ids.contains(&s.id)) {
                continue;
            }
            s.exit_requested = true;
            // Slices not yet in LP keep their schedule; they exit right after their add lands.
            if s.state == State::LpActive {
                t += rng.random_range(gap_min..=gap_max) as i64;
                s.scheduled_at = t;
            }
            store.save(&s)?;
            println!("slice #{} exit requested ({})", s.id, fmt_time(s.scheduled_at));
        }
        self.run.run().await
    }
}

struct Exec {
    params: Network,
    seed: SecretVec<u8>,
    wallet_dir: String,
    signer: Signer,
    store: Store,
    thor: Thor,
    client: chain::Client,
    shield_delay: (u64, u64),
    synced: bool,
}

impl Run {
    async fn run(self) -> anyhow::Result<()> {
        let (params, seed) = self.signer.seed(&self.common.wallet_dir)?;
        let client = self
            .signer
            .connection
            .connect(params, Some(&self.common.wallet_dir))
            .await?;
        let mut ex = Exec {
            params,
            seed,
            wallet_dir: self.common.wallet_dir.clone(),
            signer: self.signer.clone(),
            store: self.common.store()?,
            thor: self.common.thor(),
            client,
            shield_delay: parse_jitter(&self.shield_delay)?,
            synced: false,
        };
        loop {
            ex.synced = false;
            let mut pending = 0;
            let mut waiting_lp = 0;
            for mut s in ex.store.all()? {
                if !s.state.is_open() {
                    continue;
                }
                if s.state == State::LpActive && !s.exit_requested {
                    waiting_lp += 1;
                    continue;
                }
                pending += 1;
                if s.scheduled_at > now() {
                    continue;
                }
                let before = s.state;
                match ex.step(&mut s).await {
                    Ok(()) => s.error = None,
                    Err(e) => {
                        eprintln!("slice #{} {}: {e:#}", s.id, s.state.as_str());
                        s.error = Some(format!("{e:#}"));
                    }
                }
                ex.store.save(&s)?;
                if s.state != before {
                    println!("slice #{} {} -> {}", s.id, before.as_str(), s.state.as_str());
                }
            }
            if pending == 0 {
                println!(
                    "Nothing left to do. {waiting_lp} slice(s) providing liquidity; `slp exit --all` withdraws them."
                );
                return Ok(());
            }
            if self.once {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_secs(self.poll)).await;
        }
    }
}

impl Exec {
    fn key(&self, s: &Slice) -> anyhow::Result<chain::SliceKey> {
        let key = chain::slice_key(
            &self.params,
            self.seed.expose_secret(),
            self.signer.slice_account,
            s.id,
        )?;
        // Guards against a changed --slice-account: never sign for an address we did not plan.
        if chain::encode_t(&self.params, &key.addr) != s.address {
            bail!("derived key does not match slice address; check --slice-account");
        }
        Ok(key)
    }

    async fn utxos(&mut self, s: &Slice) -> anyhow::Result<Vec<chain::Utxo>> {
        chain::utxos(&mut self.client, &s.address).await
    }

    /// Advances one slice by at most one state.
    async fn step(&mut self, s: &mut Slice) -> anyhow::Result<()> {
        match s.state {
            State::Planned => {
                // Already funded (e.g. we crashed right after broadcasting)? Don't pay twice.
                if chain::total(&self.utxos(s).await?) >= s.denom + s.reserve {
                    s.state = State::Funded;
                    return Ok(());
                }
                self.thor.preflight().await?;
                self.sync().await?;
                let txid = self.fund(&s.address, s.denom + s.reserve).await?;
                s.fund_txid = Some(txid);
                s.state = State::FundingSent;
            }
            State::FundingSent => {
                if chain::total(&self.utxos(s).await?) >= s.denom + s.reserve {
                    s.state = State::Funded;
                }
            }
            State::Funded => {
                let inbound = self.thor.preflight().await?;
                let vault = chain::decode_inbound(&self.params, &inbound.address)?;
                let memo = thor::add_memo();
                thor::check_memo(&memo)?;
                let utxos = self.utxos(s).await?;
                let key = self.key(s)?;
                let dest = chain::Dest::Thor { vault, amount: s.denom, memo };
                s.add_txid = Some(chain::send(&self.params, &mut self.client, &key, &utxos, &dest).await?);
                s.state = State::AddSent;
            }
            State::AddSent => {
                if self.thor.lp(&s.address).await?.is_some_and(|lp| lp.is_active()) {
                    s.state = State::LpActive;
                } else if let Some(ob) = self.thor.outbound(s.add_txid.as_deref().unwrap_or("")).await? {
                    if ob.refund {
                        // Funds come back to the slice address; shield them like a withdrawal.
                        s.note = Some("add refunded by THORChain".into());
                        s.wd_txid = s.add_txid.clone();
                        s.state = State::WdSent;
                    }
                }
            }
            State::LpActive => {
                // Only reached when an exit was requested.
                let inbound = self.thor.preflight().await?;
                let vault = chain::decode_inbound(&self.params, &inbound.address)?;
                let memo = thor::withdraw_memo(10_000);
                thor::check_memo(&memo)?;
                // Withdraw requests must carry at least the dust threshold; add a small margin.
                let amount = inbound.dust_threshold() + 1_000;
                let utxos = self.utxos(s).await?;
                let key = self.key(s)?;
                let dest = chain::Dest::Thor { vault, amount, memo };
                s.wd_txid = Some(chain::send(&self.params, &mut self.client, &key, &utxos, &dest).await?);
                s.state = State::WdSent;
            }
            State::WdSent => {
                let wd = s.wd_txid.clone().unwrap_or_default();
                if let Some(ob) = self.thor.outbound(&wd).await? {
                    let arrived = self.utxos(s).await?.iter().any(|u| u.txid == ob.txid);
                    s.out_txid = Some(ob.txid);
                    if arrived {
                        let (a, b) = self.shield_delay;
                        s.scheduled_at = now() + UnwrapErr(SysRng).random_range(a..=b) as i64;
                        s.state = State::WdReceived;
                    }
                }
            }
            State::WdReceived => {
                let (ua, to) = self.fresh_ironwood_address()?;
                let utxos = self.utxos(s).await?;
                let key = self.key(s)?;
                let dest = chain::Dest::Shield { to };
                s.shield_txid = Some(chain::send(&self.params, &mut self.client, &key, &utxos, &dest).await?);
                s.shield_to = Some(ua);
                s.state = State::ShieldSent;
            }
            State::ShieldSent => {
                if self.utxos(s).await?.is_empty() {
                    s.state = State::Closed;
                }
            }
            State::Closed | State::Failed => {}
        }
        Ok(())
    }

    async fn sync(&mut self) -> anyhow::Result<()> {
        if !self.synced {
            sync::Command::new(self.signer.connection.clone())
                .run(
                    crate::ShutdownListener::new(),
                    Some(self.wallet_dir.clone()),
                    #[cfg(feature = "tui")]
                    crate::tui::Tui::new()?,
                )
                .await?;
            self.synced = true;
        }
        Ok(())
    }

    /// Shielded (Ironwood) -> slice t-address. The sender is hidden by the shielded pool.
    async fn fund(&mut self, to: &str, value: u64) -> anyhow::Result<String> {
        let payment = Payment::without_memo(
            ZcashAddress::from_str(to).map_err(|e| anyhow!("{e}"))?,
            Zatoshis::from_u64(value).map_err(|_| anyhow!("bad amount"))?,
        );
        let request = TransactionRequest::new(vec![payment]).map_err(|e| anyhow!("{e:?}"))?;
        let txid = send::pay(Some(self.wallet_dir.clone()), FundCtx(&self.signer), request)
            .await?
            .ok_or_else(|| anyhow!("funding transaction was not sent"))?;
        // The wallet now has pending change; the next funding must sync again.
        self.synced = false;
        Ok(txid.to_string())
    }

    /// A never-used address of the user's account with only an Orchard-format receiver,
    /// which post-NU6.3 transactions pay through the Ironwood pool.
    fn fresh_ironwood_address(&self) -> anyhow::Result<(String, orchard::Address)> {
        let (_, db_path) = get_db_paths(Some(&self.wallet_dir));
        let mut db = WalletDb::for_path(db_path, self.params, SystemClock, UnwrapErr(SysRng))?;
        let account = select_account(&db, self.signer.account)?;
        let req = UnifiedAddressRequest::custom(
            ReceiverRequirement::Require,
            ReceiverRequirement::Omit,
            ReceiverRequirement::Omit,
        )
        .map_err(|e| anyhow!("{e}"))?;
        let (ua, _) = db
            .get_next_available_address(account.id(), req)?
            .ok_or_else(|| anyhow!("account not found"))?;
        let to = *ua.orchard().ok_or_else(|| anyhow!("no Orchard receiver"))?;
        Ok((ua.encode(&self.params), to))
    }
}

struct FundCtx<'a>(&'a Signer);

impl send::PaymentContext for FundCtx<'_> {
    fn spending_account(&self) -> Option<Uuid> {
        self.0.account
    }
    fn age_identities(&self) -> anyhow::Result<Vec<Box<dyn age::Identity + Send + Sync>>> {
        Ok(age::IdentityFile::from_file(self.0.identity.clone())?.into_identities()?)
    }
    fn connection_args(&self) -> &ConnectionArgs {
        &self.0.connection
    }
    fn target_note_count(&self) -> usize {
        4
    }
    fn min_split_output_value(&self) -> u64 {
        10_000_000
    }
    fn require_confirmation(&self) -> bool {
        false
    }
    fn tx_version(&self) -> Option<zcash_primitives::transaction::TxVersion> {
        None
    }
}

// ---------------------------------------------------------------- status / observer

#[derive(Debug, Args)]
pub(crate) struct Status {
    /// Machine-readable output (used by the dashboard)
    #[arg(long)]
    json: bool,
    #[command(flatten)]
    common: Common,
}

impl Status {
    async fn status(self) -> anyhow::Result<()> {
        let store = self.common.store()?;
        let thor = self.common.thor();
        let slices = store.all()?;
        let mut rows = vec![];
        let (mut in_lp, mut redeem) = (0u64, 0u64);
        for s in &slices {
            let lp = if matches!(s.state, State::AddSent | State::LpActive | State::WdSent) {
                thor.lp(&s.address).await.ok().flatten().filter(|l| l.is_active())
            } else {
                None
            };
            if let Some(lp) = &lp {
                in_lp += lp.asset_deposit_value.parse::<u64>().unwrap_or(0);
                redeem += lp.asset_redeem_value.as_deref().unwrap_or("0").parse::<u64>().unwrap_or(0);
            }
            rows.push((s, lp));
        }
        let pool = thor.pool().await.ok();

        if self.json {
            let out = json!({
                "slices": rows.iter().map(|(s, lp)| json!({"slice": s, "lp": lp})).collect::<Vec<_>>(),
                "aggregate": {
                    "slices_in_lp": rows.iter().filter(|(_, lp)| lp.is_some()).count(),
                    "deposited_zat": in_lp,
                    "redeemable_zat": redeem,
                },
                "pool": pool.as_ref().map(|p| json!({"status": p.status, "balance_asset": p.balance_asset, "trading_halted": p.trading_halted})),
                "now": now(),
            });
            println!("{}", serde_json::to_string_pretty(&out)?);
            return Ok(());
        }

        println!("{:<4} {:>12} {:<13} {:<36} {:>12}  next / note", "id", "ZEC", "state", "address", "redeem ZEC");
        for (s, lp) in &rows {
            let redeem = lp
                .as_ref()
                .and_then(|l| l.asset_redeem_value.as_deref())
                .and_then(|v| v.parse().ok())
                .map(fmt_zec)
                .unwrap_or_else(|| "-".into());
            let next = if s.state.is_open() && s.scheduled_at > now() {
                fmt_time(s.scheduled_at)
            } else {
                String::new()
            };
            let note = s.error.as_deref().or(s.note.as_deref()).unwrap_or("");
            println!(
                "{:<4} {:>12} {:<13} {:<36} {:>12}  {next} {note}",
                s.id,
                fmt_zec(s.denom),
                s.state.as_str(),
                s.address,
                redeem
            );
        }
        println!(
            "\nOwner's private aggregate: {} slices in LP, {} ZEC deposited, {} ZEC redeemable (asset side, before fees).",
            rows.iter().filter(|(_, lp)| lp.is_some()).count(),
            fmt_zec(in_lp),
            fmt_zec(redeem)
        );
        Ok(())
    }

    async fn observer(self) -> anyhow::Result<()> {
        let store = self.common.store()?;
        let thor = self.common.thor();
        // Sorted by address, not slice id: the observer view carries no owner ordering.
        let mut addrs: Vec<String> = store
            .all()?
            .into_iter()
            .filter(|s| s.add_txid.is_some())
            .map(|s| s.address)
            .collect();
        addrs.sort();
        let mut out = vec![];
        for a in addrs {
            let member = thor.member(&a).await?;
            out.push(json!({"address": a, "midgard": member}));
        }
        if self.json {
            println!("{}", serde_json::to_string_pretty(&out)?);
        } else {
            println!("Public Midgard view (what anyone can see):");
            for o in out {
                let pools = &o["midgard"]["pools"];
                let p = pools.get(0).cloned().unwrap_or_default();
                println!(
                    "  {}  pool={} assetAdded={} assetWithdrawn={} firstAdded={}",
                    o["address"].as_str().unwrap_or(""),
                    p["pool"].as_str().unwrap_or("-"),
                    p["assetAdded"].as_str().unwrap_or("-"),
                    p["assetWithdrawn"].as_str().unwrap_or("-"),
                    p["dateFirstAdded"].as_str().unwrap_or("-"),
                );
            }
        }
        Ok(())
    }
}
