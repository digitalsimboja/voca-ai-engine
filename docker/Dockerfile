# Voca AI Engine - Main FastAPI Application
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt


# Copy shared utils first and install
COPY shared-utils/ ./shared-utils/
RUN cd shared-utils && pip install -e .

# Copy application code
COPY app/ ./app/
COPY api/ ./api/

# Set environment variables
ENV PYTHONPATH=/app

# Create non-root user
RUN useradd --create-home --shell /bin/bash voca
RUN chown -R voca:voca /app
USER voca

# Expose port (will be set by environment variable)
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:$PORT/voca-engine/api/v1/health || exit 1

# Start FastAPI application
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT"]
