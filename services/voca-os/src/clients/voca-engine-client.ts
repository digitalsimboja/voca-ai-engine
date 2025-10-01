/**
 * VocaAI-Engine Client for VocaOS
 * Handles communication with VocaAI-Engine service router
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';

export interface ServiceRequest {
  service: string;
  action: string;
  data: Record<string, any>;
}

export interface ServiceResponse {
  success: boolean;
  data?: Record<string, any>;
  message?: string;
  error?: string;
}

export interface OrderData {
  id?: string;
  order_number?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    price: number;
  }>;
  total_amount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  store_id: string;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ConversationData {
  id?: string;
  title: string;
  type: string;
  language: string;
  metadata?: Record<string, any>;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MessageData {
  id?: string;
  conversation_id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  type: string;
  metadata?: Record<string, any>;
  user_id?: string;
  created_at?: string;
}

export class VocaEngineClient {
  private client: AxiosInstance;
  private vendorApiKey: string;

  constructor(vendorApiKey: string, vocaEngineUrl?: string) {
    this.vendorApiKey = vendorApiKey;
    const baseURL = vocaEngineUrl || process.env['VOCA_AI_ENGINE_URL'] || 'http://voca-ai-engine:5008';
    
    this.client = axios.create({
      baseURL: `${baseURL}/voca-engine/api/v1`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vendorApiKey}`,
        'User-Agent': 'VocaOS/1.0.0'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('VocaEngine API error:', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        throw error;
      }
    );
  }

  private async makeServiceRequest(request: ServiceRequest): Promise<ServiceResponse> {
    try {
      const response: AxiosResponse<ServiceResponse> = await this.client.post('/service', request);
      return response.data;
    } catch (error: any) {
      console.error('Service request failed:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  // Order Service Methods
  async getOrderById(orderId: string): Promise<OrderData | null> {
    const response = await this.makeServiceRequest({
      service: 'order',
      action: 'get_order_by_id',
      data: { order_id: orderId }
    });

    if (response.success && response.data) {
      return response.data['order'];
    }
    return null;
  }

  async getOrderByNumber(orderNumber: string): Promise<OrderData | null> {
    const response = await this.makeServiceRequest({
      service: 'order',
      action: 'get_order_by_number',
      data: { order_number: orderNumber }
    });

    if (response.success && response.data) {
      return response.data['order'];
    }
    return null;
  }

  async searchOrders(query: string, storeId?: string): Promise<OrderData[]> {
    const response = await this.makeServiceRequest({
      service: 'order',
      action: 'search_orders',
      data: { query, store_id: storeId }
    });

    if (response.success && response.data) {
      return response.data['orders'] || [];
    }
    return [];
  }

  async updateOrderStatus(orderId: string, status: string, metadata?: Record<string, any>): Promise<OrderData | null> {
    const response = await this.makeServiceRequest({
      service: 'order',
      action: 'update_order_status',
      data: { order_id: orderId, status, metadata }
    });

    if (response.success && response.data) {
      return response.data['order'];
    }
    return null;
  }

  async createOrder(orderData: Partial<OrderData>): Promise<OrderData | null> {
    const response = await this.makeServiceRequest({
      service: 'order',
      action: 'create_order',
      data: orderData
    });

    if (response.success && response.data) {
      return response.data['order'];
    }
    return null;
  }

  // Conversation Service Methods
  async createConversation(conversationData: Partial<ConversationData>): Promise<ConversationData | null> {
    const response = await this.makeServiceRequest({
      service: 'conversation',
      action: 'create_conversation',
      data: conversationData
    });

    if (response.success && response.data) {
      return response.data['conversation'];
    }
    return null;
  }

  async getConversationById(conversationId: string): Promise<ConversationData | null> {
    const response = await this.makeServiceRequest({
      service: 'conversation',
      action: 'get_conversation_by_id',
      data: { conversation_id: conversationId }
    });

    if (response.success && response.data) {
      return response.data['conversation'];
    }
    return null;
  }

  async addMessageToConversation(
    conversationId: string,
    messageData: Partial<MessageData>
  ): Promise<MessageData | null> {
    const response = await this.makeServiceRequest({
      service: 'conversation',
      action: 'add_message',
      data: {
        conversation_id: conversationId,
        ...messageData
      }
    });

    if (response.success && response.data) {
      return response.data['message'];
    }
    return null;
  }

  async getConversationMessages(conversationId: string, limit: number = 50): Promise<MessageData[]> {
    const response = await this.makeServiceRequest({
      service: 'conversation',
      action: 'get_messages',
      data: { conversation_id: conversationId, limit }
    });

    if (response.success && response.data) {
      return response.data['messages'] || [];
    }
    return [];
  }

  // Health check
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/service/health');
      return response.status === 200 && response.data.success;
    } catch (error) {
      return false;
    }
  }
}

// Factory function to create client instance
export function createVocaEngineClient(vendorId: string): VocaEngineClient {
  // For now, we'll use a simple mapping - in production this would come from the VOCA_PRIVATE_KEY
  const vendorApiKeys: Record<string, string> = {
    'vendor-test': 'sk-voca-test-1234567890abcdef',
    'vendor-456': 'sk-voca-456-abcdef1234567890'
  };
  
  const vendorApiKey = vendorApiKeys[vendorId];
  
  if (!vendorApiKey) {
    throw new Error(`No API key found for vendor: ${vendorId}`);
  }

  return new VocaEngineClient(vendorApiKey);
}
