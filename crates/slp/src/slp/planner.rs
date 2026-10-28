//! Slice planner: splits an LP amount into standard denominations and spreads
//! them over time with random jitter.

use anyhow::{anyhow, bail};

pub(crate) const ZAT_PER_ZEC: u64 = 100_000_000;

/// Parses a decimal ZEC amount ("1.5") into zatoshis without going through floats.
pub(crate) fn parse_zec(s: &str) -> anyhow::Result<u64> {
    let (whole, frac) = s.trim().split_once('.').unwrap_or((s.trim(), ""));
    if frac.len() > 8 || (whole.is_empty() && frac.is_empty()) {
        bail!("invalid ZEC amount '{s}'");
    }
    let whole: u64 = if whole.is_empty() { 0 } else { whole.parse()? };
    let frac: u64 = format!("{frac:0<8}").parse()?;
    whole
        .checked_mul(ZAT_PER_ZEC)
        .and_then(|w| w.checked_add(frac))
        .ok_or_else(|| anyhow!("amount too large"))
}

pub(crate) fn fmt_zec(zat: u64) -> String {
    format!("{}.{:08}", zat / ZAT_PER_ZEC, zat % ZAT_PER_ZEC)
}

/// Greedy split of `total` into the given denominations (largest first).
/// Returns the slices and the leftover that stays shielded.
pub(crate) fn split(total: u64, denoms: &[u64]) -> (Vec<u64>, u64) {
    let mut denoms = denoms.to_vec();
    denoms.sort_unstable_by(|a, b| b.cmp(a));
    let mut left = total;
    let mut out = vec![];
    for d in denoms.into_iter().filter(|d| *d > 0) {
        while left >= d {
            out.push(d);
            left -= d;
        }
    }
    (out, left)
}

/// Parses a duration like "90s", "5m", "2h", "1d".
pub(crate) fn parse_duration(s: &str) -> anyhow::Result<u64> {
    let s = s.trim();
    let (num, mult) = match s.chars().last() {
        Some('s') => (&s[..s.len() - 1], 1),
        Some('m') => (&s[..s.len() - 1], 60),
        Some('h') => (&s[..s.len() - 1], 3600),
        Some('d') => (&s[..s.len() - 1], 86400),
        _ => (s, 1),
    };
    Ok(num.parse::<u64>().map_err(|_| anyhow!("invalid duration '{s}'"))? * mult)
}

/// Parses a jitter window like "5m-30m" into (min, max) seconds.
pub(crate) fn parse_jitter(s: &str) -> anyhow::Result<(u64, u64)> {
    let (a, b) = s.split_once('-').unwrap_or((s, s));
    let (a, b) = (parse_duration(a)?, parse_duration(b)?);
    if a > b {
        bail!("jitter min is greater than max");
    }
    Ok((a, b))
}

/// Cumulative schedule: each slice starts a random gap after the previous one.
/// The first slice also waits one gap, so the funding time is not the moment the
/// user typed the command. `rand_gap` returns a value in `[min, max]`.
pub(crate) fn schedule(
    n: usize,
    start: i64,
    mut rand_gap: impl FnMut() -> u64,
) -> Vec<i64> {
    let mut t = start;
    (0..n)
        .map(|_| {
            t += rand_gap() as i64;
            t
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_and_parses() {
        let z = ZAT_PER_ZEC;
        assert_eq!(split(16 * z, &[10 * z, 5 * z, z]), (vec![10 * z, 5 * z, z], 0));
        assert_eq!(split(parse_zec("3.5").unwrap(), &[z]), (vec![z, z, z], z / 2));
        assert_eq!(split(z / 2, &[z]), (vec![], z / 2));
        assert_eq!(parse_zec("0.001").unwrap(), 100_000);
        assert_eq!(parse_zec("16").unwrap(), 16 * z);
        assert!(parse_zec("1.123456789").is_err());
        assert_eq!(fmt_zec(150_000_000), "1.50000000");
        assert_eq!(parse_jitter("5m-30m").unwrap(), (300, 1800));
        assert_eq!(parse_jitter("2h").unwrap(), (7200, 7200));
        assert!(parse_jitter("30m-5m").is_err());
        let mut gaps = [10u64, 20, 30].into_iter();
        assert_eq!(schedule(3, 100, || gaps.next().unwrap()), vec![110, 130, 160]);
    }
}
