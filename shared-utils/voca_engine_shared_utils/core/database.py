"""
Database connection and management for Voca AI Engine.

This module handles PostgreSQL connections and database operations.
"""

import logging
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager
import asyncpg
from asyncpg import Pool, Connection

from .config import get_settings

logger = logging.getLogger(__name__)


class Database:
    """Database connection manager."""
    
    def __init__(self):
        self.settings = get_settings()
        self.pool: Optional[Pool] = None
    
    async def connect(self) -> None:
        """Create database connection pool."""
        try:
            self.pool = await asyncpg.create_pool(
                self.settings.database_url,
                min_size=1,
                max_size=10,
                command_timeout=60,
                server_settings={
                    'jit': 'off'
                }
            )
            logger.info("Database connection pool created")
        except Exception as e:
            logger.error(f"Failed to create database pool: {e}")
            raise
    
    async def disconnect(self) -> None:
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")
    
    async def test_connection(self) -> bool:
        """Test database connection."""
        if not self.pool:
            await self.connect()
        
        try:
            async with self.pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            return True
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            raise
    
    @asynccontextmanager
    async def get_connection(self):
        """Get a database connection from the pool."""
        if not self.pool:
            await self.connect()
        
        async with self.pool.acquire() as conn:
            yield conn
    
    async def execute_query(self, query: str, *args) -> List[Dict[str, Any]]:
        """Execute a SELECT query and return results as list of dicts."""
        async with self.get_connection() as conn:
            rows = await conn.fetch(query, *args)
            return [dict(row) for row in rows]
    
    async def execute_one(self, query: str, *args) -> Optional[Dict[str, Any]]:
        """Execute a SELECT query and return first result as dict."""
        async with self.get_connection() as conn:
            row = await conn.fetchrow(query, *args)
            return dict(row) if row else None
    
    async def execute_command(self, query: str, *args) -> str:
        """Execute an INSERT/UPDATE/DELETE command and return status."""
        async with self.get_connection() as conn:
            return await conn.execute(query, *args)
    
    async def execute_transaction(self, queries: List[tuple]) -> List[Any]:
        """Execute multiple queries in a transaction."""
        async with self.get_connection() as conn:
            async with conn.transaction():
                results = []
                for query, args in queries:
                    if query.strip().upper().startswith('SELECT'):
                        result = await conn.fetch(query, *args)
                        results.append([dict(row) for row in result])
                    else:
                        result = await conn.execute(query, *args)
                        results.append(result)
                return results


# Global database instance
_database: Optional[Database] = None


def get_database() -> Database:
    """Get the global database instance."""
    global _database
    if _database is None:
        _database = Database()
    return _database


async def init_database():
    """Initialize the database connection."""
    db = get_database()
    await db.connect()


async def close_database():
    """Close the database connection."""
    db = get_database()
    await db.disconnect()
