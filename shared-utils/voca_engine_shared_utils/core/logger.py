"""
Shared logging utility for consistent logging across Voca AI Engine microservices
"""

import logging
import json
from typing import Any, Dict, Optional
from datetime import datetime


class VocaLogger:
    """
    Custom logger for Voca AI Engine microservices with structured logging
    """
    
    def __init__(self, service_name: str, log_level: str = "INFO"):
        """
        Initialize the logger
        
        Args:
            service_name: Name of the microservice
            log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        """
        self.service_name = service_name
        self.logger = logging.getLogger(service_name)
        self.logger.setLevel(getattr(logging, log_level.upper()))
        
        # Prevent duplicate handlers
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
    
    def _log(self, level: str, message: str, **kwargs):
        """
        Internal logging method with structured data
        
        Args:
            level: Log level
            message: Log message
            **kwargs: Additional structured data
        """
        log_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'service': self.service_name,
            'level': level,
            'message': message,
            **kwargs
        }
        
        log_message = json.dumps(log_data)
        getattr(self.logger, level.lower())(log_message)
    
    def info(self, message: str, **kwargs):
        """Log info message"""
        self._log('INFO', message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message"""
        self._log('WARNING', message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log error message"""
        self._log('ERROR', message, **kwargs)
    
    def debug(self, message: str, **kwargs):
        """Log debug message"""
        self._log('DEBUG', message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        """Log critical message"""
        self._log('CRITICAL', message, **kwargs)
    
    def log_request(self, method: str, path: str, user_id: Optional[str] = None, **kwargs):
        """
        Log incoming request
        
        Args:
            method: HTTP method
            path: Request path
            user_id: Optional user ID
            **kwargs: Additional request data
        """
        self.info(
            "Incoming request",
            method=method,
            path=path,
            user_id=user_id,
            **kwargs
        )
    
    def log_response(self, method: str, path: str, status_code: int, response_time: float, **kwargs):
        """
        Log outgoing response
        
        Args:
            method: HTTP method
            path: Request path
            status_code: HTTP status code
            response_time: Response time in seconds
            **kwargs: Additional response data
        """
        self.info(
            "Outgoing response",
            method=method,
            path=path,
            status_code=status_code,
            response_time=response_time,
            **kwargs
        )
    
    def log_error(self, error: Exception, context: Optional[Dict[str, Any]] = None):
        """
        Log error with context
        
        Args:
            error: Exception object
            context: Optional context data
        """
        import traceback
        
        error_data = {
            'error_type': type(error).__name__,
            'error_message': str(error),
            'error_traceback': ''.join(traceback.format_exception(type(error), error, error.__traceback__))
        }
        
        if context:
            # Filter out non-serializable objects from context
            serializable_context = {}
            for key, value in context.items():
                try:
                    json.dumps({key: value})
                    serializable_context[key] = value
                except (TypeError, ValueError):
                    serializable_context[key] = str(value)
            error_data.update(serializable_context)
        
        self.error("Exception occurred", **error_data)


def get_logger(service_name: str) -> VocaLogger:
    """
    Get a logger instance for a service
    
    Args:
        service_name: Name of the microservice
        
    Returns:
        VocaLogger instance
    """
    return VocaLogger(service_name)


def setup_logging(service_name: str, log_level: str = "INFO"):
    """
    Setup logging for the service
    
    Args:
        service_name: Name of the microservice
        log_level: Logging level
    """
    logger = get_logger(service_name)
    logger.info(f"Logging initialized for {service_name}", log_level=log_level)
    return logger
