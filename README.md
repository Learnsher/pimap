# Hong Kong Pikmin Decor Map

A small static map for Hong Kong Pikmin Bloom decor candidates. It defaults to 葵興/葵涌 (青衣以外), includes 青衣 as a separate area, and lists the other 17 Hong Kong districts as selectable areas.

The app loads a local Kwai Tsing snapshot first for the two split Kwai Tsing areas. For other districts, use **Refresh data** once; the result is cached per area in the browser.

## Run

```sh
cd /Users/sherwoodliu/Documents/Codexgame/pikmin-kwai-tsing
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Update the bundled snapshot

The browser refresh updates local browser cache. To bake a new snapshot into `data/kwai-tsing-decors.json`, run:

```sh
cd /Users/sherwoodliu/Documents/Codexgame/pikmin-kwai-tsing
node scripts/refresh-data.mjs
```

## Data Notes

The map shows likely decor locations inferred from OpenStreetMap tags. It is a helper for Pikmin Bloom, not an official Niantic or Nintendo data source.
