/**
 * VocaAI-Engine Client (Refactored SDK)
 * Provides type-safe methods for VocaAI-Engine service interaction
 */

import axios, { AxiosInstance, AxiosResponse } from "axios";

/* ---------- Generic Service Types ---------- */
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/* ---------- Order Types ---------- */
export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

export interface OrderData {
  id?: string;
  order_number?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  items: OrderItem[];
  total_amount: number;
  status: OrderStatus;
  store_id: string;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
}

/* ---------- Conversation Types ---------- */
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

export type MessageRole = "user" | "assistant" | "system";

export interface MessageData {
  id?: string;
  conversation_id: string;
  content: string;
  role: MessageRole;
  type: string;
  metadata?: Record<string, any>;
  user_id?: string;
  created_at?: string;
}

/* ---------- Client Class ---------- */
export class VocaEngineClient {
  private client: AxiosInstance;

  constructor(vendorId: string, vocaEngineUrl?: string) {
    if (!vendorId) {
      throw new Error("Vendor ID is required to initialize VocaEngineClient.");
    }

    const baseURL =
      vocaEngineUrl ||
      process.env["VOCA_AI_ENGINE_URL"] ||
      "http://voca-ai-engine:5008";

    this.client = axios.create({
      baseURL: `${baseURL}/voca-engine/api/v1`,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "VocaOS/1.0.0",
        "X-Vendor-ID": vendorId,
      },
    });

    // Interceptor for structured error logging
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error("VocaEngine API error:", {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        });
        throw error;
      }
    );
  }

  /* ---------- Internal service request ---------- */
  private async makeRequest<T>(
    service: string,
    action: string,
    data: object = {}
  ): Promise<ServiceResponse<T>> {
    try {
      const response: AxiosResponse<ServiceResponse<T>> =
        await this.client.post("/services/call", {
          service,
          action,
          data,
        });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        error: error.response?.data?.error || "Unknown error",
      };
    }
  }

  /* ---------- Order Methods ---------- */
  async getOrderById(orderId: string): Promise<OrderData | null> {
    const res = await this.makeRequest<{ order: OrderData }>(
      "order",
      "get_order_by_id",
      { order_id: orderId }
    );
    return res.success ? res.data?.order ?? null : null;
  }

  async getOrderByNumber(orderNumber: string): Promise<OrderData | null> {
    const res = await this.makeRequest<{ order: OrderData }>(
      "order",
      "get_order_by_number",
      { order_number: orderNumber }
    );
    return res.success ? res.data?.order ?? null : null;
  }

  async searchOrders(query: string, storeId?: string): Promise<OrderData[]> {
    const res = await this.makeRequest<{ orders: OrderData[] }>(
      "order",
      "search_orders",
      { query, store_id: storeId }
    );
    return res.success ? res.data?.orders ?? [] : [];
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    metadata?: Record<string, any>
  ): Promise<OrderData | null> {
    const res = await this.makeRequest<{ order: OrderData }>(
      "order",
      "update_order_status",
      { order_id: orderId, status, metadata }
    );
    return res.success ? res.data?.order ?? null : null;
  }

  async createOrder(orderData: OrderData): Promise<OrderData | null> {
    const res = await this.makeRequest<{ order: OrderData }>(
      "order",
      "create_order",
      orderData
    );
    return res.success ? res.data?.order ?? null : null;
  }

  /* ---------- Conversation Methods ---------- */
  async createConversation(
    data: Omit<ConversationData, "id" | "created_at" | "updated_at">
  ): Promise<ConversationData | null> {
    const res = await this.makeRequest<{ conversation: ConversationData }>(
      "conversation",
      "create_conversation",
      data
    );
    return res.success ? res.data?.conversation ?? null : null;
  }

  async getConversationById(conversationId: string): Promise<ConversationData | null> {
    const res = await this.makeRequest<{ conversation: ConversationData }>(
      "conversation",
      "get_conversation_by_id",
      { conversation_id: conversationId }
    );
    return res.success ? res.data?.conversation ?? null : null;
  }

  async addMessageToConversation(
    conversationId: string,
    message: Omit<MessageData, "id" | "created_at" | "conversation_id">
  ): Promise<MessageData | null> {
    const res = await this.makeRequest<{ message: MessageData }>(
      "conversation",
      "add_message",
      { conversation_id: conversationId, ...message }
    );
    return res.success ? res.data?.message ?? null : null;
  }

  async getConversationMessages(
    conversationId: string,
    limit = 50
  ): Promise<MessageData[]> {
    const res = await this.makeRequest<{ messages: MessageData[] }>(
      "conversation",
      "get_messages",
      { conversation_id: conversationId, limit }
    );
    return res.success ? res.data?.messages ?? [] : [];
  }

  /* ---------- Health Check ---------- */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.client.get("/services/call/health");
      return res.status === 200 && res.data.status === "healthy";
    } catch {
      return false;
    }
  }
}

/* ---------- Factory Function ---------- */
export function createVocaEngineClient(vendorId: string): VocaEngineClient {
  return new VocaEngineClient(vendorId);
}
