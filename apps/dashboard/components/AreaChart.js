"use client";

// One-series area chart (TradingView lightweight-charts): crosshair, change vs range start,
// range high/low, optional entry price line and "you joined" markers.
// Series color #F4B728 (Zcash yellow) has 3:1+ contrast on the dark surface.
import { AreaSeries, ColorType, CrosshairMode, LineStyle, createChart, createSeriesMarkers } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

const SERIES = "#F4B728";

const when = (t, hours) =>
  new Date(t * 1000).toLocaleString(undefined, hours ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric", year: "numeric" });

/** Snaps a timestamp to the last data point at or before it (or the first point). */
function snap(points, t) {
  let best = points[0].t;
  for (const p of points) if (p.t <= t) best = p.t;
  return best;
}

export default function AreaChart({ points, field, format, height = 260, label, band, entry, markers, hours, period }) {
  const box = useRef(null);
  const [hover, setHover] = useState(null);
  // Parents rebuild these every render; key on content so the chart is not recreated each tick.
  const mkey = JSON.stringify(markers ?? []);

  useEffect(() => {
    if (!box.current || !points?.length) return;
    const chart = createChart(box.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#A19EB4",
        fontFamily: "inherit",
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(246,244,251,0.06)" } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: Boolean(hours), secondsVisible: false, rightOffset: 3 },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "rgba(244,183,40,0.6)", labelBackgroundColor: "#201D2C" },
        horzLine: { color: "rgba(244,183,40,0.4)", labelBackgroundColor: "#201D2C" },
      },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: SERIES,
      lineWidth: 2,
      topColor: "rgba(244,183,40,0.28)",
      bottomColor: "rgba(244,183,40,0)",
      priceFormat: { type: "custom", formatter: format, minMove: 0.01 },
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: "#0d0c14",
    });
    series.setData(points.map((p) => ({ time: p.t, value: p[field] })));
    if (entry?.value) {
      series.createPriceLine({
        price: entry.value,
        color: "#2ED8B6",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: entry.label,
      });
    }
    const marks = JSON.parse(mkey);
    if (marks.length) {
      const grouped = new Map();
      for (const m of marks) {
        const t = snap(points, m.t);
        grouped.set(t, (grouped.get(t) ?? 0) + 1);
      }
      createSeriesMarkers(
        series,
        [...grouped].map(([time, n]) => ({
          time,
          position: "belowBar",
          shape: "arrowUp",
          color: "#2ED8B6",
          text: n > 1 ? `You joined ×${n}` : "You joined",
        })),
      );
    }
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((param) => {
      const v = param.seriesData?.get(series)?.value;
      setHover(v == null ? null : { v, t: param.time });
    });
    return () => chart.remove();
  }, [points, field, format, height, entry?.value, entry?.label, mkey, hours]);

  const first = points?.[0]?.[field];
  const last = points?.at(-1);
  const shown = hover ?? (last && { v: last[field], t: last.t });
  const change = shown && first ? ((shown.v - first) / first) * 100 : null;
  const values = points?.map((p) => p[field]) ?? [];

  return (
    <figure className="chart" aria-label={label}>
      <figcaption>
        <div className="chart-now">
          <span className="chart-label">{label}</span>
          {shown && (
            <span className="chart-value">
              {format(shown.v)}
              {change != null && (
                <b className={Math.abs(change) < 0.005 ? "flat" : change > 0 ? "up" : "down"}>
                  {Math.abs(change) < 0.005 ? "" : change > 0 ? "▲ " : "▼ "}
                  {Math.abs(change).toFixed(2)}%{period ? ` ${period}` : ""}
                </b>
              )}
            </span>
          )}
          {shown && <small className="chart-when">{when(shown.t, hours)}</small>}
        </div>
        {values.length > 1 && (
          <dl className="chart-hl">
            <div>
              <dt>High</dt>
              <dd>{format(Math.max(...values))}</dd>
            </div>
            <div>
              <dt>Low</dt>
              <dd>{format(Math.min(...values))}</dd>
            </div>
          </dl>
        )}
      </figcaption>
      <div className="chart-plot">
        {band && <div className="chart-band" aria-hidden="true" />}
        <div ref={box} style={{ height }} />
        {band && <span className="chart-band-label">{band}</span>}
        {points && !points.length && <p className="chart-empty">THORChain history is unavailable right now.</p>}
        {!points && <p className="chart-empty">Loading THORChain history…</p>}
      </div>
    </figure>
  );
}
