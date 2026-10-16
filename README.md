# Bikeshare Ops Dashboard

This repository contains a static prototype of the Bikeshare Operations Dashboard plus a data generator for synthetic datasets used in testing and analysis.

What I added
- index.html + assets (map, sidebar, pages skeleton)
- scripts/generate_data.py — generator that can produce 3-week datasets at 5-minute sampling and supports "normal" and "high_failure" scenarios
- data/README.md explaining the dataset columns and how to generate full datasets locally

How to get full datasets
1. Install dependencies: pip install pandas numpy
2. Run the generator, for example:
   python3 scripts/generate_data.py --out data/normal_week/dataset_normal_3weeks.csv --weeks 3 --freq-minutes 5 --scenario normal --seed 42

Previewing the site locally
- Open index.html in a browser (the map uses Leaflet and will load sample CSV files if present under data/). For full preview, run a local static file server from the repo root:
  python3 -m http.server 8000
  then visit http://localhost:8000

GitHub Pages
If you want to host this site on GitHub Pages, enable Pages for this repository (Settings → Pages) and select the main branch and / (root) as the publishing source. The default Pages URL will be:

https://zoebishop16.github.io/applejazzhackathon/

(Enable Pages in repo settings to publish.)

Next steps
- Run the generator to create the required 3-week datasets and commit them to data/ (or keep them locally if the files are large).
- Implement the remaining interactive pages (heatmap, stockout log, dock grid, forecast ranking), rebalancing engine and maintenance workflow endpoints. The static skeleton and generator are in place to start building these features.
