# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/bongekanjing/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/bongekanjing/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` answers every CSV input exactly as csv-reader does — same columns, rows and broken-row errors — but reads the text once by index instead of a character at a time. Unquoted fields are taken with a single slice; quoted fields are segmented only where a quote or a CR forces it; no string is ever built character by character.

`main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## Run it

```sh
node main.ts
```

## How fast

On the kit's practice set (6 cases, ~10.1 MB of CSV), the parse itself takes ~0.10 s against csv-reader 1.0.0's ~0.56 s — about 4.9× faster — while producing identical answers on every case. The whole entry (including the driver's JSON input/output) runs in ~0.91 s of wall time against the house baseline's ~1.79 s.

---

<sub>Entered on [make.fun](https://make.fun/?ref=204hjvsp&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
