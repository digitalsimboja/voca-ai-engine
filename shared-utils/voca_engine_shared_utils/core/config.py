"""
Configuration management for Voca AI Engine.

This module handles all environment variables and application settings.
"""

import os
from typing import List, Optional
from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import validator


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application settings
    app_env: str = "development"
    debug: bool = True
    log_level: str = "info"
    port: int = 8008
    
    # Database settings
    database_url: str
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "voca_ai_db"
    postgres_user: str = "voca_user"
    postgres_password: str = "voca_password"
    
    # JWT settings
    jwt_secret: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    
    # AWS settings
    aws_region: str
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_default_region: str
    s3_character_bucket: str = "voca-ai-character-store"
    
    # Service URLs
    voca_os_url: str = "http://voca-os:3001"
    voca_connect_url: str = "http://voca-connect:8001"
    
    # AWS Connect settings
    webhook_secret: str
    connect_instance_alias_prefix: str = "voca-connect"
    lambda_function_prefix: str = "voca-lambda"
    
    # CORS settings
    cors_origin: str = "*"
    
    @validator("cors_origin")
    def parse_cors_origins(cls, v):
        """Parse CORS origins from string to list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v
    
    @property
    def cors_origins(self) -> List[str]:
        """Get CORS origins as a list."""
        if isinstance(self.cors_origin, str):
            return [origin.strip() for origin in self.cors_origin.split(",")]
        return self.cors_origin
    
    @validator("database_url", pre=True)
    def build_database_url(cls, v, values):
        """Build database URL if not provided."""
        if v:
            return v
        
        # Build from individual components
        user = values.get("postgres_user", "voca_user")
        password = values.get("postgres_password", "voca_password")
        host = values.get("postgres_host", "postgres")
        port = values.get("postgres_port", 5432)
        db = values.get("postgres_db", "voca_ai_db")
        
        return f"postgresql://{user}:{password}@{host}:{port}/{db}"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
