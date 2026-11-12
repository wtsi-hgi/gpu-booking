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

"""Exercise the booking suggestions export at its file boundary."""

import json
import subprocess
from pathlib import Path

import pytest

from config import Settings
from export_booking_options import main


@pytest.mark.parametrize("include_leads", [True, False])
def test_export_options(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, include_leads: bool
) -> None:
    users = tmp_path / "lsb.users"
    users.write_text(
        "# s999 ignored\nBegin UserGroup\nGROUP_NAME GROUP_MEMBER USER_SHARES\n"
        "s4230 (!) () # core\ns123/ (!) ()\ns4230 (!) ()\nteam78 (!) ()\n"
        "End UserGroup\nBegin User\ns888 other\nEnd User\n"
    )
    output = tmp_path / "options.json"
    output.write_text("{}")
    output.chmod(0o640)
    replies = iter(
        [
            "dn: cn=team,ou=group,dc=example\nsangerProjectPI: uid=ab1,ou=people,\n"
            " dc=example\nsangerProjectPI: uid=cd2,ou=people,dc=example\n\n",
            "dn: uid=ab1,ou=people,dc=example\ncn: Alice Brown\n\n"
            "dn: uid=cd2,ou=people,dc=example\ncn:: Sm9zw6kgRG9l\n\n",
            "dn: uid=lead,ou=people,dc=example\ncn: Tech Lead\n\n",
        ]
    )
    calls: list[list[str]] = []

    def search(command: list[str], **kwargs: object) -> subprocess.CompletedProcess:
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, next(replies), "")

    monkeypatch.setattr(subprocess, "run", search)
    monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(output))
    arguments = [
        "--lsb-users",
        str(users),
        "--inference-interactive-gpu-type",
        " H200 ",
    ]
    if include_leads:
        arguments.extend(["--technical-lead-filter", "(departmentNumber=IT)"])
    assert main(arguments) == 0
    options = Settings(_env_file=None).booking_options
    assert options.model_dump() == {
        "cost_codes": ["s123", "s4230"],
        "project_pis": ["Alice Brown", "José Doe"],
        "technical_leads": ["Tech Lead"] if include_leads else [],
        "inference_interactive_gpu_types": ["H200"],
    }
    assert json.loads(output.read_text()) == options.model_dump()
    assert output.stat().st_mode & 0o777 == 0o640
    assert len(calls) == (3 if include_leads else 2)
    if include_leads:
        assert "(departmentNumber=IT)" in calls[-1]
    assert all("-x" in call and "-E" in call for call in calls)


@pytest.mark.parametrize("failure", ["ldap", "missing-pi", "invalid-ldif", "no-codes"])
def test_export_failure_preserves_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    users = tmp_path / "lsb.users"
    users.write_text(
        "Begin UserGroup\n"
        + ("team1 (!) ()\n" if failure == "no-codes" else "s123 (!) ()\n")
        + "End UserGroup\n"
    )
    output = tmp_path / "options.json"
    output.write_text('{"cost_codes": ["old"]}\n')
    original = output.read_bytes()

    def search(command: list[str], **kwargs: object) -> subprocess.CompletedProcess:
        if failure == "ldap":
            raise subprocess.CalledProcessError(
                4, command, stderr="Size limit exceeded"
            )
        result = "dn: cn=team,dc=example\nsangerProjectPI: uid=missing,dc=example\n"
        if failure == "invalid-ldif":
            result = "dn: cn=team,dc=example\nsangerProjectPI:< file:///private\n"
        return subprocess.CompletedProcess(command, 0, result, "")

    monkeypatch.setattr(subprocess, "run", search)
    assert main(["--lsb-users", str(users), "--output", str(output)]) == 1
    assert output.read_bytes() == original
    assert sorted(path.name for path in tmp_path.iterdir()) == [
        "lsb.users",
        "options.json",
    ]
