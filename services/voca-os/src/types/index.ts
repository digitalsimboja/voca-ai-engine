import { Request, Response } from 'express';
import { AgentRuntime, Character } from '@elizaos/core';

// Core Types
export interface VendorDetails {
  vendorId: string;
  agentConfig: AgentConfig;
  agentId: string;
  registeredAt: string;
}

export interface AgentConfig {
  profile: Profile;
  customerService?: CustomerService;
  aiCapabilities?: AICapabilities;
  socialMedia?: SocialMedia;
  orderManagement?: OrderManagement;
  integrations?: Integrations;
}

export interface Profile {
  name: string;
  role?: string;
  bio?: string;
  description?: string;
}

export interface CustomerService {
  hours?: string;
  responseTime?: string;
  languages?: string[];
}

export interface AICapabilities {
  customerInquiries?: boolean;
  orderTracking?: boolean;
  productRecommendations?: boolean;
  deliveryUpdates?: boolean;
  socialMediaEngagement?: boolean;
  inventoryAlerts?: boolean;
}

export interface SocialMedia {
  platforms?: {
    [key: string]: {
      enabled: boolean;
      handle?: string;
      page?: string;
      username?: string;
    };
  };
  contentTypes?: string[];
}

export interface OrderManagement {
  trackingEnabled?: boolean;
  deliveryPartners?: string[];
  orderStatuses?: string[];
}

export interface Integrations {
  payment?: {
    enabled: boolean;
    gateways?: string[];
  };
  delivery?: {
    enabled: boolean;
    services?: string[];
  };
}

// Runtime Types
export interface AgentRuntimeInfo {
  id: string;
  runtime: AgentRuntime;
}

// VocaOS Character extends ElizaOS Character with additional vendor-specific properties
export interface VocaCharacter extends Character {
  // Additional vendor-specific properties
  clients: string[];
  modelProvider: string;
  lore: string[];
  configuration: AgentConfig;
}

// Pool Types
export interface PoolMetrics {
  messageCount: number;
  responseTime: number;
  errorCount: number;
  vendorCount: number;
  characterSwitches: number;
}

export interface RuntimeMetrics {
  totalAgents: number;
  messageCount: number;
  averageResponseTime: number;
  errorCount: number;
}

// API Types
export interface MessageRequest {
  vendor_id: string;
  message: string;
  platform?: string;
  user_id?: string;
}

export interface MessageResponse {
  poolId: string;
  vendor_id: string;
  platform: string;
  user_id: string;
  message: string;
  response: string;
  timestamp: string;
  character: string;
  mode: string;
  elizaos_status?: any;
  processing_time?: number;
  error?: string;
}

export interface VendorRegistrationRequest {
  vendor_id: string;
  agent_config: AgentConfig;
}

export interface VendorRegistrationResponse {
  poolId: string;
  vendorId: string;
  agent_id: string;
  status: string;
  config: AgentConfig;
  character_path: string;
  registered_at: string;
}

// Express Handler Types
export type ExpressHandler = (req: Request, res: Response) => Promise<void>;
export type ExpressHandlerWithRuntime = (req: Request, res: Response, runtime?: any) => Promise<void>;

// Database Types
export interface DatabaseConfig {
  postgresUrl?: string;
  dataDir?: string;
}

// Plugin Types
export interface PluginSchema {
  name: string;
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      primaryKey?: boolean;
    }>;
  }>;
}

// Error Types
export interface VocaOSError extends Error {
  code?: string;
  statusCode?: number;
  details?: any;
}
