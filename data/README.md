# Bikeshare synthetic data

This README describes the CSV files generated for the Bikeshare Operations Dashboard project.

Generator: scripts/generate_data.py

Folder layout
- data/
  - normal_week/   (use the generator to produce one or more datasets here)
  - high_failure_week/  (use the generator to produce one or more datasets here)

Each dataset produced by the generator is a CSV with the following columns:

- station_id: integer identifier for the station (1..20)
- station_name: human-friendly name
- district: one of four district names (District A, District B, District C, District D)
- total_docks: integer, total docks installed at station (10-20)
- broken_docks: integer, docks currently broken/unusable (>=0)
- effective_capacity: total_docks - broken_docks (computed by generator)
- bikes_available: integer, number of bikes physically present in docks (>=0 and <= total_docks)
- broken_bike_count: integer, number of bikes stuck in docks or otherwise unusable (counts toward bikes_present but reduces effective availability)
- percent_full: float, bikes_available / effective_capacity (range 0.0 - 1.0). If effective_capacity is 0, this is recorded as NaN.
- is_online: boolean (True means station is reporting; False means station offline / dark)
- out_of_service: boolean (True if station is in maintenance/outage)
- timestamp: ISO 8601 UTC timestamp (e.g. 2026-10-16T08:05:00Z) at a 5-minute sampling interval by default
- latitude: decimal degrees
- longitude: decimal degrees

Units and notes
- Time is UTC in ISO 8601 format. The generator offers a --tz option to set a timezone for human interpretation but timestamps remain in UTC.
- percent_full is the fraction of effective capacity that is occupied by rentable bikes. If broken docks are present, effective_capacity < total_docks and percent_full reflects that.
- broken_bike_count counts bikes stuck in a dock and reduces availability even if the dock is physically occupied.
- The generator simulates realistic rush-hour patterns: weekday morning rush (07:00-09:00 local) and afternoon rush (16:00-18:00 local), plus noisier behavior on weekends. The high_failure_week datasets include more broken docks, offline stations, and longer outages.

How to create full datasets
1. Install requirements: pip install -r requirements.txt (script uses pandas and numpy)
2. Run the generator:
   python3 scripts/generate_data.py --out data/normal_week/dataset_normal_full.csv --weeks 3 --freq-minutes 5 --scenario normal --seed 42
   python3 scripts/generate_data.py --out data/high_failure_week/dataset_high_fail_full.csv --weeks 3 --freq-minutes 5 --scenario high_failure --seed 43

The script defaults to generating a compact sample dataset (one day, 5-min sampling) if you want a quick local preview. Use --weeks 3 to create the required 3-week dataset.

If you want the repo to contain committed full CSVs, run the script locally and commit the generated files into data/ (the generator is intentionally shipped so you can create large datasets locally rather than committing very large files into the repo).
