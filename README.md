# Fast csv-reader

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/bongekanjing/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/bongekanjing/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0, built for the
[csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
("Read broken CSV files faster, 21 November 2026").

`solve.js` is a dependency-free ES module whose `run(input)` returns exactly
what csv-reader 1.0.0 returns for every case input `{text, header}`: the JSON
value `{columns, rows, errors}` — same BOM drop, LF/CRLF records, stray CRs,
quoted-field rules (doubled quotes, quote junk, unterminated quotes),
short/long row padding and cutting, and error objects in order. It gets its
speed from index-based scanning (slices between delimiter hits) instead of
the reference's character-at-a-time loop, with a whole-line split for records
whose line holds no quote and no stray CR.

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## Run it

```sh
node main.ts
```

Node 22. No installs, no network at runtime.
