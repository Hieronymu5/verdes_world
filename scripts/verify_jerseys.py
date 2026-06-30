#!/usr/bin/env python3
import json
import re
import unicodedata


def normalize(name):
    name = re.sub(r'\s+Goalkeepers\s*$', '', name)
    # Strip diacritics so accented chars match unaccented versions
    nfkd = unicodedata.normalize('NFKD', name)
    name = nfkd.encode('ascii', 'ignore').decode('ascii')
    return name.strip().lower()


def main():
    # Parse jersey.txt -> {normalized_name: {jersey_numbers}}
    txt_players = {}
    txt_names = {}

    with open('scripts/jersey.txt') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t')
            if len(parts) < 2:
                continue
            num = int(parts[0])
            name = parts[1].strip()
            norm = normalize(name)
            if norm not in txt_players:
                txt_players[norm] = set()
                txt_names[norm] = name
            txt_players[norm].add(num)

    # Parse players.json -> {normalized_name: {jersey_numbers}}
    with open('public/data/players.json') as f:
        players_data = json.load(f)

    json_players = {}
    json_names = {}

    for p in players_data:
        norm = normalize(p['name'])
        json_players[norm] = set(p['jerseyNumbers'])
        json_names[norm] = p['name']

    # Compare
    missing = []
    incorrect = []

    for norm, expected in txt_players.items():
        if norm not in json_players:
            missing.append((txt_names[norm], sorted(expected)))
        else:
            actual = json_players[norm]
            if not expected.issubset(actual):
                incorrect.append((json_names[norm], sorted(expected), sorted(actual)))

    if missing:
        print("=== MISSING from players.json (in jersey.txt but not in players.json) ===\n")
        for name, nums in sorted(missing, key=lambda x: x[1][0]):
            print(f"  Jersey #{','.join(str(n) for n in nums):12s} {name}")

    if incorrect:
        print("\n=== INCORRECT jersey numbers (players.json missing numbers) ===\n")
        for name, expected, actual in sorted(incorrect, key=lambda x: x[0]):
            exp = ','.join(str(n) for n in expected)
            act = ','.join(str(n) for n in actual)
            print(f"  {name:30s} expected [{exp:10s}] but JSON has [{act}]")

    print(f"\n--- Summary ---")
    print(f"  Players in jersey.txt:     {len(txt_players)}")
    print(f"  Players in players.json:   {len(json_players)}")
    print(f"  Missing from JSON:         {len(missing)}")
    print(f"  Incorrect numbers:         {len(incorrect)}")


if __name__ == '__main__':
    main()
