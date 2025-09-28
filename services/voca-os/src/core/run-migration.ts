import { type UUID, type Plugin, stringToUuid } from "@elizaos/core";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

/**
 * Database migration configuration
 */
export interface DatabaseMigrationConfig {
  dataDir?: string;
  postgresUrl?: string;
  vendorId: string;
}

/**
 * Run database migrations to ensure tables exist before runtime initialization.
 * 
 * This function creates a temporary database adapter, runs migrations for all plugins
 * that have database schemas, and then cleans up the temporary adapter. This ensures
 * that when the actual runtime initializes, all necessary database tables already exist.
 * 
 * @param config - Database configuration including vendor ID and connection details
 * @param plugins - Array of plugins that have database schemas to migrate
 * @returns Promise that resolves when migrations are complete
 * 
 * @example
 * ```typescript
 * await runDatabaseMigrations({
 *   vendorId: 'my-vendor',
 *   dataDir: '/path/to/db',
 *   postgresUrl: 'postgresql://...'
 * }, [sqlPlugin, myCustomPlugin]);
 * ```
 */
export async function runDatabaseMigrations(
  config: DatabaseMigrationConfig,
  plugins: Plugin[]
): Promise<void> {
  try {
    console.log(`Running database migrations for vendor ${config.vendorId}...`);
    
    // Dynamically import the SQL plugin to avoid TypeScript compilation issues
    const sqlPlugin = await import("@elizaos/plugin-sql");
    
    // Create a temporary database adapter for migrations
    const tempAgentId = uuidv4() as UUID;
    const adapterConfig: { dataDir?: string; postgresUrl?: string } = {};
    
    if (config.dataDir) {
      adapterConfig.dataDir = config.dataDir;
    }
    if (config.postgresUrl) {
      adapterConfig.postgresUrl = config.postgresUrl;
    }
    
    const tempAdapter = (sqlPlugin as any).createDatabaseAdapter(adapterConfig, tempAgentId);

    // Initialize the temporary adapter
    await tempAdapter.init();

    // Get the database instance
    const db = (tempAdapter as any).db;
    if (!db) {
      console.warn("No database instance found, skipping migrations");
      return;
    }

    // Use DatabaseMigrationService to run migrations
    const migrationService = new (sqlPlugin as any).DatabaseMigrationService();
    await migrationService.initializeWithDatabase(db);
    
    // Use the same approach as the runtime - let the migration service discover schemas
    console.log(`Total plugins received: ${plugins.length}`);
  
    // Force register the SQL plugin schema explicitly since it's the core one
    if ((sqlPlugin as any).schema) {
      console.log(`Registering SQL plugin schema explicitly`);
      migrationService.registerSchema('@elizaos/plugin-sql', (sqlPlugin as any).schema);
    }
    
    // Let the migration service discover and register plugin schemas automatically
    migrationService.discoverAndRegisterPluginSchemas(plugins);
    
    // Run all migrations
    await migrationService.runAllPluginMigrations();
    
    console.log(`Database migrations completed for vendor ${config.vendorId}`);

    // Close the temporary adapter properly
    await tempAdapter.close();
    
  } catch (error: any) {
    console.error(`Failed to run database migrations for vendor ${config.vendorId}:`, error);
    // Don't throw here - let the runtime handle its own initialization
    console.warn("Continuing with runtime initialization despite migration failure");
  }
}

/**
 * Get database adapter configuration
 */
export function getDatabaseConfig(): { dataDir?: string; postgresUrl?: string } {
  const postgresUrl = process.env["POSTGRES_URL"] || process.env["DATABASE_URL"];
  
  if (postgresUrl) {
    return { postgresUrl };
  }
  
  const dataDir = path.join(process.cwd(), ".eliza", "databases");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return { dataDir };
}

/**
 * Create and initialize database adapter
 */
export async function createDatabaseAdapter(agentId: string): Promise<any> {
  // Dynamically import the SQL plugin to avoid TypeScript compilation issues
  const sqlPlugin = await import("@elizaos/plugin-sql");
  
  if (!(sqlPlugin as any).createDatabaseAdapter) {
    throw new Error("createDatabaseAdapter not found in plugin-sql");
  }

  const adapterConfig = getDatabaseConfig();
  const adapter = (sqlPlugin as any).createDatabaseAdapter(adapterConfig, stringToUuid(agentId));

  if (!adapter) {
    throw new Error("Failed to create database adapter");
  }
  
  return adapter;
}

/**
 * Check if error is related to vector extension
 */
function isVectorError(error: Error): boolean {
  const VECTOR_ERROR_PATTERNS: string[] = [
    'type "vector" does not exist',
    'extension "vector" is not available',
    'Failed to create table embeddings'
  ];
  
  return VECTOR_ERROR_PATTERNS.some(pattern => 
    error.message && error.message.includes(pattern)
  );
}

/**
 * Register plugin schemas for migration
 */
function registerPluginSchemas(migrationService: any, plugins: any[], sqlPlugin: any): void {
  // Register core SQL schema with embeddings (PostgreSQL with pgvector support)
  if (sqlPlugin.schema) {
    migrationService.registerSchema('@elizaos/plugin-sql', sqlPlugin.schema);
  } else {
    console.warn('No schema found in sqlPlugin, skipping explicit registration');
  }
  
  // Register custom plugin schemas explicitly
  registerCustomPluginSchemas(migrationService, plugins);
  
  // Discover and register plugin schemas (fallback for standard plugins)
  migrationService.discoverAndRegisterPluginSchemas(plugins);
}

/**
 * Register custom plugin schemas explicitly
 */
function registerCustomPluginSchemas(migrationService: any, plugins: any[]): void {
  plugins.forEach(plugin => {
    // Handle plugin instances (objects with schema property)
    if (typeof plugin === 'object' && plugin !== null) {
      const pluginName = plugin.name || plugin.constructor?.name || 'UnknownPlugin';
      
      if (plugin.schema) {
        console.log(`Registering custom plugin schema for: ${pluginName}`);
        migrationService.registerSchema(pluginName, plugin.schema);
      } else if (plugin.getSchema) {
        // Handle plugins with getSchema method
        const schema = plugin.getSchema();
        if (schema) {
          console.log(`Registering custom plugin schema via getSchema() for: ${pluginName}`);
          migrationService.registerSchema(pluginName, schema);
        }
      } else {
        console.log(`No schema found for custom plugin: ${pluginName}`);
      }
    }
    // String-based plugins are handled by discoverAndRegisterPluginSchemas
  });
}

/**
 * Run database migrations using the provided adapter
 */
export async function runMigrations(adapter: any, agentId: string, plugins: any[] = []): Promise<void> {
  try {
    console.log(`Running migrations for agent ${agentId}...`);
    
    // Dynamically import the SQL plugin to avoid TypeScript compilation issues
    const sqlPlugin = await import("@elizaos/plugin-sql");
    
    const migrationService = new (sqlPlugin as any).DatabaseMigrationService();
    await migrationService.initializeWithDatabase(adapter.db);
    
    registerPluginSchemas(migrationService, plugins, sqlPlugin);
    
    try {
      await migrationService.runAllPluginMigrations();
    } catch (migrationError: any) {
      if (isVectorError(migrationError)) {
        console.warn(`Vector extension not available, continuing without embeddings table for agent ${agentId}`);
      } else {
        console.error(`Migration error for agent ${agentId}:`, migrationError.message);
        throw migrationError;
      }
    }
  } catch (error: any) {
    console.error(`Error running migrations for agent ${agentId}:`, error);
    throw error;
  }
}
