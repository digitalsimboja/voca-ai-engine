import { 
  Plugin, 
  IAgentRuntime, 
  EventType, 
  Action, 
  Evaluator, 
  Handler, 
  Validator, 
  ActionResult, 
  HandlerCallback,
  Memory,
  State,
  Content
} from '@elizaos/core';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect if the message is an order-related query
 */
function isOrderQuery(message: string): boolean {
  const orderKeywords = [
    'order status',
    'order number',
    'track order',
    'where is my order',
    'order tracking',
    'delivery status',
    'shipping status',
    'order #',
    'order id',
    'my order',
    'check order',
    'order update',
    'delivery update',
    'package status',
    'shipment status'
  ];

  return orderKeywords.some(keyword => message.includes(keyword));
}

/**
 * Extract order ID from user message
 */
function extractOrderId(message: string): string | null {
  // Look for patterns like "order #123", "order 123", "order number 123", etc.
  const patterns = [
    /order\s*#?\s*(\d+)/i,
    /order\s+number\s+(\d+)/i,
    /order\s+id\s+(\d+)/i,
    /track\s+order\s+(\d+)/i,
    /order\s+(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Fetch order data from database
 * TODO: Replace with actual database connection
 */
async function fetchOrderFromDatabase(orderId: string): Promise<any> {
  // This is a mock implementation
  // In production, you would connect to your actual orders database
  
  console.log(`🔍 Fetching order data for order ID: ${orderId}`);
  
  // Mock order data - replace with actual database query
  const mockOrders: Record<string, any> = {
    '123': {
      id: '123',
      order_number: 'ORD-001',
      status: 'shipped',
      customer_name: 'John Doe',
      customer_email: 'john@example.com',
      items: ['Product A', 'Product B'],
      created_at: '2024-01-15',
      shipped_at: '2024-01-16',
      tracking_number: 'TRK123456789',
      total_amount: 99.99
    },
    '456': {
      id: '456',
      order_number: 'ORD-002',
      status: 'processing',
      customer_name: 'Jane Smith',
      customer_email: 'jane@example.com',
      items: ['Product C'],
      created_at: '2024-01-18',
      total_amount: 49.99
    },
    '789': {
      id: '789',
      order_number: 'ORD-003',
      status: 'delivered',
      customer_name: 'Bob Johnson',
      customer_email: 'bob@example.com',
      items: ['Product D', 'Product E'],
      created_at: '2024-01-10',
      shipped_at: '2024-01-12',
      delivered_at: '2024-01-15',
      tracking_number: 'TRK987654321',
      total_amount: 149.99
    }
  };

  // Simulate database delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return mockOrders[orderId] || null;
}

/**
 * Format order response based on order status
 */
function formatOrderResponse(orderData: any): string {
  const { order_number, status, customer_name, items, created_at, shipped_at, delivered_at, tracking_number, total_amount } = orderData;
  
  let response = `Here's the status of your order #${order_number}:\n\n`;
  
  switch (status.toLowerCase()) {
    case 'processing':
      response += `📦 **Status**: Your order is being processed\n`;
      response += `📅 **Order Date**: ${created_at}\n`;
      response += `📋 **Items**: ${Array.isArray(items) ? items.join(', ') : items}\n`;
      response += `💰 **Total**: $${total_amount}\n\n`;
      response += `Your order is currently being prepared for shipment. You'll receive a tracking number once it ships.`;
      break;
      
    case 'shipped':
      response += `🚚 **Status**: Your order has been shipped!\n`;
      response += `📅 **Order Date**: ${created_at}\n`;
      response += `📋 **Items**: ${Array.isArray(items) ? items.join(', ') : items}\n`;
      response += `💰 **Total**: $${total_amount}\n`;
      response += `📦 **Tracking Number**: ${tracking_number}\n`;
      response += `🚚 **Shipped On**: ${shipped_at}\n\n`;
      response += `Your order is on its way! You can track it using the tracking number above.`;
      break;
      
    case 'delivered':
      response += `✅ **Status**: Your order has been delivered!\n`;
      response += `📅 **Order Date**: ${created_at}\n`;
      response += `📋 **Items**: ${Array.isArray(items) ? items.join(', ') : items}\n`;
      response += `💰 **Total**: $${total_amount}\n`;
      response += `📦 **Tracking Number**: ${tracking_number}\n`;
      response += `🏠 **Delivered On**: ${delivered_at}\n\n`;
      response += `Your order has been successfully delivered. Thank you for your business!`;
      break;
      
    default:
      response += `📦 **Status**: ${status}\n`;
      response += `📅 **Order Date**: ${created_at}\n`;
      response += `📋 **Items**: ${Array.isArray(items) ? items.join(', ') : items}\n`;
      response += `💰 **Total**: $${total_amount}\n`;
      if (tracking_number) {
        response += `📦 **Tracking Number**: ${tracking_number}\n`;
      }
      if (shipped_at) {
        response += `🚚 **Shipped On**: ${shipped_at}\n`;
      }
  }
  
  return response;
}

/**
 * Process the order query and fetch information from database
 */
async function processOrderQuery(userMessage: string, message: any): Promise<{
  response: string;
  summary: string;
  orderId: string | null;
  status: string | null;
} | null> {
  // Extract order ID from the message
  const orderId = extractOrderId(userMessage);
  
  if (!orderId) {
    return {
      response: "I'd be happy to help you check your order status! Could you please provide your order number?",
      summary: "Order ID not found in message",
      orderId: null,
      status: null
    };
  }

  // Query the orders database
  const orderData = await fetchOrderFromDatabase(orderId);
  
  if (!orderData) {
    return {
      response: `I couldn't find an order with number ${orderId}. Please double-check your order number or contact customer support if you need assistance.`,
      summary: `Order ${orderId} not found`,
      orderId: orderId,
      status: 'not_found'
    };
  }

  // Format the response based on order status
  const response = formatOrderResponse(orderData);
  
  return {
    response: response,
    summary: `Order ${orderId} status: ${orderData.status}`,
    orderId: orderId,
    status: orderData.status,
  };
}

/**
 * Get order-related keywords from message
 */
function getOrderKeywords(message: string): string[] {
  const keywords = [
    'order status', 'order number', 'track order', 'where is my order',
    'order tracking', 'delivery status', 'shipping status', 'order #',
    'order id', 'my order', 'check order', 'order update'
  ];
  
  return keywords.filter(keyword => message.toLowerCase().includes(keyword));
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Handler for CHECK_ORDER_STATUS action
 */
const checkOrderStatusHandler: Handler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State,
  options?: { [key: string]: unknown },
  callback?: HandlerCallback,
  responses?: Memory[]
): Promise<ActionResult> => {
  try {
    const messageText = message.content.text || '';
    const orderId = extractOrderId(messageText);
    
    if (!orderId) {
      return {
        success: false,
        text: "I'd be happy to help you check your order status! Could you please provide your order number?",
        error: "No order ID found in message"
      };
    }

    const orderData = await fetchOrderFromDatabase(orderId);
    
    if (!orderData) {
      return {
        success: false,
        text: `I couldn't find an order with number ${orderId}. Please double-check your order number.`,
        error: `Order ${orderId} not found`
      };
    }

    const response = formatOrderResponse(orderData);
    
    return {
      success: true,
      text: response,
      data: {
        orderId: orderData.id,
        status: orderData.status,
        orderData: orderData
      }
    };
  } catch (error: any) {
    return {
      success: false,
      text: "I'm sorry, I'm having trouble accessing your order information right now.",
      error: error.message
    };
  }
};

/**
 * Handler for SEARCH_ORDERS action
 */
const searchOrdersHandler: Handler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State,
  options?: { [key: string]: unknown },
  callback?: HandlerCallback,
  responses?: Memory[]
): Promise<ActionResult> => {
  try {
    // This would search for orders by customer ID or other criteria
    // For now, return a placeholder response
    return {
      success: true,
      text: "I'll search for your recent orders. This feature is coming soon!",
      data: {
        searchPerformed: true,
        message: "Order search functionality to be implemented"
      }
    };
  } catch (error: any) {
    return {
      success: false,
      text: "I'm sorry, I couldn't search for your orders right now.",
      error: error.message
    };
  }
};

// ============================================================================
// ACTION VALIDATORS
// ============================================================================

/**
 * Validator for CHECK_ORDER_STATUS action
 */
const checkOrderStatusValidator: Validator = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<boolean> => {
  const messageText = message.content.text || '';
  return isOrderQuery(messageText);
};

/**
 * Validator for SEARCH_ORDERS action
 */
const searchOrdersValidator: Validator = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<boolean> => {
  const messageText = message.content.text || '';
  const searchKeywords = ['my orders', 'order history', 'recent orders', 'find orders', 'search orders'];
  return searchKeywords.some(keyword => messageText.toLowerCase().includes(keyword));
};

// ============================================================================
// EVALUATOR HANDLERS
// ============================================================================

/**
 * Handler for ORDER_RESPONSE_VALIDATOR evaluator
 */
const orderResponseValidatorHandler: Handler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State,
  options?: { [key: string]: unknown },
  callback?: HandlerCallback,
  responses?: Memory[]
): Promise<ActionResult> => {
  try {
    // Validate that order responses contain proper information
    const responseText = message.content.text || '';
    
    // Check if response contains order-related information
    const hasOrderId = /\#?\d+/.test(responseText);
    const hasStatus = /status|shipped|delivered|processing/i.test(responseText);
    const hasTracking = /tracking|track/i.test(responseText);
    
    const isValid = hasOrderId && hasStatus;
    
    return {
      success: isValid,
      text: isValid ? "Order response is valid" : "Order response is missing required information",
      data: {
        hasOrderId,
        hasStatus,
        hasTracking,
        isValid
      }
    };
  } catch (error: any) {
    return {
      success: false,
      text: "Error validating order response",
      error: error.message
    };
  }
};

/**
 * Handler for ORDER_QUERY_DETECTOR evaluator
 */
const orderQueryDetectorHandler: Handler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State,
  options?: { [key: string]: unknown },
  callback?: HandlerCallback,
  responses?: Memory[]
): Promise<ActionResult> => {
  try {
    const messageText = message.content.text || '';
    const isOrderQueryResult = isOrderQuery(messageText);
    
    return {
      success: true,
      text: isOrderQueryResult ? "Order query detected" : "Not an order query",
      data: {
        isOrderQuery: isOrderQueryResult,
        detectedKeywords: getOrderKeywords(messageText)
      }
    };
  } catch (error: any) {
    return {
      success: false,
      text: "Error detecting order query",
      error: error.message
    };
  }
};

