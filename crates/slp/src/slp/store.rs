//! Local slice state (`slices.sqlite`). Back this file up: the slice index is what
//! lets you re-derive the key that owns each LP position.

use std::path::Path;

use rusqlite::{Connection, Row, params};
#[cfg(test)]
use rusqlite::OptionalExtension;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum State {
    Planned,
    FundingSent,
    Funded,
    AddSent,
    LpActive,
    WdSent,
    WdReceived,
    ShieldSent,
    Closed,
    Failed,
}

const STATES: [(State, &str); 10] = [
    (State::Planned, "PLANNED"),
    (State::FundingSent, "FUNDING_SENT"),
    (State::Funded, "FUNDED"),
    (State::AddSent, "ADD_SENT"),
    (State::LpActive, "LP_ACTIVE"),
    (State::WdSent, "WD_SENT"),
    (State::WdReceived, "WD_RECEIVED"),
    (State::ShieldSent, "SHIELD_SENT"),
    (State::Closed, "CLOSED"),
    (State::Failed, "FAILED"),
];

impl State {
    pub(crate) fn as_str(self) -> &'static str {
        STATES.iter().find(|(s, _)| *s == self).unwrap().1
    }
    fn parse(s: &str) -> rusqlite::Result<Self> {
        STATES
            .iter()
            .find(|(_, n)| *n == s)
            .map(|(st, _)| *st)
            .ok_or_else(|| rusqlite::Error::InvalidColumnName(s.into()))
    }
    /// States in which the slice still has work to do (or is waiting for an exit).
    pub(crate) fn is_open(self) -> bool {
        !matches!(self, State::Closed | State::Failed)
    }
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct Slice {
    /// Also the BIP-44 address index under the dedicated slice account.
    pub(crate) id: u32,
    pub(crate) address: String,
    pub(crate) denom: u64,
    pub(crate) reserve: u64,
    /// Unix seconds; the next action on this slice will not run before this.
    pub(crate) scheduled_at: i64,
    pub(crate) state: State,
    pub(crate) exit_requested: bool,
    pub(crate) fund_txid: Option<String>,
    pub(crate) add_txid: Option<String>,
    pub(crate) wd_txid: Option<String>,
    pub(crate) out_txid: Option<String>,
    pub(crate) shield_txid: Option<String>,
    pub(crate) shield_to: Option<String>,
    pub(crate) note: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) updated_at: i64,
}

pub(crate) struct Store(Connection);

pub(crate) fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

impl Store {
    pub(crate) fn open(path: &Path) -> anyhow::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS slices (
                id INTEGER PRIMARY KEY,
                address TEXT NOT NULL UNIQUE,
                denom INTEGER NOT NULL,
                reserve INTEGER NOT NULL,
                scheduled_at INTEGER NOT NULL,
                state TEXT NOT NULL,
                exit_requested INTEGER NOT NULL DEFAULT 0,
                fund_txid TEXT, add_txid TEXT, wd_txid TEXT, out_txid TEXT,
                shield_txid TEXT, shield_to TEXT, note TEXT, error TEXT,
                updated_at INTEGER NOT NULL
            );",
        )?;
        Ok(Self(conn))
    }

    /// Next unused address index. Indexes are never reused, even after a slice closes.
    pub(crate) fn next_id(&self) -> anyhow::Result<u32> {
        let max: Option<u32> = self
            .0
            .query_row("SELECT MAX(id) FROM slices", [], |r| r.get(0))?;
        Ok(max.map_or(0, |m| m + 1))
    }

    pub(crate) fn insert(&self, s: &Slice) -> anyhow::Result<()> {
        self.0.execute(
            "INSERT INTO slices (id, address, denom, reserve, scheduled_at, state, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                s.id,
                s.address,
                s.denom as i64,
                s.reserve as i64,
                s.scheduled_at,
                s.state.as_str(),
                now()
            ],
        )?;
        Ok(())
    }

    pub(crate) fn all(&self) -> anyhow::Result<Vec<Slice>> {
        let mut st = self.0.prepare("SELECT * FROM slices ORDER BY id")?;
        let rows = st.query_map([], from_row)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    #[cfg(test)]
    pub(crate) fn get(&self, id: u32) -> anyhow::Result<Option<Slice>> {
        Ok(self
            .0
            .query_row("SELECT * FROM slices WHERE id = ?1", [id], from_row)
            .optional()?)
    }

    /// Writes every mutable field back.
    pub(crate) fn save(&self, s: &Slice) -> anyhow::Result<()> {
        self.0.execute(
            "UPDATE slices SET scheduled_at=?2, state=?3, exit_requested=?4, fund_txid=?5,
               add_txid=?6, wd_txid=?7, out_txid=?8, shield_txid=?9, shield_to=?10,
               note=?11, error=?12, updated_at=?13
             WHERE id=?1",
            params![
                s.id,
                s.scheduled_at,
                s.state.as_str(),
                s.exit_requested,
                s.fund_txid,
                s.add_txid,
                s.wd_txid,
                s.out_txid,
                s.shield_txid,
                s.shield_to,
                s.note,
                s.error,
                now()
            ],
        )?;
        Ok(())
    }
}

fn from_row(r: &Row<'_>) -> rusqlite::Result<Slice> {
    Ok(Slice {
        id: r.get("id")?,
        address: r.get("address")?,
        denom: r.get::<_, i64>("denom")? as u64,
        reserve: r.get::<_, i64>("reserve")? as u64,
        scheduled_at: r.get("scheduled_at")?,
        state: State::parse(&r.get::<_, String>("state")?)?,
        exit_requested: r.get("exit_requested")?,
        fund_txid: r.get("fund_txid")?,
        add_txid: r.get("add_txid")?,
        wd_txid: r.get("wd_txid")?,
        out_txid: r.get("out_txid")?,
        shield_txid: r.get("shield_txid")?,
        shield_to: r.get("shield_to")?,
        note: r.get("note")?,
        error: r.get("error")?,
        updated_at: r.get("updated_at")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let store = Store::open(Path::new(":memory:")).unwrap();
        assert_eq!(store.next_id().unwrap(), 0);
        let mut s = Slice {
            id: 0,
            address: "t1test".into(),
            denom: 100_000_000,
            reserve: 100_000,
            scheduled_at: 42,
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
        };
        store.insert(&s).unwrap();
        s.state = State::LpActive;
        s.add_txid = Some("ab".into());
        s.exit_requested = true;
        store.save(&s).unwrap();
        let back = store.get(0).unwrap().unwrap();
        assert_eq!(back.state, State::LpActive);
        assert_eq!(back.add_txid.as_deref(), Some("ab"));
        assert!(back.exit_requested);
        assert_eq!(store.next_id().unwrap(), 1);
    }
}
