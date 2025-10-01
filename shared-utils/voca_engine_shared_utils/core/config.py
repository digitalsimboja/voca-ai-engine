"""
Configuration management for Voca AI Engine.

This module handles all environment variables and application settings.
"""
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
    # Service URLs
    voca_os_url: str = "http://localhost:5001"
    voca_connect_url: str = "http://localhost:5002"
    vocaai_order_url: str = "http://localhost:8001"
    vocaai_conversation_url: str = "http://localhost:8002"
    vocaai_agent_url: str = "http://localhost:8012"
    class Config:
        env_file = ".env"
        case_sensitive = False

@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
