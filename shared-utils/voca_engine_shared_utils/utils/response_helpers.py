"""
Response helper utilities for Voca AI Engine.

This module provides standardized response formatting functions.
"""

from datetime import datetime
from typing import Any, Dict, Optional, Union
from fastapi.responses import JSONResponse


def success_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200,
    **kwargs
) -> Dict[str, Any]:
    """
    Create a standardized success response.
    
    Args:
        data: Response data
        message: Success message
        status_code: HTTP status code
        **kwargs: Additional fields to include
        
    Returns:
        Standardized success response dictionary
    """
    response = {
        "status": "success",
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if data is not None:
        response["data"] = data
    
    # Add any additional fields
    response.update(kwargs)
    
    return response


def error_response(
    message: str = "An error occurred",
    status_code: int = 500,
    error_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Create a standardized error response.
    
    Args:
        message: Error message
        status_code: HTTP status code
        error_code: Custom error code
        details: Additional error details
        **kwargs: Additional fields to include
        
    Returns:
        Standardized error response dictionary
    """
    response = {
        "status": "error",
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if error_code:
        response["error_code"] = error_code
    
    if details:
        response["details"] = details
    
    # Add any additional fields
    response.update(kwargs)
    
    return response


def create_json_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200,
    **kwargs
) -> JSONResponse:
    """
    Create a FastAPI JSONResponse with standardized format.
    
    Args:
        data: Response data
        message: Response message
        status_code: HTTP status code
        **kwargs: Additional fields to include
        
    Returns:
        FastAPI JSONResponse
    """
    response_data = success_response(data, message, status_code, **kwargs)
    return JSONResponse(content=response_data, status_code=status_code)


def create_error_json_response(
    message: str = "An error occurred",
    status_code: int = 500,
    error_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    **kwargs
) -> JSONResponse:
    """
    Create a FastAPI JSONResponse for errors with standardized format.
    
    Args:
        message: Error message
        status_code: HTTP status code
        error_code: Custom error code
        details: Additional error details
        **kwargs: Additional fields to include
        
    Returns:
        FastAPI JSONResponse
    """
    response_data = error_response(message, status_code, error_code, details, **kwargs)
    return JSONResponse(content=response_data, status_code=status_code)
