from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

import main
from api.v1 import reference_data
from config import Settings
from main import app


@pytest.mark.anyio
async def test_technical_lead_options_from_export(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Expose technical leads supplied by an external directory export."""
    export = tmp_path / "booking-options.json"
    export.write_text(
        '{"technical_leads":["Example Technical Lead One",'
        '"Example Technical Lead Équipe"]}',
        encoding="utf-8",
    )
    monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(export))
    monkeypatch.setattr(reference_data, "settings", Settings(_env_file=None))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/v1/booking-options")
    assert response.status_code == 200
    assert response.json() == {
        "cost_codes": [],
        "project_pis": [],
        "technical_leads": [
            "Example Technical Lead One",
            "Example Technical Lead Équipe",
        ],
    }


@pytest.mark.anyio
async def test_project_pi_options_from_export(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Expose PI suggestions supplied by an external directory export."""
    export = tmp_path / "booking-options.json"
    export.write_text('{"project_pis":["Dr Example PI One","Dr Example PI Two"]}')
    monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(export))
    monkeypatch.setattr(reference_data, "settings", Settings(_env_file=None))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/v1/booking-options")
    assert response.status_code == 200
    assert response.json() == {
        "cost_codes": [],
        "project_pis": ["Dr Example PI One", "Dr Example PI Two"],
        "technical_leads": [],
    }


@pytest.mark.anyio
@pytest.mark.parametrize("configured", [False, True])
async def test_booking_options_endpoint(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, configured: bool
) -> None:
    """Expose file suggestions publicly without requiring auth or a database."""
    monkeypatch.delenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", raising=False)
    if configured:
        export = tmp_path / "booking-options.json"
        export.write_text('{"cost_codes":["CC-001","CC-002"]}')
        monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(export))
    monkeypatch.setattr(reference_data, "settings", Settings(_env_file=None))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/v1/booking-options")
    assert response.status_code == 200
    assert response.json() == {
        "cost_codes": ["CC-001", "CC-002"] if configured else [],
        "project_pis": [],
        "technical_leads": [],
    }


@pytest.mark.anyio
async def test_lifespan_rejects_bad_booking_options(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Reject an explicitly configured missing file before accepting requests."""
    monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(tmp_path / "missing"))
    monkeypatch.setattr(main, "settings", Settings(_env_file=None))
    with pytest.raises(
        ValueError, match="Cannot read GPU_BOOKING_BOOKING_OPTIONS_FILE"
    ):
        async with main.lifespan(app):
            pytest.fail("Startup accepted a missing export")


@pytest.mark.anyio
async def test_health_endpoint() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "ok"}


@pytest.mark.anyio
async def test_greeting_endpoint_with_name() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/hello", params={"name": "Ada"})

    assert response.status_code == 200
    assert response.json() == {"message": "Hello, Ada from FastAPI!"}


@pytest.mark.anyio
async def test_greeting_endpoint_without_name() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/hello")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello, World from FastAPI!"}


@pytest.mark.anyio
async def test_lifespan_startup_invokes_init_db_and_seed_db(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    seeded_session: object | None = None

    class DummySession:
        pass

    class DummySessionContextManager:
        def __init__(self, session: DummySession) -> None:
            self.session = session

        async def __aenter__(self) -> DummySession:
            calls.append("session_enter")
            return self.session

        async def __aexit__(
            self,
            _exc_type: object,
            _exc: object,
            _tb: object,
        ) -> None:
            calls.append("session_exit")

    def fake_async_session_factory() -> DummySessionContextManager:
        calls.append("session_factory")
        return DummySessionContextManager(DummySession())

    async def fake_init_db() -> None:
        calls.append("init_db")

    async def fake_seed_db(session: object) -> None:
        nonlocal seeded_session
        calls.append("seed_db")
        seeded_session = session

    monkeypatch.setattr(main, "init_db", fake_init_db, raising=False)
    monkeypatch.setattr(
        main,
        "async_session_factory",
        fake_async_session_factory,
        raising=False,
    )
    monkeypatch.setattr(main, "seed_db", fake_seed_db, raising=False)

    async with main.lifespan(main.app):
        pass

    assert calls == [
        "init_db",
        "session_factory",
        "session_enter",
        "seed_db",
        "session_exit",
    ]
    assert seeded_session is not None
