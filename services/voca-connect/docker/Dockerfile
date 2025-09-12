# Voca Connect - AWS Connect Service
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

# Create directories
RUN mkdir -p /app/config /app/lambda /app/logs

# Copy configuration
COPY config/voca-connect/ ./config/
COPY lambda-functions/ ./lambda/

# Copy service code
COPY services/voca-connect/ ./

# Set environment variables
ENV PYTHONPATH=/app
ENV PORT=8001

# Create non-root user
RUN useradd --create-home --shell /bin/bash voca
RUN chown -R voca:voca /app
USER voca

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Start Voca Connect service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
