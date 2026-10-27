# NIFTY ORB Options Backtester

Browser-based historical NIFTY options backtesting with bundled data. Hosted with GitHub Pages; it also runs locally without internet after cloning/downloading the entire repository.

## Online

Open **https://yogidme049-eng.github.io/nifty-orb-options/**. Select a signal strategy and dates, configure legs, and click **Run options backtest**. The first run downloads the selected spot history and compressed option snapshots for signal dates. Full multi-year runs require more data and processing than a short date range.

- Pure ORB without PDH/PDL or EMA filters, PDH/PDL + ORB, and EMA20 bias + ORB.
- Default signal credit spread: upside sells ATM PE and buys PE 200 points lower; downside sells ATM CE and buys CE 200 points higher.
- Editable single/multiple legs, ATM/strike offsets, target premium selection and presets.
- Monday–Friday filters, fees, slippage and fixed/data-provided lot sizes.
- Combined basket Profit/Loss plus every contract fill, drawdown, monthly/yearly and weekday reports.
- Trades, legs, audit CSV and full report JSON exports.

## Data and execution

Bundled snapshot: **1,407 option sessions**, **72,794,223 valid quotes**, January 2021–September 2026. Source files were supplied in OC_Data/nifty. Each compressed day is loaded on demand. Missing source sessions are audited rather than fabricated. Embedded spot history ends September 29, 2026.

Parquet takes precedence over overlapping CSV dates. The 2022 yearly CSV has no spot field; ATM for those sessions falls back to the signal's spot close. Data provenance and import diagnostics are in `site/options-data/manifest.json`.

Signals use completed one-minute spot bars. Fills use the first available option LTP snapshot after a completed signal/exit bar within the selected delay (default five minutes). All legs share an entry and exit snapshot, keep their original strike/expiry, and require valid fills; otherwise the basket is skipped. LTPs are research proxies rather than bid/ask executions. Fixed 65-unit sizing is the default across all dates, not an inferred historical lot-size schedule. Costs are configurable. Margin/account returns and intratrade drawdown are not modeled.

## Run locally

On macOS double-click `Start NIFTY Offline.command`, or run:

```sh
python3 serve.py
```

Keep that terminal open. The app binds only to 127.0.0.1. Python's standard library is sufficient to run it; no runtime packages or remote CDN are needed. Opening the HTML directly as file:// is unsupported.

## Source layout and updates

- `site/`: HTML, CSS, JavaScript and bundled historical data.
- `site/signal-engine.js`: spot signal strategies.
- `site/options-engine.js`: contract selection and basket P&L.
- `site/option-presets.js`: editable option strategy templates.
- `tools/sync-options.py`: incremental import utility; requires DuckDB when importing new source files. Running the website does not require DuckDB.

GitHub Pages publishes the main branch root. Push changes to main to update the website. No broker credentials, account connections or live trading are included. Browser imports remain in the visitor's browser. The online site does not automatically read or monitor the original Desktop folder.

### Faster repeat backtests

Option sessions are processed by four background workers. The browser caches daily
files by the manifest content hash and caches the entry/exit quote windows, so
changing option legs or costs can reuse those windows without downloading or
parsing the entire day again. Changing signal timing rebuilds the required window
from the cached day. Results are assembled in chronological order.

The run status shows cached and downloaded session counts. Cache storage is local
to this browser and site address; clearing site data or using private browsing may
remove it. If storage is unavailable, the backtest still runs using downloads.
The first run over a new date range still needs its option files. Spot files for
2021–2026 are gzip-compressed for transfer (20.4 MB reduced to 6.0 MB).

## Opposite-side re-entry after SL

Daily entries defaults to two. A second spot signal is allowed only after the
first signal exits at Stop/Stop gap, on a later bar and in the opposite direction.
There is no second entry after target/time exit and no third entry. PDH/PDL and EMA filters apply to the first entry only;
the second uses only the opposite ORB breakout after the first stop. The first option basket must actually
execute, and the second cannot enter before its exit snapshot. Each leg has
independent First entry lots and Second entry lots (both default to 1). Reports
and exports identify Entry #1 and #2; quantities, costs and combined P&L use the
selected lots. Select One entry to retain the previous behavior.

## New fixed-range ORB strategy

Select ORB 09:20–09:30 · Boundary SL · 1:2. It uses all eleven minute
candles labelled 09:20–09:30 and accepts the first close strictly outside the
range starting with 09:31. No PDH/PDL or EMA filter. Long stop = ORB low;
short stop = ORB high. Risk is entry-to-stop distance and target is 2R.
Range, stop model and target are fixed; selecting it defaults to one daily
entry. Two-entry mode remains available using the documented opposite-side
reentry after a first stop. The old Pure ORB option has been removed from the
selector; the remaining alternatives are PDH/PDL and EMA20. Full rules for
each available strategy are shown at the bottom of the app.

### Boundary ORB with PDH/PDL filter

A separate selector option, ORB 09:20–09:30 + PDH/PDL · Boundary SL · 1:2,
requires the first LONG close to exceed both ORB High and PDH, or the first
SHORT close to be below both ORB Low and PDL. Entries begin with the 09:31
candle. Stop stays at the opposite ORB boundary and target is 2R. No EMA.
Missing previous-day levels skip the day. Default is one entry; optional
second entry retains the existing opposite-ORB-only rule after first SL.
The unfiltered Boundary SL variant remains available separately.

### PDH/PDL + ORB without the 10 AM wait

A separate After range (no 10 AM wait) option checks completed 1-minute
closes immediately after the selected ORB's last candle. LONG must be above
both ORB High and PDH; SHORT below both ORB Low and PDL. It retains the
original risk model: ORB width × Stop setting, measured from entry; target
uses the selected R multiple. This is distinct from boundary SL. The old
From 10 AM variant remains available. Rules are listed at the page bottom.
