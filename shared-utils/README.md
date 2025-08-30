# Voca AI Engine Shared Utils

This package contains shared utilities, logging, and core functionality for the Voca AI Engine services.

## Structure

```
shared-utils/
├── voca_engine_shared_utils/
│   ├── __init__.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── database.py
│   │   └── logger.py
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── auth_helpers.py
│   │   ├── response_helpers.py
│   │   └── serializer.py
│   └── db/
│       ├── __init__.py
│       └── models.py
├── setup.py
├── pyproject.toml
└── requirements.txt
```

## Installation

```bash
cd shared-utils
pip install -e .
```

## Usage

```python
from voca_engine_shared_utils.core.config import get_settings
from voca_engine_shared_utils.core.logger import setup_logging
from voca_engine_shared_utils.utils.response_helpers import success_response, error_response
```

## Features

- **Configuration Management**: Centralized settings with environment variable support
- **Database Utilities**: Connection pooling and query helpers
- **Logging**: Structured logging with JSON formatting
- **Authentication**: JWT and API key utilities
- **Response Helpers**: Standardized API response formatting
- **Serialization**: Data serialization and validation utilities
