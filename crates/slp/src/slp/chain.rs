//! Slice keys and the transparent transactions each slice sends:
//! THORChain deposits (value + OP_RETURN memo + change) and the final shield to Ironwood.

use anyhow::{anyhow, bail};
use rand::{rand_core::UnwrapErr, rngs::SysRng};
use tonic::transport::Channel;
use transparent::{
    address::TransparentAddress,
    builder::TransparentSigningSet,
    bundle::{OutPoint, TxOut},
    keys::{AccountPrivKey, NonHardenedChildIndex},
};
use zcash_client_backend::proto::service::{
    BlockId, ChainSpec, GetAddressUtxosArg, RawTransaction,
    compact_tx_streamer_client::CompactTxStreamerClient,
};
use zcash_keys::address::Address;
use zcash_primitives::transaction::{
    Transaction,
    builder::{BuildConfig, Builder, BundlePadding},
    fees::zip317,
};
use zcash_proofs::prover::LocalTxProver;
use zcash_protocol::{
    TxId,
    consensus::{BlockHeight, Parameters},
    memo::MemoBytes,
    value::Zatoshis,
};

pub(crate) type Client = CompactTxStreamerClient<Channel>;

/// Smallest change we are willing to leave at a slice address.
const MIN_CHANGE: u64 = 1_000;

pub(crate) struct SliceKey {
    sk: secp256k1::SecretKey,
    pub(crate) addr: TransparentAddress,
}

/// BIP-44 key `m/44'/133'/<slice_account>'/0/<index>`. The dedicated account keeps
/// slices apart from the wallet's normal transparent addresses.
pub(crate) fn slice_key<P: Parameters>(
    params: &P,
    seed: &[u8],
    slice_account: u32,
    index: u32,
) -> anyhow::Result<SliceKey> {
    let account = zip32::AccountId::try_from(slice_account)
        .map_err(|_| anyhow!("invalid slice account index {slice_account}"))?;
    let sk = AccountPrivKey::from_seed(params, seed, account)
        .map_err(|e| anyhow!("{e}"))?
        .derive_external_secret_key(
            NonHardenedChildIndex::from_index(index).ok_or_else(|| anyhow!("bad index"))?,
        )
        .map_err(|e| anyhow!("{e}"))?;
    let pk = TransparentSigningSet::new().add_key(sk);
    Ok(SliceKey {
        sk,
        addr: TransparentAddress::from_pubkey(&pk),
    })
}

pub(crate) fn encode_t<P: Parameters>(params: &P, addr: &TransparentAddress) -> String {
    Address::Transparent(*addr).encode(params)
}

