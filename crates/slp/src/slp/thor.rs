//! THORChain HTTP client (thornode + Midgard) and memo builders.
//!
//! Only slice addresses and our own txids are ever sent to these endpoints.

use anyhow::{anyhow, bail};
use serde::Deserialize;
use serde_json::Value;

pub(crate) const POOL: &str = "ZEC.ZEC";
pub(crate) const DEFAULT_THORNODE: &str = "https://gateway.liquify.com/chain/thorchain_api";
pub(crate) const DEFAULT_MIDGARD: &str = "https://gateway.liquify.com/chain/thorchain_midgard";
/// UTXO-chain OP_RETURN relay limit.
const MAX_MEMO: usize = 80;

pub(crate) fn add_memo() -> String {
    format!("+:{POOL}")
}

pub(crate) fn withdraw_memo(bps: u32) -> String {
    format!("-:{POOL}:{bps}")
}

pub(crate) fn check_memo(memo: &str) -> anyhow::Result<()> {
    if memo.len() > MAX_MEMO {
        bail!("memo is {} bytes, limit is {MAX_MEMO}", memo.len());
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub(crate) struct Inbound {
    pub(crate) chain: String,
    /// ZIP-320 TEX address (`tex1…`).
    pub(crate) address: String,
    #[serde(default)]
    pub(crate) halted: bool,
    #[serde(default)]
    pub(crate) global_trading_paused: bool,
    #[serde(default)]
    pub(crate) chain_lp_actions_paused: bool,
    pub(crate) dust_threshold: String,
}

impl Inbound {
    pub(crate) fn dust_threshold(&self) -> u64 {
        self.dust_threshold.parse().unwrap_or(0)
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct Pool {
    pub(crate) status: String,
    pub(crate) balance_asset: String,
    #[serde(default)]
    pub(crate) trading_halted: bool,
}

#[derive(Debug, Deserialize, serde::Serialize, Clone)]
pub(crate) struct Lp {
    pub(crate) units: String,
    pub(crate) asset_deposit_value: String,
    #[serde(default)]
    pub(crate) asset_redeem_value: Option<String>,
    #[serde(default)]
    pub(crate) rune_redeem_value: Option<String>,
}

impl Lp {
    pub(crate) fn is_active(&self) -> bool {
        self.units.parse::<u128>().unwrap_or(0) > 0
            && self.asset_deposit_value.parse::<u128>().unwrap_or(0) > 0
    }
}

/// An outbound THORChain sent (or refunded) for one of our inbound txs.
#[derive(Debug)]
pub(crate) struct Outbound {
    pub(crate) txid: String,
    pub(crate) refund: bool,
}

pub(crate) struct Thor {
    http: reqwest::Client,
    thornode: String,
    midgard: String,
}

impl Thor {
    pub(crate) fn new(thornode: &str, midgard: &str) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("client"),
            thornode: thornode.trim_end_matches('/').into(),
            midgard: midgard.trim_end_matches('/').into(),
        }
    }

    async fn get(&self, url: String) -> anyhow::Result<Option<Value>> {
        let resp = self.http.get(&url).send().await?;
        let status = resp.status();
        let body = resp.text().await?;
        if status == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !status.is_success() {
            bail!("GET {url} -> {status}: {}", body.chars().take(300).collect::<String>());
        }
        Ok(Some(serde_json::from_str(&body)?))
    }

    pub(crate) async fn inbound(&self) -> anyhow::Result<Inbound> {
        let v = self
            .get(format!("{}/thorchain/inbound_addresses", self.thornode))
            .await?
            .ok_or_else(|| anyhow!("inbound_addresses not found"))?;
        let all: Vec<Inbound> = serde_json::from_value(v)?;
        all.into_iter()
            .find(|i| i.chain == "ZEC")
            .ok_or_else(|| anyhow!("THORChain lists no ZEC inbound address"))
    }

    pub(crate) async fn pool(&self) -> anyhow::Result<Pool> {
        let v = self
            .get(format!("{}/thorchain/pool/{POOL}", self.thornode))
            .await?
            .ok_or_else(|| anyhow!("pool {POOL} not found"))?;
        Ok(serde_json::from_value(v)?)
    }

    /// Refuses to continue unless ZEC LP actions are possible right now.
    pub(crate) async fn preflight(&self) -> anyhow::Result<Inbound> {
        let inbound = self.inbound().await?;
        if inbound.halted || inbound.chain_lp_actions_paused || inbound.global_trading_paused {
            bail!("THORChain ZEC is halted or LP actions are paused: {inbound:?}");
        }
        let pool = self.pool().await?;
        if pool.status != "Available" {
            bail!("pool {POOL} status is '{}', expected 'Available'", pool.status);
        }
        Ok(inbound)
    }

    /// The thornode LP record for a slice address, if any.
    pub(crate) async fn lp(&self, addr: &str) -> anyhow::Result<Option<Lp>> {
        let v = self
            .get(format!(
                "{}/thorchain/pool/{POOL}/liquidity_provider/{addr}",
                self.thornode
            ))
            .await?;
        Ok(v.map(serde_json::from_value).transpose()?)
    }

    /// What any outsider sees for this address on Midgard.
    pub(crate) async fn member(&self, addr: &str) -> anyhow::Result<Option<Value>> {
        self.get(format!("{}/v2/member/{addr}", self.midgard)).await
    }

    /// Returns the ZEC outbound for one of our inbound txs, once THORChain has sent it.
    pub(crate) async fn outbound(&self, txid: &str) -> anyhow::Result<Option<Outbound>> {
        let Some(v) = self
            .get(format!("{}/thorchain/tx/status/{}", self.thornode, txid.to_uppercase()))
            .await?
        else {
            return Ok(None);
        };
        Ok(parse_outbound(&v))
    }
}

fn parse_outbound(v: &Value) -> Option<Outbound> {
    v.get("out_txs")?
        .as_array()?
        .iter()
        .find(|o| o.get("chain").and_then(Value::as_str) == Some("ZEC"))
        .and_then(|o| {
            let txid = o.get("id")?.as_str()?;
            // Pending outbounds carry an all-zero id until signed.
            if txid.is_empty() || txid.chars().all(|c| c == '0') {
                return None;
            }
            let memo = o.get("memo").and_then(Value::as_str).unwrap_or("");
            Some(Outbound {
                txid: txid.to_lowercase(),
                refund: memo.to_uppercase().starts_with("REFUND"),
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memos_and_outbounds() {
        assert_eq!(add_memo(), "+:ZEC.ZEC");
        assert_eq!(withdraw_memo(10000), "-:ZEC.ZEC:10000");
        assert!(check_memo(&withdraw_memo(10000)).is_ok());
        assert!(check_memo(&"x".repeat(81)).is_err());

        let v: Value = serde_json::json!({
            "out_txs": [{"id": "ABCD", "chain": "ZEC", "memo": "OUT:1234"}]
        });
        let o = parse_outbound(&v).unwrap();
        assert_eq!((o.txid.as_str(), o.refund), ("abcd", false));
        let v: Value = serde_json::json!({
            "out_txs": [{"id": "EF01", "chain": "ZEC", "memo": "REFUND:1234"}]
        });
        assert!(parse_outbound(&v).unwrap().refund);
        let pending: Value = serde_json::json!({
            "out_txs": [{"id": "0000000000000000000000000000000000000000000000000000000000000000", "chain": "ZEC"}]
        });
        assert!(parse_outbound(&pending).is_none());
        assert!(parse_outbound(&serde_json::json!({"stages": {}})).is_none());
    }
}
