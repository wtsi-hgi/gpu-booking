# Copyright (c) 2026 Genome Research Ltd.
#
# Author: Sendu Bala <sb10@sanger.ac.uk>
#
# Permission is hereby granted, free of charge, to any person obtaining
# a copy of this software and associated documentation files (the
# "Software"), to deal in the Software without restriction, including
# without limitation the rights to use, copy, modify, merge, publish,
# distribute, sublicense, and/or sell copies of the Software, and to
# permit persons to whom the Software is furnished to do so, subject to
# the following conditions:
#
# The above copyright notice and this permission notice shall be included
# in all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
# EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
# IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
# CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
# TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

"""Export Sanger LSF cost codes and LDAP names as booking suggestions."""

import argparse
import base64
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from config import BookingOptions

__all__ = ["main"]


def _cost_codes(path: Path) -> list[str]:
    in_groups = False
    codes: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        fields = line.split("#", 1)[0].split()
        if not fields:
            continue
        if fields[:2] == ["Begin", "UserGroup"]:
            in_groups = True
        elif fields[:2] == ["End", "UserGroup"]:
            in_groups = False
        elif in_groups and re.fullmatch(r"s[0-9]+/?", fields[0]):
            codes.add(fields[0].removesuffix("/"))
    if not codes:
        raise ValueError(
            f"No s-number cost codes found in UserGroup sections of {path}"
        )
    return sorted(codes)


def _ldif(contents: str) -> list[dict[str, list[str]]]:
    records: list[dict[str, list[str]]] = []
    record: dict[str, list[str]] = {}
    # LDIF folds a continued line with one leading space, including base64 values.
    contents = contents.replace("\r\n", "\n").replace("\n ", "")
    for line in contents.splitlines() + [""]:
        if not line:
            if record:
                records.append(record)
                record = {}
            continue
        if line.startswith("#"):
            continue
        key, separator, value = line.partition(":")
        if not separator or value.startswith("<"):
            raise ValueError("Unsupported LDAP output; expected inline LDIF attributes")
        if value.startswith(":"):
            value = base64.b64decode(value[1:].strip(), validate=True).decode("utf-8")
        record.setdefault(key.lower(), []).append(value.strip())
    return records


def _search(
    uri: str, base: str, ldap_filter: str, attributes: list[str]
) -> list[dict[str, list[str]]]:
    result = subprocess.run(
        [
            "ldapsearch",
            "-LLL",
            "-x",
            "-o",
            "nettimeout=15",
            "-l",
            "60",
            "-E",
            "!pr=500/noprompt",
            "-H",
            uri,
            "-b",
            base,
            "-s",
            "one",
            ldap_filter,
            *attributes,
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    return _ldif(result.stdout)


def _name(record: dict[str, list[str]]) -> str:
    for attribute in ("displayname", "cn"):
        for value in record.get(attribute, []):
            if value.strip():
                return value.strip()
    raise ValueError(f"No displayName or cn for {record.get('dn', ['LDAP entry'])[0]}")


def _pi_names(
    groups: list[dict[str, list[str]]], people: list[dict[str, list[str]]]
) -> list[str]:
    people_by_dn = {
        person["dn"][0].casefold(): person for person in people if "dn" in person
    }
    names: set[str] = set()
    for group in groups:
        for dn in group.get("sangerprojectpi", []):
            person = people_by_dn.get(dn.casefold())
            if person is None:
                raise ValueError(f"Cannot resolve sangerProjectPI reference: {dn}")
            names.add(_name(person))
    if not names:
        raise ValueError("No PI names found in LDAP")
    return sorted(names)


def _publish(path: Path, options: BookingOptions) -> None:
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            stream.write(options.model_dump_json(indent=2) + "\n")
            # Preserve existing access bits; new public reference files are readable.
            mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
            os.fchmod(stream.fileno(), mode)
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--lsb-users", type=Path, required=True, help="LSF lsb.users file"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=os.getenv("GPU_BOOKING_BOOKING_OPTIONS_FILE"),
        help="Destination JSON (default: GPU_BOOKING_BOOKING_OPTIONS_FILE)",
    )
    parser.add_argument("--ldap-uri", default="ldaps://ldap-ro.internal.sanger.ac.uk")
    parser.add_argument("--group-base", default="ou=group,dc=sanger,dc=ac,dc=uk")
    parser.add_argument("--people-base", default="ou=people,dc=sanger,dc=ac,dc=uk")
    parser.add_argument(
        "--technical-lead-filter",
        help="LDAP filter selecting technical leads under people-base; omitted = none",
    )
    parser.add_argument(
        "--inference-interactive-gpu-type",
        action="append",
        default=[],
        help="Designated GPU type label; repeat for multiple labels",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Generate and atomically publish validated booking suggestions."""
    parser = _parser()
    args = parser.parse_args(argv)
    if args.output is None:
        parser.error("set --output or GPU_BOOKING_BOOKING_OPTIONS_FILE")
    try:
        codes = _cost_codes(args.lsb_users)
        groups = _search(
            args.ldap_uri, args.group_base, "(sangerProjectPI=*)", ["sangerProjectPI"]
        )
        people = _search(
            args.ldap_uri, args.people_base, "(uid=*)", ["displayName", "cn"]
        )
        pis = _pi_names(groups, people)
        leads = (
            _search(
                args.ldap_uri,
                args.people_base,
                args.technical_lead_filter,
                ["displayName", "cn"],
            )
            if args.technical_lead_filter
            else []
        )
        options = BookingOptions(
            cost_codes=codes,
            project_pis=pis,
            technical_leads=sorted({_name(person) for person in leads}),
            inference_interactive_gpu_types=args.inference_interactive_gpu_type,
        )
        _publish(args.output, options)
    except subprocess.CalledProcessError as error:
        print(f"LDAP search failed: {error.stderr.strip()}", file=sys.stderr)
        return 1
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"Export failed: {error}", file=sys.stderr)
        return 1
    print(
        f"Wrote {args.output}: {len(codes)} cost codes, {len(pis)} PIs, "
        f"{len(options.technical_leads)} technical leads"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
