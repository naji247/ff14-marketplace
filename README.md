# Famfrit Market Tools

Market tools for the Famfrit world (Primal data center) in Final Fantasy XIV, live at https://naji247.github.io/ff14-marketplace/

**Gathering market** (`index.html`)
- Every Miner/Botanist gatherable with its gathering level, filtered to your levels.
- Sort by purchases in the last 24 hours, units sold, median price and gil traded.
- Price check any market-board item: suggested list price, sell-or-vendor verdict, listings, sales, take-home after city tax.

**My listings** (`listings.html`)
- Finds your listings by retainer name (full market-board scan, or add items one by one).
- Shows whether each listing is lowest, tied or undercut, with a suggested reprice.
- Detects sales: a listing that leaves the board with a matching sale afterwards is logged as Sold, with the buyer and gil after tax. Reprices are recognised; anything else is logged as Off the board.
- Retainers, tracked items and the sales log are stored in your browser.

Shared code lives in `common.js` and `styles.css`. Market data comes live from the [Universalis API](https://docs.universalis.app/) (v2). Item names, icons and gathering levels come from the game data in [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) and [XIVAPI v2](https://v2.xivapi.com/).
