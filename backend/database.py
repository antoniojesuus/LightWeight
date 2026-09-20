"""Configuración de SQLite + SQLAlchemy + sesión de FastAPI."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# DB en la raíz del proyecto por defecto o en la ruta indicada por entorno (ej. volumen Fly.io)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.getenv("LIGHTWEIGHT_DB_PATH", os.path.join(BASE_DIR, "lightweight.db"))

# Asegurar que el directorio contenedor exista (ej. /data al montar un volumen persistente)
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
