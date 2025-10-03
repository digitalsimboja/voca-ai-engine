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
from .helpers.serializer import serialize_datetime, deserialize_datetime

from .clients.voca_service_client import voca_service_client

# Database models - TODO: Add when db models are created
# from .db.models import BaseModel

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
    "serialize_datetime",
    "deserialize_datetime",
    
    # Clients
    "voca_service_client",
]
