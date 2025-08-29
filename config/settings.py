"""
Voca AI Engine Settings Configuration
"""

import os
from typing import List, Optional
from pydantic import BaseSettings, validator
from pydantic_settings import BaseSettings as PydanticBaseSettings


class Settings(PydanticBaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "Voca AI Engine"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8008
    
    # Database
    DATABASE_URL: str = "postgresql://voca_user:voca_password@localhost:5432/voca_ai_db"
    
    # AWS Configuration
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_DEFAULT_REGION: str = "us-east-1"
    AWS_CONNECT_INSTANCE_ALIAS: str = "voca-ai-connect"
    
    # ElizaOS Configuration
    ELIZAOS_API_KEY: Optional[str] = None
    ELIZAOS_WORKSPACE: str = "/app/elizaos"
    ELIZAOS_BASE_URL: str = "https://api.elizaos.com"
    
    # Social Media API Keys
    WHATSAPP_API_KEY: Optional[str] = None
    INSTAGRAM_API_KEY: Optional[str] = None
    TWITTER_API_KEY: Optional[str] = None
    FACEBOOK_API_KEY: Optional[str] = None
    
    # Security
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 30
    WEBHOOK_SECRET: Optional[str] = None
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["*"]
    ALLOWED_HOSTS: List[str] = ["*"]
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60
    
    # Service URLs
    VOCA_AI_ENGINE_URL: str = "http://localhost:8008"
    CONNECT_WEBHOOK_URL: str = "http://localhost:8001"
    SOCIAL_WEBHOOK_URL: str = "http://localhost:8002"
    
    # File Storage
    S3_BUCKET_NAME: str = "voca-ai-storage"
    S3_REGION: str = "us-east-1"
    
    # Email Configuration
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    
    # Monitoring
    PROMETHEUS_ENABLED: bool = False
    
    @validator("ALLOWED_ORIGINS", pre=True)
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v
    
    @validator("ALLOWED_HOSTS", pre=True)
    def parse_allowed_hosts(cls, v):
        if isinstance(v, str):
            return [host.strip() for host in v.split(",")]
        return v
    
    @validator("DEBUG")
    def validate_debug(cls, v):
        if os.getenv("ENVIRONMENT") == "production" and v:
            return False
        return v
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get settings instance"""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# Export settings for easy access
settings = get_settings()