/// THORChain publishes its ZEC vault as a ZIP-320 TEX address; the output script is the
/// plain P2PKH script for the same 20-byte hash.
pub(crate) fn decode_inbound<P: Parameters>(
    params: &P,
    s: &str,
) -> anyhow::Result<TransparentAddress> {
    match Address::decode(params, s) {
        Some(Address::Tex(hash)) => Ok(TransparentAddress::PublicKeyHash(hash)),
        Some(Address::Transparent(t @ TransparentAddress::PublicKeyHash(_))) => Ok(t),
        _ => bail!("unexpected THORChain inbound address '{s}'"),
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Utxo {
    outpoint: OutPoint,
    /// Display-order hex txid (what explorers and THORChain show), lowercase.
    pub(crate) txid: String,
    pub(crate) value: u64,
}

/// Mined, unspent outputs at `addr` according to lightwalletd.
pub(crate) async fn utxos(client: &mut Client, addr: &str) -> anyhow::Result<Vec<Utxo>> {
    let reply = client
        .get_address_utxos(GetAddressUtxosArg {
            addresses: vec![addr.to_string()],
            start_height: 0,
            max_entries: 0,
        })
        .await?
        .into_inner();
    reply
        .address_utxos
        .into_iter()
        .map(|u| {
            let txid: [u8; 32] = u.txid.try_into().map_err(|_| anyhow!("bad txid length"))?;
            Ok(Utxo {
                outpoint: OutPoint::new(txid, u32::try_from(u.index)?),
                txid: TxId::from_bytes(txid).to_string(),
                value: u64::try_from(u.value_zat)?,
            })
        })
        .collect()
}

pub(crate) fn total(utxos: &[Utxo]) -> u64 {
    utxos.iter().map(|u| u.value).sum()
}

pub(crate) enum Dest {
    /// `amount` to the THORChain vault, OP_RETURN `memo`, change back to the slice address.
    Thor {
        vault: TransparentAddress,
        amount: u64,
        memo: String,
    },
    /// Everything (minus fee) into a fresh Ironwood note.
    Shield { to: orchard::Address },
}

fn zats(v: u64) -> anyhow::Result<Zatoshis> {
    Zatoshis::from_u64(v).map_err(|_| anyhow!("invalid amount {v}"))
}

/// Builds and signs a slice transaction spending all of `utxos`. Pure: no network.
pub(crate) fn build_tx<P: Parameters + Clone>(
    params: &P,
    target: BlockHeight,
    ironwood_anchor: Option<orchard::Anchor>,
    key: &SliceKey,
    utxos: &[Utxo],
    dest: &Dest,
) -> anyhow::Result<Transaction> {
    if utxos.is_empty() {
        bail!("slice address has no spendable UTXOs");
    }
    let total_in = total(utxos);
    let pk = TransparentSigningSet::new().add_key(key.sk);

    let make = |rest: u64| -> anyhow::Result<Builder<P, ()>> {
        let mut b = Builder::new(
            params.clone(),
            target,
            BuildConfig::Standard {
                sapling_anchor: None,
                orchard_anchor: None,
                ironwood_anchor,
                orchard_padding: BundlePadding::DEFAULT,
                ironwood_padding: BundlePadding::DEFAULT,
            },
        );
        for u in utxos {
            let coin = TxOut::new(zats(u.value)?, key.addr.script().into());
            b.add_transparent_p2pkh_input(pk, u.outpoint.clone(), coin)
                .map_err(|e| anyhow!("{e}"))?;
        }
        match dest {
            Dest::Thor {
                vault,
                amount,
                memo,
            } => {
                b.add_transparent_output(vault, zats(*amount)?)
                    .map_err(|e| anyhow!("{e}"))?;
                b.add_transparent_null_data_output::<zip317::FeeError>(memo.as_bytes())
                    .map_err(|e| anyhow!("{e}"))?;
                b.add_transparent_output(&key.addr, zats(rest)?)
                    .map_err(|e| anyhow!("{e}"))?;
            }
            Dest::Shield { to } => {
                b.add_ironwood_output::<zip317::FeeError>(None, *to, zats(rest)?, MemoBytes::empty())
                    .map_err(|e| anyhow!("{e}"))?;
            }
        }
        Ok(b)
    };

    // The fee depends only on the shape, so price it with a placeholder value first.
    let fee = make(total_in)?
        .get_fee(&zip317::FeeRule::standard())
        .map_err(|e| anyhow!("{e}"))?
        .into_u64();
    let spend = match dest {
        Dest::Thor { amount, .. } => amount + fee,
        Dest::Shield { .. } => fee,
    };
    let rest = total_in
        .checked_sub(spend)
        .filter(|r| *r >= MIN_CHANGE)
        .ok_or_else(|| {
            anyhow!("slice holds {total_in} zat but needs {spend} + {MIN_CHANGE} (raise --reserve)")
        })?;

    let mut signing = TransparentSigningSet::new();
    signing.add_key(key.sk);
    let prover = LocalTxProver::bundled();
    let res = make(rest)?
        .build(
            &signing,
            &[],
            &[],
            UnwrapErr(SysRng),
            &prover,
            &prover,
            &zip317::FeeRule::standard(),
        )
        .map_err(|e| anyhow!("{e}"))?;
    let tx = res.transaction().clone();
    verify(&tx, key, dest, rest)?;
    Ok(tx)
}

/// Pre-flight: the signed transaction pays exactly what the plan says, nothing else.
fn verify(tx: &Transaction, key: &SliceKey, dest: &Dest, rest: u64) -> anyhow::Result<()> {
    let vout = tx.transparent_bundle().map_or(&[][..], |b| &b.vout[..]);
    match dest {
        Dest::Thor {
            vault,
            amount,
            memo,
        } => {
            let ok = vout.len() == 3
                && vout[0].value().into_u64() == *amount
                && vout[0].recipient_address() == Some(*vault)
                && vout[1].value().into_u64() == 0
                && vout[1].script_pubkey().0.0.ends_with(memo.as_bytes())
                && vout[1].script_pubkey().0.0.first() == Some(&0x6a)
                && vout[2].value().into_u64() == rest
                && vout[2].recipient_address() == Some(key.addr);
            if !ok {
                bail!("built transaction does not match the plan; refusing to send");
            }
        }
        Dest::Shield { .. } => {
            if !vout.is_empty() {
                bail!("shield transaction has transparent outputs; refusing to send");
            }
        }
    }
    Ok(())
}

/// Fetches chain tip (+ Ironwood anchor if shielding), builds, and broadcasts.
pub(crate) async fn send<P: Parameters + Clone>(
    params: &P,
    client: &mut Client,
    key: &SliceKey,
    utxos: &[Utxo],
    dest: &Dest,
) -> anyhow::Result<String> {
    let latest = client.get_latest_block(ChainSpec {}).await?.into_inner();
    let target = BlockHeight::from_u32(u32::try_from(latest.height)? + 1);
    let anchor = match dest {
        Dest::Shield { .. } => {
            let ts = client
                .get_tree_state(BlockId {
                    height: latest.height,
                    hash: vec![],
                })
                .await?
                .into_inner();
            Some(ts.ironwood_tree()?.root().into())
        }
        Dest::Thor { .. } => None,
    };
    let tx = build_tx(params, target, anchor, key, utxos, dest)?;
    let mut data = vec![];
    tx.write(&mut data)?;
    let resp = client
        .send_transaction(RawTransaction { data, height: 0 })
        .await?
        .into_inner();
    if resp.error_code != 0 {
        bail!("broadcast rejected ({}): {}", resp.error_code, resp.error_message);
    }
    Ok(tx.txid().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use zcash_protocol::consensus::MAIN_NETWORK;

    // Dummy seed; never holds funds.
    const SEED: [u8; 64] = [7u8; 64];

    #[test]
    fn tex_decodes_to_same_hash_p2pkh() {
        let t = decode_inbound(&MAIN_NETWORK, "tex1up236qj2mr87ml9388ydm33tuhtdckk39dgv9g").unwrap();
        let s = encode_t(&MAIN_NETWORK, &t);
        assert!(s.starts_with("t1"), "{s}");
        println!("THORChain ZEC vault tex1up236… = {s}");
    }

    #[test]
    fn slice_keys_are_deterministic_and_distinct() {
        let a = slice_key(&MAIN_NETWORK, &SEED, 1000, 0).unwrap().addr;
        let b = slice_key(&MAIN_NETWORK, &SEED, 1000, 0).unwrap().addr;
        let c = slice_key(&MAIN_NETWORK, &SEED, 1000, 1).unwrap().addr;
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    /// Phase 0 spike: a signed THORChain add tx that decodes with the expected outputs.
    #[test]
    fn builds_thorchain_add_with_op_return() {
        let key = slice_key(&MAIN_NETWORK, &SEED, 1000, 0).unwrap();
        let vault = decode_inbound(&MAIN_NETWORK, "tex1up236qj2mr87ml9388ydm33tuhtdckk39dgv9g").unwrap();
        let utxos = vec![Utxo {
            outpoint: OutPoint::new([1u8; 32], 0),
            txid: String::new(),
            value: 100_100_000,
        }];
        let memo = crate::slp::thor::add_memo();
        // Recent mainnet height (post-NU6.3 Ironwood).
        let target = BlockHeight::from_u32(3_533_400);
        let dest = Dest::Thor { vault, amount: 100_000_000, memo: memo.clone() };
        let tx = build_tx(&MAIN_NETWORK, target, None, &key, &utxos, &dest).unwrap();

        // Round-trip through bytes, as a node would see it.
        let mut raw = vec![];
        tx.write(&mut raw).unwrap();
        let back = Transaction::read(&raw[..], tx.consensus_branch_id()).unwrap();
        let vout = &back.transparent_bundle().unwrap().vout;
        assert_eq!(vout[0].value().into_u64(), 100_000_000);
        assert_eq!(vout[0].recipient_address(), Some(vault));
        assert_eq!(&vout[1].script_pubkey().0.0[2..], memo.as_bytes());
        let fee = 100_100_000 - 100_000_000 - vout[2].value().into_u64();
        assert_eq!(fee, 15_000, "ZIP-317: 3 logical actions");
        println!("tx version {:?}, branch {:?}, fee {fee}", back.version(), back.consensus_branch_id());
    }

    /// Shield-back: all transparent value goes into one Ironwood output.
    #[test]
    fn builds_shield_to_ironwood() {
        let key = slice_key(&MAIN_NETWORK, &SEED, 1000, 0).unwrap();
        let sk = orchard::keys::SpendingKey::from_zip32_seed(&SEED, 133, zip32::AccountId::ZERO).unwrap();
        let to = orchard::keys::FullViewingKey::from(&sk).address_at(0u32, orchard::keys::Scope::External);
        let utxos = vec![Utxo {
            outpoint: OutPoint::new([2u8; 32], 0),
            txid: String::new(),
            value: 99_000_000,
        }];
        let tx = build_tx(
            &MAIN_NETWORK,
            BlockHeight::from_u32(3_533_400),
            Some(orchard::Anchor::empty_tree()),
            &key,
            &utxos,
            &Dest::Shield { to },
        )
        .unwrap();
        assert!(tx.transparent_bundle().unwrap().vout.is_empty());
        assert!(tx.orchard_bundle().is_none(), "must use the Ironwood pool, not Orchard");
        let fee = tx.fee_paid(|_| Ok::<_, zcash_protocol::value::BalanceError>(Some(Zatoshis::from_u64(99_000_000).unwrap())));
        println!("shield tx {:?} fee {:?}", tx.version(), fee.ok());
    }
}
