# ==========================================
# Etapa 1: Compilación del frontend
# ==========================================
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend

# Instalar pnpm (versión definida en package.json)
RUN npm install -g pnpm@11.19.0

# Copiar configuración de dependencias para cachear capas
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml frontend/.npmrc ./

# Instalar dependencias
RUN pnpm install --frozen-lockfile

# Copiar el código fuente del frontend
COPY frontend/ ./

# Compilar frontend (genera frontend/dist)
RUN pnpm build

# ==========================================
# Etapa 2: Entorno de ejecución (Python + FastAPI)
# ==========================================
FROM python:3.12-slim AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    LIGHTWEIGHT_DB_PATH=/data/lightweight.db

# Instalar dependencias de Python
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar backend
COPY backend ./backend

# Copiar el frontend compilado desde la etapa 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Crear directorio para la base de datos persistente
RUN mkdir -p /data

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
