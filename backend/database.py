"""Configuración de Base de Datos + SQLAlchemy + sesión de FastAPI."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

raw_url = os.getenv("DATABASE_URL")

if raw_url:
    # Soporte para Render / Neon / Supabase URLs que usan 'postgres://' (SQLAlchemy 2.0 requiere 'postgresql://')
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql://", 1)
    DATABASE_URL = raw_url
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    # DB local SQLite por defecto
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DB_PATH = os.getenv("LIGHTWEIGHT_DB_PATH", os.path.join(BASE_DIR, "lightweight.db"))
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
