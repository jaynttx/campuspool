"""SQLAlchemy engine and session. PostgreSQL is required for the real app."""

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine, _factory
    if settings.database_url is None:
        raise RuntimeError("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.")
    if _engine is None:
        if settings.database_url.startswith("sqlite"):
            from sqlalchemy.pool import StaticPool

            # SQLite is used only by the automated tests.
            _engine = create_engine(settings.database_url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
        else:
            # Hosted databases such as Neon close idle connections; check and recycle them.
            _engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=300, pool_size=5, max_overflow=5)
        _factory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    return _engine


def session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _factory is not None
    return _factory


def get_db() -> Iterator[Session]:
    db = session_factory()()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables that do not exist yet. (No migrations tool is set up; see README.)"""
    from . import models  # noqa: F401  (registers the tables)

    if settings.auto_create_tables:
        engine = get_engine()
        Base.metadata.create_all(engine)
        _add_missing_columns(engine)


def check_database() -> str:
    """Return 'not_configured', 'ok' or 'unreachable'."""
    if settings.database_url is None:
        return "not_configured"
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "unreachable"


_NEW_COLUMNS = [
    ("messages", "image_file", "VARCHAR(120)"),
    ("messages", "image_mime", "VARCHAR(20)"),
    ("messages", "e2ee", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "e2ee_public_key", "TEXT"),
    ("users", "e2ee_wrapped_key", "TEXT"),
    ("users", "e2ee_updated_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "e2ee_recovery", "TEXT"),
    ("rides", "src_lat", "DOUBLE PRECISION"),
    ("rides", "src_lng", "DOUBLE PRECISION"),
    ("rides", "dst_lat", "DOUBLE PRECISION"),
    ("rides", "dst_lng", "DOUBLE PRECISION"),
    ("rides", "series_id", "VARCHAR(24)"),
    ("reports", "evidence", "TEXT"),
]


def _add_missing_columns(engine: Engine) -> None:
    """Development convenience: create_all never alters existing tables, so add columns introduced later.
    Production uses Alembic instead."""
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for table, column, ddl in _NEW_COLUMNS:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}"))
