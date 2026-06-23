#!/usr/bin/env python3
"""
Verify players.json club lists against Wikipedia infobox club history.

Usage:
  python3 scripts/verify_players_wikipedia.py
  python3 scripts/verify_players_wikipedia.py --verbose --delay 0.25
  python3 scripts/verify_players_wikipedia.py --output /tmp/players_wiki_verify.json

Resume behavior:
  - By default, if --output already exists, completed players are skipped.
  - The script writes checkpoint updates to --output after each player.
  - Use --no-resume to force a clean run from the start.
  - Use --retry-errors to re-run players previously saved with status=error.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from urllib.error import HTTPError

API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "verdes-world-audit/1.1 (local debug script)"


@dataclass
class WikiCandidate:
    title: str
    wikitext: str
    wiki_teams: list[str]
    matched_json_team_count: int


def api(params: dict[str, Any], retries: int = 6, timeout: int = 30) -> dict[str, Any]:
    url = API + "?" + urllib.parse.urlencode(params)
    wait_seconds = 1.0

    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code == 429 and attempt < retries - 1:
                retry_after = exc.headers.get("Retry-After")
                sleep_for = float(retry_after) if retry_after and retry_after.isdigit() else wait_seconds
                print(f"    [rate-limited] HTTP 429, retrying in {sleep_for:.1f}s...")
                time.sleep(sleep_for)
                wait_seconds = min(wait_seconds * 2, 20)
                continue
            raise

    raise RuntimeError("Exceeded retry attempts")


def strip_accents(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def normalize_team_name(value: str) -> str:
    value = strip_accents(value).lower()
    value = value.replace("&", " and ").replace("→", " ")
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(
        r"\b(fc|cf|sc|afc|club|de|ac|football|soccer|mens|men|womens|women)\b",
        " ",
        value,
    )
    value = re.sub(r"\s+", " ", value).strip()
    return value


ALIASES = {
    normalize_team_name("NYCFC"): normalize_team_name("New York City FC"),
    normalize_team_name("NY Red Bulls"): normalize_team_name("New York Red Bulls"),
    normalize_team_name("Sporting KC"): normalize_team_name("Sporting Kansas City"),
    normalize_team_name("CF Montréal"): normalize_team_name("CF Montreal"),
    normalize_team_name("Rakow Czestochowa"): normalize_team_name("Raków Częstochowa"),
    normalize_team_name("1. FC Nürnberg"): normalize_team_name("Nurnberg"),
    normalize_team_name("Vélez Sársfield"): normalize_team_name("Velez Sarsfield"),
    normalize_team_name("Estudiantes LP"): normalize_team_name("Estudiantes de La Plata"),
    normalize_team_name("UNC Chapel Hill"): normalize_team_name("North Carolina Tar Heels"),
    normalize_team_name("SMU"): normalize_team_name("SMU Mustangs"),
    normalize_team_name("St. Edward's University"): normalize_team_name("St. Edward's Hilltoppers"),
    normalize_team_name("University of Virginia"): normalize_team_name("Virginia Cavaliers"),
    normalize_team_name("University of Washington"): normalize_team_name("Washington Huskies"),
    normalize_team_name("University of Portland"): normalize_team_name("Portland Pilots"),
    normalize_team_name("University of Tennessee"): normalize_team_name("Tennessee Volunteers"),
    normalize_team_name("University of Texas"): normalize_team_name("Texas Longhorns"),
    normalize_team_name("University of Wisconsin"): normalize_team_name("Wisconsin Badgers"),
    normalize_team_name("Miami University"): normalize_team_name("Miami RedHawks"),
    normalize_team_name("NC State University"): normalize_team_name("NC State Wolfpack"),
    normalize_team_name("Penn State University"): normalize_team_name("Penn State Nittany Lions"),
    normalize_team_name("Virginia Tech"): normalize_team_name("Virginia Tech Hokies"),
    normalize_team_name("Georgetown University"): normalize_team_name("Georgetown Hoyas"),
    normalize_team_name("Indiana University"): normalize_team_name("Indiana Hoosiers"),
    normalize_team_name("UCLA"): normalize_team_name("UCLA Bruins"),
    normalize_team_name("Barcelona SC"): normalize_team_name("Barcelona Sporting Club"),
    normalize_team_name("Club Olimpia"): normalize_team_name("Olimpia Asuncion"),
}


def canonical_team_name(value: str) -> str:
    normalized = normalize_team_name(value)
    return ALIASES.get(normalized, normalized)


def teams_match(left: str, right: str) -> bool:
    a = canonical_team_name(left)
    b = canonical_team_name(right)

    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True

    a_tokens = set(a.split())
    b_tokens = set(b.split())
    if a_tokens and b_tokens and len(a_tokens & b_tokens) >= max(1, min(len(a_tokens), len(b_tokens)) - 1):
        return True

    return SequenceMatcher(None, a, b).ratio() >= 0.88


WIKI_LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def extract_link_or_text_team_names(raw_value: str) -> list[str]:
    value = raw_value
    value = re.sub(r"<ref[^>]*>.*?</ref>", " ", value)
    value = re.sub(r"<ref[^/>]*/>", " ", value)

    # Remove shallow templates repeatedly.
    while "{{" in value and "}}" in value:
        value = re.sub(r"\{\{[^{}]*\}\}", " ", value)

    value = value.replace("→", " ")
    value = re.sub(r"\((?:on\s+)?loan\)", " ", value, flags=re.IGNORECASE)

    links = WIKI_LINK_RE.findall(value)
    if links:
        extracted = []
        for target, display in links:
            team = (display or target).strip()
            if team:
                extracted.append(team)
        return extracted

    value = re.sub(r"''+", "", value)
    value = re.sub(r"\[|\]", "", value)
    value = re.sub(r"\s+", " ", value).strip(" ,;")
    return [value] if value else []


def extract_wikipedia_teams_from_infobox(wikitext: str) -> list[str]:
    teams: list[str] = []

    for line in wikitext.splitlines():
        match = re.match(r"^\|\s*([a-zA-Z_]+\d*)\s*=\s*(.*)$", line)
        if not match:
            continue

        key = match.group(1).lower().strip()
        value = match.group(2).strip()
        if not value:
            continue

        # Focus on first-team and college lines in the infobox.
        if re.fullmatch(r"clubs\d+", key) or re.fullmatch(r"college\d+", key):
            teams.extend(extract_link_or_text_team_names(value))

    deduped: list[str] = []
    seen: set[str] = set()
    for team in teams:
        canonical = canonical_team_name(team)
        if canonical and canonical not in seen:
            seen.add(canonical)
            deduped.append(team)

    return deduped


def has_football_infobox(wikitext: str) -> bool:
    text = wikitext.lower()
    return (
        "{{infobox football biography" in text
        or "{{infobox footballer biography" in text
        or "{{infobox soccer biography" in text
        or "{{infobox football player" in text
    )


def fetch_page_wikitext(title: str) -> tuple[str | None, str | None]:
    data = api(
        {
            "action": "query",
            "format": "json",
            "redirects": 1,
            "titles": title,
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
        }
    )

    pages = data.get("query", {}).get("pages", {})
    if not pages:
        return None, None

    page = next(iter(pages.values()))
    if "missing" in page:
        return None, None

    wikitext = (
        page.get("revisions", [{}])[0]
        .get("slots", {})
        .get("main", {})
        .get("*", "")
    )
    return page.get("title", title), wikitext


def search_wikipedia_titles(player_name: str) -> list[str]:
    queries = [
        f'"{player_name}" footballer',
        f'"{strip_accents(player_name)}" footballer',
    ]

    titles: list[str] = []
    for query in queries:
        data = api(
            {
                "action": "query",
                "format": "json",
                "list": "search",
                "srsearch": query,
                "srlimit": 6,
            }
        )
        found = [row["title"] for row in data.get("query", {}).get("search", [])]
        for title in found:
            if title not in titles:
                titles.append(title)

    return titles


def choose_best_wikipedia_candidate(player_name: str, json_teams: list[str], verbose: bool) -> WikiCandidate | None:
    candidate_titles: list[str] = []

    for title_try in (player_name, strip_accents(player_name)):
        if title_try and title_try not in candidate_titles:
            candidate_titles.append(title_try)

    for title in search_wikipedia_titles(player_name):
        if title not in candidate_titles:
            candidate_titles.append(title)
        if len(candidate_titles) >= 8:
            break

    best: WikiCandidate | None = None
    best_score = -1

    for title in candidate_titles:
        resolved_title, wikitext = fetch_page_wikitext(title)
        if not resolved_title or not wikitext:
            continue
        if not has_football_infobox(wikitext):
            continue

        wiki_teams = extract_wikipedia_teams_from_infobox(wikitext)
        matched_count = sum(1 for jt in json_teams if any(teams_match(jt, wt) for wt in wiki_teams))

        score = matched_count * 10
        if canonical_team_name(player_name) == canonical_team_name(resolved_title):
            score += 4

        if verbose:
            print(
                f"      candidate: {resolved_title} | matched JSON teams: {matched_count}/{len(json_teams)}"
            )

        if score > best_score:
            best_score = score
            best = WikiCandidate(
                title=resolved_title,
                wikitext=wikitext,
                wiki_teams=wiki_teams,
                matched_json_team_count=matched_count,
            )

    return best


def ordered_results_for_players(
    players: list[dict[str, Any]],
    results_by_name: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    ordered: list[dict[str, Any]] = []
    for player in players:
        name = player.get("name")
        if isinstance(name, str) and name in results_by_name:
            ordered.append(results_by_name[name])
    return ordered


def write_checkpoint_output(
    players: list[dict[str, Any]],
    results_by_name: dict[str, dict[str, Any]],
    output_file: Path,
) -> None:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    ordered = ordered_results_for_players(players, results_by_name)
    temp_file = output_file.with_suffix(output_file.suffix + ".tmp")
    temp_file.write_text(json.dumps(ordered, ensure_ascii=False, indent=2))
    temp_file.replace(output_file)


def load_existing_results(output_file: Path) -> dict[str, dict[str, Any]]:
    if not output_file.exists():
        return {}

    try:
        raw = json.loads(output_file.read_text())
    except json.JSONDecodeError:
        print(f"Warning: could not parse existing output file {output_file}; starting fresh.")
        return {}

    if not isinstance(raw, list):
        print(f"Warning: existing output file {output_file} is not a JSON list; starting fresh.")
        return {}

    loaded: dict[str, dict[str, Any]] = {}
    for row in raw:
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        if isinstance(name, str) and name:
            loaded[name] = row
    return loaded


def verify_players(
    players_file: Path,
    output_file: Path,
    delay_seconds: float,
    verbose: bool,
    resume: bool,
    retry_errors: bool,
) -> None:
    players = json.loads(players_file.read_text())
    total = len(players)

    results_by_name: dict[str, dict[str, Any]] = {}
    if resume:
        results_by_name = load_existing_results(output_file)

    completed_before_run = len(results_by_name)
    print(f"Verifying {total} players from {players_file}...")
    if resume and completed_before_run:
        print(f"Resume enabled: found {completed_before_run} existing result(s) in {output_file}.")

    processed_now = 0

    for index, player in enumerate(players, start=1):
        name = player["name"]
        json_teams = [club["clubName"] for club in player.get("clubs", [])]

        existing = results_by_name.get(name)
        if existing:
            existing_status = existing.get("status")
            should_retry = retry_errors and existing_status == "error"
            if not should_retry:
                print(f"[{index}/{total}] Skipping (already verified): {name} [{existing_status}]")
                continue
            print(f"[{index}/{total}] Retrying previous error: {name}")
        else:
            print(f"[{index}/{total}] Verifying: {name}")

        try:
            best_candidate = choose_best_wikipedia_candidate(name, json_teams, verbose=verbose)
        except Exception as exc:  # pylint: disable=broad-except
            print(f"    ERROR: {exc}")
            results_by_name[name] = {
                "name": name,
                "status": "error",
                "error": str(exc),
            }
            processed_now += 1
            write_checkpoint_output(players, results_by_name, output_file)
            time.sleep(delay_seconds)
            continue

        if not best_candidate:
            print("    no reliable wikipedia football infobox page found")
            results_by_name[name] = {
                "name": name,
                "status": "no-reliable-wikipedia",
            }
            processed_now += 1
            write_checkpoint_output(players, results_by_name, output_file)
            time.sleep(delay_seconds)
            continue

        wiki_teams = best_candidate.wiki_teams
        missing_from_json = [wt for wt in wiki_teams if not any(teams_match(wt, jt) for jt in json_teams)]
        extra_in_json = [jt for jt in json_teams if not any(teams_match(jt, wt) for wt in wiki_teams)]

        status = "match" if not missing_from_json and not extra_in_json else "diff"
        print(
            f"    {status}: page={best_candidate.title} | missing={len(missing_from_json)} | extra={len(extra_in_json)}"
        )

        results_by_name[name] = {
            "name": name,
            "status": status,
            "title": best_candidate.title,
            "jsonTeams": json_teams,
            "wikiTeams": wiki_teams,
            "missingFromJson": missing_from_json,
            "extraInJson": extra_in_json,
        }

        processed_now += 1
        write_checkpoint_output(players, results_by_name, output_file)
        time.sleep(delay_seconds)

    final_results = ordered_results_for_players(players, results_by_name)
    counts = Counter(row["status"] for row in final_results)

    print("\nDone.")
    print("Summary:", dict(counts))
    print(f"Processed in this run: {processed_now}")
    print(f"Detailed report written to: {output_file}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify players.json teams against Wikipedia football infobox club history"
    )
    parser.add_argument(
        "--players-file",
        default="public/data/players.json",
        help="Path to players.json (default: public/data/players.json)",
    )
    parser.add_argument(
        "--output",
        default="/tmp/players_wiki_verify.json",
        help="Path for verification output JSON (default: /tmp/players_wiki_verify.json)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.25,
        help="Delay between player checks in seconds (default: 0.25)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print candidate page details while matching",
    )
    parser.add_argument(
        "--resume",
        dest="resume",
        action="store_true",
        default=True,
        help="Resume from existing output file if present (default: enabled)",
    )
    parser.add_argument(
        "--no-resume",
        dest="resume",
        action="store_false",
        help="Ignore existing output and start from scratch",
    )
    parser.add_argument(
        "--retry-errors",
        action="store_true",
        help="When resuming, re-run players previously saved with status=error",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    verify_players(
        players_file=Path(args.players_file),
        output_file=Path(args.output),
        delay_seconds=max(0.0, args.delay),
        verbose=args.verbose,
        resume=args.resume,
        retry_errors=args.retry_errors,
    )


if __name__ == "__main__":
    main()
