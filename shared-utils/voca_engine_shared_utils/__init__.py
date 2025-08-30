"""
Voca AI Engine Shared Utils

This package contains shared utilities, logging, and core functionality
for the Voca AI Engine services.
"""

__version__ = "1.0.0"
__author__ = "Voca AI Team"

# Core modules
from .core.config import get_settings, Settings
from .core.database import get_database, Database
from .core.logger import setup_logging, get_logger, VocaLogger

# Utility modules
from .utils.response_helpers import success_response, error_response
from .utils.auth_helpers import verify_jwt_token, create_jwt_token
from .utils.serializer import serialize_datetime, deserialize_datetime

# Database models
from .db.models import BaseModel

__all__ = [
    # Core
    "get_settings",
    "Settings", 
    "get_database",
    "Database",
    "setup_logging",
    "get_logger",
    "VocaLogger",
    
    # Utils
    "success_response",
    "error_response", 
    "verify_jwt_token",
    "create_jwt_token",
    "serialize_datetime",
    "deserialize_datetime",
    
    # Models
    "BaseModel",
]
