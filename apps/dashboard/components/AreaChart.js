"use client";

// One-series area chart (TradingView lightweight-charts) with crosshair + tooltip.
// Series color #F4B728 (Zcash yellow) passes the dataviz lightness and contrast checks on the dark surface.
import { AreaSeries, ColorType, CrosshairMode, createChart } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

const SERIES = "#F4B728";

export default function AreaChart({ points, field, format, height = 260, label, band }) {
  const box = useRef(null);
  const [hover, setHover] = useState(null);

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
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(246,244,251,0.07)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
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
      priceFormat: { type: "custom", formatter: format },
      lastValueVisible: true,
      priceLineVisible: false,
    });
    series.setData(points.map((p) => ({ time: p.t, value: p[field] })));
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((param) => {
      const v = param.seriesData?.get(series)?.value;
      setHover(v == null ? null : { v, t: param.time });
    });
    return () => chart.remove();
  }, [points, field, format, height]);

  const last = points?.at(-1);
  const shown = hover ?? (last && { v: last[field], t: last.t });
  return (
    <figure className="chart" aria-label={label}>
      <figcaption>
        <span className="chart-label">{label}</span>
        {shown && (
          <span className="chart-value">
            {format(shown.v)}
            <small>{new Date(shown.t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
          </span>
        )}
      </figcaption>
      <div className="chart-plot">
        {band && <div className="chart-band" aria-hidden="true" />}
        <div ref={box} style={{ height }} />
        {band && <span className="chart-band-label">{band}</span>}
      </div>
      {!points?.length && <p className="chart-empty">Loading THORChain history…</p>}
    </figure>
  );
}
