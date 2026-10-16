#!/usr/bin/env python3
"""
scripts/generate_data.py

Generates synthetic bikeshare timeseries datasets suitable for the Six Sigma Hackathon project.

Usage examples:
  # quick sample (1 day, 5-minute interval)
  python3 scripts/generate_data.py --out data/normal_week/sample_quick_normal.csv --weeks 0.1458 --freq-minutes 5 --scenario normal --seed 1

  # full 3-week dataset at 5-minute intervals
  python3 scripts/generate_data.py --out data/normal_week/dataset_normal_3weeks.csv --weeks 3 --freq-minutes 5 --scenario normal --seed 42

Notes:
- weeks can be fractional to produce fewer days for quick previews (1 day ~= 0.142857 weeks).
- scenario: "normal" or "high_failure".
"""
import argparse
import csv
import math
import random
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

STATIONS = []
NUM_STATIONS = 20
DISTRICTS = ["District A", "District B", "District C", "District D"]

# Base coordinates (anonymized city center) -- small jitter for stations
CITY_CENTER = (40.7128, -74.0060)  # lat, lon (example city center)

SEED = 42


def make_stations(seed=SEED):
    random.seed(seed)
    stations = []
    for i in range(1, NUM_STATIONS + 1):
        district = DISTRICTS[(i - 1) % len(DISTRICTS)]
        total_docks = random.randint(10, 20)
        # place stations in a radius around city center
        angle = random.random() * 2 * math.pi
        radius_km = random.uniform(0.2, 5.0)
        # small lat/lon jitter formula (approx)
        lat = CITY_CENTER[0] + (radius_km / 110.574) * math.cos(angle)
        lon = CITY_CENTER[1] + (radius_km / (111.320 * math.cos(math.radians(CITY_CENTER[0])))) * math.sin(angle)
        stations.append({
            "station_id": i,
            "station_name": f"Station {i}",
            "district": district,
            "total_docks": total_docks,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
        })
    return stations


def simulate_time_series(stations, start_dt, minutes, freq_minutes=5, scenario="normal", seed=SEED):
    """Return a pandas DataFrame with simulated rows for each station and timestamp.
    Columns: station_id, station_name, district, total_docks, broken_docks, effective_capacity,
             bikes_available, broken_bike_count, percent_full, is_online, out_of_service, timestamp, latitude, longitude
    """
    rng = np.random.default_rng(seed)
    rows = []
    timestamps = [start_dt + timedelta(minutes=freq_minutes * i) for i in range(int(minutes / freq_minutes))]

    # introduce a few persistently problematic stations
    num_problem = 2 if scenario == "normal" else 5
    problem_stations = rng.choice([s['station_id'] for s in stations], size=num_problem, replace=False)

    for ts in timestamps:
        weekday = ts.weekday()  # 0=Mon
        hour = ts.hour + ts.minute / 60.0
        # rush multipliers
        morning_rush = 1.0
        afternoon_rush = 1.0
        if 7 <= ts.hour < 9 and weekday < 5:
            morning_rush = 1.6
        if 16 <= ts.hour < 18 and weekday < 5:
            afternoon_rush = 1.5

        for s in stations:
            sid = s['station_id']
            total = s['total_docks']

            # baseline occupancy by district type
            base = 0.5
            if s['district'] == 'District A':
                base += 0.05
            if s['district'] == 'District B':
                base -= 0.05

            # effect of rush: residential districts empty in morning, downtown fill up
            if 7 <= ts.hour < 9 and weekday < 5:
                if s['district'] in ['District B', 'District C']:
                    base -= 0.25 * morning_rush  # residential empties
                else:
                    base += 0.25 * morning_rush  # downtown fills
            if 16 <= ts.hour < 18 and weekday < 5:
                if s['district'] in ['District B', 'District C']:
                    base += 0.25 * afternoon_rush
                else:
                    base -= 0.2 * afternoon_rush

            # daily cycle (sinusoidal) to give daylight peaks on weekends
            day_of_week_factor = 0.1 * math.sin((hour / 24.0) * 2 * math.pi)
            # add noise
            noise = rng.normal(0, 0.06)

            frac = np.clip(base + day_of_week_factor + noise, 0.0, 1.0)

            # scenario: high_failure increases broken docks and offline probability
            if scenario == 'high_failure':
                broken_rate = 0.08
                offline_rate = 0.02
            else:
                broken_rate = 0.02
                offline_rate = 0.005

            # problem stations have higher chance of broken docks
            if sid in problem_stations:
                broken_rate *= 3
                offline_rate *= 3

            broken_docks = int(rng.binomial(total, broken_rate))
            is_online = rng.random() > offline_rate
            out_of_service = (not is_online) or (broken_docks >= total)

            effective_capacity = max(total - broken_docks, 0)

            # bikes_available sampled around frac * effective_capacity
            if effective_capacity > 0:
                mean_bikes = frac * effective_capacity
                bikes_available = int(np.clip(rng.normal(mean_bikes, max(1.0, 0.06 * effective_capacity)), 0, effective_capacity))
            else:
                bikes_available = 0

            # some bikes are broken/stuck
            stuck_rate = 0.01 if scenario == 'normal' else 0.05
            broken_bike_count = int(min(bikes_available, rng.binomial(bikes_available, stuck_rate))) if bikes_available > 0 else 0

            percent_full = float(bikes_available / effective_capacity) if effective_capacity > 0 else float('nan')

            rows.append({
                'station_id': sid,
                'station_name': s['station_name'],
                'district': s['district'],
                'total_docks': total,
                'broken_docks': broken_docks,
                'effective_capacity': effective_capacity,
                'bikes_available': bikes_available,
                'broken_bike_count': broken_bike_count,
                'percent_full': round(percent_full, 4) if not math.isnan(percent_full) else '',
                'is_online': bool(is_online),
                'out_of_service': bool(out_of_service),
                'timestamp': ts.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'latitude': s['latitude'],
                'longitude': s['longitude'],
            })

    df = pd.DataFrame(rows)
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True, help='Output CSV file path')
    parser.add_argument('--weeks', type=float, default=0.142857, help='Number of weeks to simulate (1 day ~= 0.142857)')
    parser.add_argument('--start', type=str, default=None, help='ISO start date/time (UTC). Default: now UTC rounded to day start')
    parser.add_argument('--freq-minutes', type=int, default=5, help='Sampling frequency in minutes')
    parser.add_argument('--scenario', choices=['normal', 'high_failure'], default='normal')
    parser.add_argument('--seed', type=int, default=SEED)

    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    stations = make_stations(seed=args.seed)

    if args.start:
        start_dt = datetime.fromisoformat(args.start.replace('Z', '+00:00'))
    else:
        # default: use 2026-01-05 00:00:00 UTC as reproducible baseline
        start_dt = datetime(2026, 1, 5, 0, 0, 0)

    minutes = int(args.weeks * 7 * 24 * 60)
    if minutes < args.freq_minutes:
        minutes = args.freq_minutes * 24 * 1  # at least one day

    df = simulate_time_series(stations, start_dt, minutes, freq_minutes=args.freq_minutes, scenario=args.scenario, seed=args.seed)

    # ensure columns ordering
    cols = ['timestamp', 'station_id', 'station_name', 'district', 'total_docks', 'broken_docks', 'effective_capacity', 'bikes_available', 'broken_bike_count', 'percent_full', 'is_online', 'out_of_service', 'latitude', 'longitude']
    df = df[cols]

    df.to_csv(args.out, index=False)
    print(f'Wrote {len(df)} rows to {args.out}')


if __name__ == '__main__':
    main()
