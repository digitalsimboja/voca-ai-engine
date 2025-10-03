"""
Serialization utilities for Voca AI Engine.

This module provides data serialization and validation utilities.
"""

import json
from datetime import datetime, date
from typing import Any, Dict, List, Union
from decimal import Decimal


def serialize_datetime(obj: Any) -> str:
    """
    Serialize datetime objects to ISO format string.
    
    Args:
        obj: Object to serialize
        
    Returns:
        ISO formatted datetime string
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, date):
        return obj.isoformat()
    else:
        return str(obj)


def deserialize_datetime(datetime_str: str) -> datetime:
    """
    Deserialize ISO format string to datetime object.
    
    Args:
        datetime_str: ISO formatted datetime string
        
    Returns:
        datetime object
    """
    return datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))


def serialize_decimal(obj: Any) -> Union[str, float]:
    """
    Serialize Decimal objects to string or float.
    
    Args:
        obj: Object to serialize
        
    Returns:
        Serialized decimal value
    """
    if isinstance(obj, Decimal):
        return str(obj)
    return obj


def serialize_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize a dictionary, handling datetime and Decimal objects.
    
    Args:
        data: Dictionary to serialize
        
    Returns:
        Serialized dictionary
    """
    def _serialize_value(value: Any) -> Any:
        if isinstance(value, datetime):
            return serialize_datetime(value)
        elif isinstance(value, date):
            return serialize_datetime(value)
        elif isinstance(value, Decimal):
            return serialize_decimal(value)
        elif isinstance(value, dict):
            return serialize_dict(value)
        elif isinstance(value, list):
            return [_serialize_value(item) for item in value]
        else:
            return value
    
    return {key: _serialize_value(value) for key, value in data.items()}


def serialize_to_json(data: Any) -> str:
    """
    Serialize data to JSON string, handling datetime and Decimal objects.
    
    Args:
        data: Data to serialize
        
    Returns:
        JSON string
    """
    def _json_serializer(obj: Any) -> Any:
        if isinstance(obj, datetime):
            return serialize_datetime(obj)
        elif isinstance(obj, date):
            return serialize_datetime(obj)
        elif isinstance(obj, Decimal):
            return serialize_decimal(obj)
        else:
            return str(obj)
    
    return json.dumps(data, default=_json_serializer, indent=2)


def deserialize_from_json(json_str: str) -> Any:
    """
    Deserialize JSON string to Python object.
    
    Args:
        json_str: JSON string to deserialize
        
    Returns:
        Deserialized Python object
    """
    return json.loads(json_str)


def validate_required_fields(data: Dict[str, Any], required_fields: List[str]) -> List[str]:
    """
    Validate that required fields are present in data.
    
    Args:
        data: Data dictionary to validate
        required_fields: List of required field names
        
    Returns:
        List of missing field names
    """
    missing_fields = []
    
    for field in required_fields:
        if field not in data or data[field] is None:
            missing_fields.append(field)
    
    return missing_fields


def sanitize_data(data: Dict[str, Any], allowed_fields: List[str]) -> Dict[str, Any]:
    """
    Sanitize data by keeping only allowed fields.
    
    Args:
        data: Data dictionary to sanitize
        allowed_fields: List of allowed field names
        
    Returns:
        Sanitized dictionary with only allowed fields
    """
    return {key: value for key, value in data.items() if key in allowed_fields}
