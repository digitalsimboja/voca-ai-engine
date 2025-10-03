"""
Configuration management for Voca AI Engine.

This module handles all environment variables and application settings.
"""
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings
from pydantic import field_validator
class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application settings
    app_env: str = "development"
    debug: bool = True
    log_level: str = "info"
    port: int = 8008
    
    # CORS settings
    cors_origin: str = "*"
    
    # Service URLs
    voca_os_url: str = "http://localhost:5001"
    voca_connect_url: str = "http://localhost:5002"
    vocaai_order_url: str = "http://localhost:8001"
    vocaai_conversation_url: str = "http://localhost:8002"
    vocaai_agent_url: str = "http://localhost:8012"
    vocaai_user_url: str = "http://localhost:8002"
    
    @property
    def cors_origins(self) -> List[str]:
        """Convert cors_origin string to list for FastAPI CORS middleware."""
        if self.cors_origin == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origin.split(",")]
    
    class Config:
        env_file = ".env"
        case_sensitive = False

@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
