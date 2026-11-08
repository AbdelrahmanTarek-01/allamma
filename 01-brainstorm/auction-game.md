# مزاد المعلومات (Info Auction) — 2+ players, solo (no teams)

Core: players bid money on a TOPIC before seeing the question. Highest bidder answers alone.
- Start money per difficulty table (medium 1000 ج). 8 lots per game (host: 5/8/12).
- Lot: topic shown ("أفلام عادل إمام") + difficulty chip; question hidden.
- Bidding: buttons +50 / +100 / +200. Each bid resets a 6s countdown (difficulty table sets length): "مين يزوّد؟" > "على واحد…" > "على اتنين…" > "بيع!". Can't outbid yourself; can't bid more than your money.
- No bids in time: lot is skipped (nobody pays).
- Buyer answers 4-option question, 15s. Right: +2x bid (net +bid). Wrong: lose bid (penalty per difficulty).
- Everyone else predicts "صح/غلط" on the buyer; right prediction +50 ج. Keeps non-buyers engaged.
- 0 money: you can still predict, can't bid.
- End: richest wins; awards (أغلى معلومة، أشجع مزايد، أحسن توقّعات، صفقة العمر). Placement feeds room leaderboard.
- Server-authoritative: timers, bids, money, question content sent only to clients after "sold".
Design: canvas row 8 (AuctionLot, AuctionAnswer with role tweak buyer/watcher, AuctionFinal).
