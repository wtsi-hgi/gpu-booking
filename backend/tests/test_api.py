import pytest
from httpx import ASGITransport, AsyncClient

import main
from main import app


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