// ============================================================================
// EVALUATOR VALIDATORS
// ============================================================================

/**
 * Validator for ORDER_RESPONSE_VALIDATOR evaluator
 */
const orderResponseValidatorValidator: Validator = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<boolean> => {
  // Only run this evaluator on assistant responses about orders
  const messageText = message.content.text || '';
  return messageText.includes('order') || messageText.includes('Order');
};

/**
 * Validator for ORDER_QUERY_DETECTOR evaluator
 */
const orderQueryDetectorValidator: Validator = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<boolean> => {
  // Run this evaluator on all user messages
  return true;
};

/**
 * Order Management Plugin for Voca AI Engine
 */
export const orderPlugin: Plugin = {
  name: 'order-management-plugin',
  description: 'Handles order status queries and order management operations',
  priority: 50,

  init: async (config: Record<string, string>, runtime: IAgentRuntime): Promise<void> => {
    console.log('🛒 Order Management Plugin initialized');
  },

  actions: <Action[]>[
    {
      name: 'CHECK_ORDER_STATUS',
      similes: ['check order', 'order status', 'track order', 'order tracking'],
      description: 'Check the status of a customer order by order ID',
      examples: [
        [
          { name: 'user', content: { text: 'What is the status of order #123?' } as Content },
          { name: 'assistant', content: { text: 'Let me check the status of order #123 for you.' } as Content }
        ]
      ],
      handler: checkOrderStatusHandler,
      validate: checkOrderStatusValidator
    },
    {
      name: 'SEARCH_ORDERS',
      similes: ['find orders', 'search orders', 'my orders', 'order history'],
      description: 'Search for orders by customer ID or other criteria',
      examples: [
        [
          { name: 'user', content: { text: 'Show me all my recent orders' } as Content },
          { name: 'assistant', content: { text: 'I\'ll search for your recent orders.' } as Content }
        ]
      ],
      handler: searchOrdersHandler,
      validate: searchOrdersValidator
    }
  ],

  evaluators: <Evaluator[]>[
    {
      name: 'ORDER_RESPONSE_VALIDATOR',
      description: 'Validates that order responses contain accurate information',
      similes: ['order validator', 'order response check'],
      examples: [],
      handler: orderResponseValidatorHandler,
      validate: orderResponseValidatorValidator
    },
    {
      name: 'ORDER_QUERY_DETECTOR',
      description: 'Detects if a message is asking about orders',
      similes: ['order detector', 'order intent'],
      examples: [],
      handler: orderQueryDetectorHandler,
      validate: orderQueryDetectorValidator
    }
  ],

  // Event handlers typed properly
  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async ({
        message,
        runtime,
        state,
        callback
      }: {
        message: Memory;
        runtime: IAgentRuntime;
        state?: State;
        callback?: HandlerCallback;
      }): Promise<void> => {
        const userMessage = message.content?.text?.toLowerCase?.();
        if (!userMessage) return;

        if (isOrderQuery(userMessage)) {
          console.log('🛒 Detected order query:', userMessage);

          try {
            const orderInfo = await processOrderQuery(userMessage, message);
            if (orderInfo) {
              const response: Content = {
                text: orderInfo.response,
                thought: `Order query processed: ${orderInfo.summary}`,
                metadata: {
                  plugin: 'order-management-plugin',
                  orderId: orderInfo.orderId,
                  status: orderInfo.status,
                  timestamp: new Date().toISOString()
                }
              };
              if (callback) await callback(response);
            }
          } catch (error: any) {
            console.error('❌ Error processing order query:', error);
            const errorResponse: Content = {
              text: "I'm sorry, I'm having trouble accessing your order information right now. Please try again later or contact support.",
              thought: `Order query failed: ${error.message}`,
              metadata: {
                plugin: 'order-management-plugin',
                error: error.message,
                timestamp: new Date().toISOString()
              }
            };
            if (callback) await callback(errorResponse);
          }
        }
      }
    ]
  },

  config: {
    orderQueryKeywords: [
      'order status',
      'order number',
      'track order',
      'where is my order',
      'order tracking',
      'delivery status',
      'shipping status',
      'order #',
      'order id',
      'my order',
      'check order',
      'order update',
      'delivery update',
      'package status',
      'shipment status'
    ]
  },

  schema: {
    name: 'order_management_plugin',
    tables: [
      {
        name: 'orders',
        columns: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'order_number', type: 'VARCHAR(50)', unique: true },
          { name: 'customer_name', type: 'VARCHAR(255)' },
          { name: 'customer_email', type: 'VARCHAR(255)' },
          { name: 'customer_phone', type: 'VARCHAR(20)' },
          { name: 'delivery_address', type: 'TEXT' },
          { name: 'items', type: 'JSONB' },
          { name: 'total_amount', type: 'DECIMAL(10,2)' },
          { name: 'status', type: 'VARCHAR(50)' },
          { name: 'agent_id', type: 'UUID' },
          { name: 'catalog_id', type: 'UUID' },
          { name: 'store_id', type: 'UUID' },
          { name: 'owner_id', type: 'BIGINT' },
          { name: 'notes', type: 'TEXT' },
          { name: 'tracking_number', type: 'VARCHAR(100)' },
          { name: 'shipped_at', type: 'TIMESTAMP' },
          { name: 'delivered_at', type: 'TIMESTAMP' },
          { name: 'cancelled_at', type: 'TIMESTAMP' },
          { name: 'cancelled_reason', type: 'TEXT' },
          { name: 'metadata', type: 'JSONB' },
          { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
        ]
      }
    ]
  }
};

export default orderPlugin;
