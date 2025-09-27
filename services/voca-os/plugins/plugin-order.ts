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
  Content,
  ModelType,
} from "@elizaos/core";
import { pgTable, uuid, varchar, text, jsonb, decimal, timestamp, bigint } from "drizzle-orm/pg-core";


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect if the message is an order-related query
 */
function isOrderQuery(message: string): boolean {
  const orderKeywords = [
    "order status",
    "order number",
    "track order",
    "where is my order",
    "order tracking",
    "delivery status",
    "shipping status",
    "order #",
    "order id",
    "my order",
    "check order",
    "order update",
    "delivery update",
    "package status",
    "shipment status",
  ];

  return orderKeywords.some((keyword) => message.includes(keyword));
}

/**
 * Extract order ID from user message
 */
function extractOrderId(message: string): string | null {
  const patterns = [
    /order\s*#?\s*(\d+)/i,
    /order\s+number\s+(\d+)/i,
    /order\s+id\s+(\d+)/i,
    /track\s+order\s+(\d+)/i,
    /order\s+(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1] as string;
    }
  }

  return null;
}

/**
 * Fetch order data from database
 * TODO: Replace with actual database connection
 */
async function fetchOrderFromDatabase(orderId: string): Promise<any> {
  console.log(` Fetching order data for order ID: ${orderId}`);

  const mockOrders: Record<string, any> = {
    "123": {
      id: "123",
      order_number: "ORD-001",
      status: "shipped",
      customer_name: "John Doe",
      customer_email: "john@example.com",
      items: ["Product A", "Product B"],
      created_at: "2024-01-15",
      shipped_at: "2024-01-16",
      tracking_number: "TRK123456789",
      total_amount: 99.99,
    },
    "456": {
      id: "456",
      order_number: "ORD-002",
      status: "processing",
      customer_name: "Jane Smith",
      customer_email: "jane@example.com",
      items: ["Product C"],
      created_at: "2024-01-18",
      total_amount: 49.99,
    },
    "789": {
      id: "789",
      order_number: "ORD-003",
      status: "delivered",
      customer_name: "Bob Johnson",
      customer_email: "bob@example.com",
      items: ["Product D", "Product E"],
      created_at: "2024-01-10",
      shipped_at: "2024-01-12",
      delivered_at: "2024-01-15",
      tracking_number: "TRK987654321",
      total_amount: 149.99,
    },
  };

  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockOrders[orderId] || null;
}

/**
 * Format order response based on order status (raw human-readable)
 */
function formatOrderResponse(orderData: any): string {
  const {
    order_number,
    status,
    items,
    created_at,
    shipped_at,
    delivered_at,
    tracking_number,
    total_amount,
  } = orderData;

  let response = `Here's the status of your order #${order_number}:\n\n`;

  switch ((status || "").toLowerCase()) {
    case "processing":
      response += ` Status: Processing\n`;
      response += ` Order Date: ${created_at}\n`;
      response += ` Items: ${
        Array.isArray(items) ? items.join(", ") : items
      }\n`;
      response += ` Total: $${total_amount}\n\n`;
      response += `Your order is being prepared for shipment.`;
      break;

    case "shipped":
      response += ` Status: Shipped\n`;
      response += ` Order Date: ${created_at}\n`;
      response += ` Items: ${
        Array.isArray(items) ? items.join(", ") : items
      }\n`;
      response += ` Total: $${total_amount}\n`;
      response += ` Tracking Number: ${tracking_number}\n`;
      response += ` Shipped On: ${shipped_at}\n\n`;
      response += `Your order is on its way.`;
      break;

    case "delivered":
      response += ` Status: Delivered\n`;
      response += ` Order Date: ${created_at}\n`;
      response += ` Items: ${
        Array.isArray(items) ? items.join(", ") : items
      }\n`;
      response += ` Total: $${total_amount}\n`;
      response += ` Tracking Number: ${tracking_number}\n`;
      response += ` Delivered On: ${delivered_at}\n\n`;
      response += `Your order has been delivered.`;
      break;

    default:
      response += ` Status: ${status}\n`;
      response += ` Order Date: ${created_at}\n`;
      response += ` Items: ${
        Array.isArray(items) ? items.join(", ") : items
      }\n`;
      response += ` Total: $${total_amount}\n`;
      if (tracking_number) response += ` Tracking Number: ${tracking_number}\n`;
      if (shipped_at) response += ` Shipped On: ${shipped_at}\n`;
  }

  return response;
}

/**
 * Process order query (helper for event)
 */
async function processOrderQuery(
  userMessage: string,
  message: Memory
): Promise<{
  response: string;
  summary: string;
  orderId: string | null;
  status: string | null;
} | null> {
  const orderId = extractOrderId(userMessage);

  if (!orderId) {
    return {
      response: "Please provide your order number so I can look it up.",
      summary: "Order ID not found",
      orderId: null,
      status: null,
    };
  }

  const orderData = await fetchOrderFromDatabase(orderId);
  if (!orderData) {
    return {
      response: `No order found with number ${orderId}.`,
      summary: `Order ${orderId} not found`,
      orderId: orderId,
      status: "not_found",
    };
  }

  const response = formatOrderResponse(orderData);
  return {
    response,
    summary: `Order ${orderId} status: ${orderData.status}`,
    orderId,
    status: orderData.status,
  };
}

/**
 * Get order-related keywords from message
 */
function getOrderKeywords(message: string): string[] {
  const keywords = [
    "order status",
    "order number",
    "track order",
    "where is my order",
    "order tracking",
    "delivery status",
    "shipping status",
    "order #",
    "order id",
    "my order",
    "check order",
    "order update",
  ];

  return keywords.filter((keyword) => message.toLowerCase().includes(keyword));
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

const checkOrderStatusHandler: Handler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State,
  options?: { [key: string]: unknown },
  callback?: HandlerCallback,
  responses?: Memory[]
): Promise<ActionResult> => {
  try {
    const messageText = (message?.content?.text as string) || "";
    const orderId = extractOrderId(messageText);

    if (!orderId) {
      return {
        success: false,
        text: "Please provide your order number so I can look it up.",
        error: "No order ID found in message",
      };
    }

    // NOTE: replace with real DB query in production
    const orderData = await fetchOrderFromDatabase(orderId);
    if (!orderData) {
      return {
        success: false,
        text: `No order found with number ${orderId}.`,
        error: `Order ${orderId} not found`,
      };
    }

    // Raw human-readable text from DB
    const rawResponse = formatOrderResponse(orderData);

    // ------------------------
    // Use runtime.composeState to build context for the model
    // ------------------------
    // include conversation & memories to provide context (adjust as needed)
    const fullState: State = await runtime
      .composeState(message, ["conversation", "memories"])
      .catch(() => ({} as State));

    // ------------------------
    // Call the registered model (e.g. google-genai) via runtime.useModel
    // Model name "generateText" must match how the genai plugin registers its model
    // ------------------------
    let finalText = rawResponse;
    try {
      const aiResultAny: any = await runtime.useModel(ModelType.TEXT_LARGE, {
        state: fullState,
        prompt: `User asked about order ${orderId}. Rewrite this raw status into a concise, polite, customer-facing message.\n\nRaw status:\n${rawResponse}`,
        temperature: 0.7,
        maxTokens: 500,
      });

      // model result shape may vary; try common fields defensively
      if (aiResultAny) {
        finalText =
          aiResultAny.output ??
          aiResultAny.text ??
          aiResultAny.result ??
          aiResultAny;
        if (typeof finalText !== "string") {
          // attempt to stringify if model returned structured output
          try {
            finalText = JSON.stringify(finalText);
          } catch {
            finalText = rawResponse;
          }
        }
      }
    } catch (genErr: any) {
      // If the model call fails, fallback to rawResponse (don't crash)
      runtime.logger?.warn?.(
        "Order plugin: model generation failed, falling back to raw response",
        genErr?.message ?? genErr
      );
      finalText = rawResponse;
    }

    // If the handler was invoked with callback style, provide content via callback
    const content: Content = {
      text: finalText,
      metadata: {
        plugin: "order-management-plugin",
        orderId,
        status: orderData.status,
      },
    };

    if (callback) {
      try {
        await callback(content);
      } catch (cbErr) {
        // ignore callback send errors here; still return action result
        runtime.logger?.error?.("Order plugin: callback failed", cbErr);
      }
    }

    return {
      success: true,
      text: finalText,
      data: { orderId, status: orderData.status, orderData },
    };
  } catch (error: any) {
    return {
      success: false,
      text: "Error accessing order info.",
      error: error.message,
    };
  }
};

/**
 * Handler for SEARCH_ORDERS action
 * (keeps behavior simple but returns AI-polished placeholder text)
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
    const messageText = (message?.content?.text as string) || "";
    // Placeholder implementation: in real world, you'd query the DB for user's orders
    const placeholder =
      "I'll search for your recent orders and summarize them. This feature is coming soon.";

    // Build state for model
    const fullState: State = await runtime
      .composeState(message, ["conversation", "memories"])
      .catch(() => ({} as State));

    // Try to polish placeholder via model if available
    let finalText = placeholder;
    try {
      const aiResultAny: any = await runtime.useModel("generateText", {
        runtime,
        state: fullState,
        prompt: `User asked: "${messageText}". Please produce a short, polite assistant reply:\n\n${placeholder}`,
      });

      if (aiResultAny) {
        finalText =
          aiResultAny.output ??
          aiResultAny.text ??
          aiResultAny.result ??
          aiResultAny;
        if (typeof finalText !== "string") {
          try {
            finalText = JSON.stringify(finalText);
          } catch {
            finalText = placeholder;
          }
        }
      }
    } catch {
      finalText = placeholder;
    }

    const content: Content = {
      text: finalText,
      metadata: { plugin: "order-management-plugin", feature: "search-orders" },
    };

    if (callback) {
      try {
        await callback(content);
      } catch {
        /* ignore */
      }
    }

    return {
      success: true,
      text: finalText,
      data: { placeholder: true },
    };
  } catch (error: any) {
    return {
      success: false,
      text: "I'm sorry, I couldn't search for your orders right now.",
      error: error.message,
    };
  }
};

// ============================================================================
// ACTION VALIDATORS
// ============================================================================

const checkOrderStatusValidator: Validator = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<boolean> => {
  const messageText = (message?.content?.text as string) || "";
  return isOrderQuery(messageText);
};

const searchOrdersValidator: Validator = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<boolean> => {
  const messageText = (message?.content?.text as string) || "";
  const searchKeywords = [
    "my orders",
    "order history",
    "recent orders",
    "find orders",
    "search orders",
  ];
  return searchKeywords.some((keyword) =>
    messageText.toLowerCase().includes(keyword)
  );
};

// ============================================================================
// EVALUATOR HANDLERS
// ============================================================================

const orderResponseValidatorHandler: Handler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State,
  options?: { [key: string]: unknown },
  callback?: HandlerCallback,
  responses?: Memory[]
): Promise<ActionResult> => {
  try {
    const responseText = (message?.content?.text as string) || "";

    const hasOrderId = /\#?\d+/.test(responseText);
    const hasStatus = /status|shipped|delivered|processing/i.test(responseText);
    const hasTracking = /tracking|track/i.test(responseText);

    const isValid = hasOrderId && hasStatus;

    return {
      success: isValid,
      text: isValid
        ? "Order response is valid"
        : "Order response is missing required information",
      data: { hasOrderId, hasStatus, hasTracking, isValid },
    };
  } catch (error: any) {
    return {
      success: false,
      text: "Error validating order response",
      error: error.message,
    };
  }
};

const orderQueryDetectorHandler: Handler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State,
  options?: { [key: string]: unknown },
  callback?: HandlerCallback,
  responses?: Memory[]
): Promise<ActionResult> => {
  try {
    const messageText = (message?.content?.text as string) || "";
    const detected = isOrderQuery(messageText);

    return {
      success: true,
      text: detected ? "Order query detected" : "Not an order query",
      data: {
        isOrderQuery: detected,
        detectedKeywords: getOrderKeywords(messageText),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      text: "Error detecting order query",
      error: error.message,
    };
  }
};

// ============================================================================
// EVALUATOR VALIDATORS
// ============================================================================

const orderResponseValidatorValidator: Validator = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<boolean> => {
  const messageText = (message?.content?.text as string) || "";
  return messageText.toLowerCase().includes("order");
};

const orderQueryDetectorValidator: Validator = async (
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<boolean> => {
  return true; // run on all user messages
};

// ============================================================================
// EVENTS
// ============================================================================

const orderEvents = {
  [EventType.MESSAGE_RECEIVED]: [
    async ({
      message,
      runtime,
      state,
      callback,
    }: {
      message: Memory;
      runtime: IAgentRuntime;
      state?: State;
      callback?: HandlerCallback;
    }): Promise<void> => {
      const userMessage = (
        message?.content?.text as string | undefined
      )?.toLowerCase?.();
      if (!userMessage) return;

      if (isOrderQuery(userMessage)) {
        console.log(" Detected order query:", userMessage);

        try {
          const orderInfo = await processOrderQuery(userMessage, message);
          if (!orderInfo) return;

          // Build state for the model
          const fullState: State = await runtime
            .composeState(message, ["conversation", "memories"])
            .catch(() => ({} as State));

          // Use model to rewrite the DB response into a concise customer-facing message
          let finalText = orderInfo.response;
          try {
            const aiResultAny: any = await runtime.useModel(ModelType.TEXT_LARGE, {
              state: fullState,
              prompt: `User asked about order ${orderInfo.orderId}. Please rewrite the following raw order status into a concise, polite customer-facing message:\n\n${orderInfo.response}`,
              temperature: 0.7,
              maxTokens: 500,
            });

            if (aiResultAny) {
              finalText =
                aiResultAny.output ??
                aiResultAny.text ??
                aiResultAny.result ??
                aiResultAny;
              if (typeof finalText !== "string") {
                try {
                  finalText = JSON.stringify(finalText);
                } catch {
                  finalText = orderInfo.response;
                }
              }
            }
          } catch (gErr) {
            runtime.logger?.warn?.(
              "Order plugin: model rewrite failed, returning raw response",
              gErr
            );
            finalText = orderInfo.response;
          }

          const response: Content = {
            text: finalText,
            thought: `Order query processed: ${orderInfo.summary}`,
            metadata: {
              plugin: "order-management-plugin",
              orderId: orderInfo.orderId,
              status: orderInfo.status,
              timestamp: new Date().toISOString(),
            },
          };

          if (callback) {
            try {
              await callback(response);
            } catch (cbErr) {
              runtime.logger?.error?.("Order plugin: callback failed", cbErr);
            }
          }
        } catch (error: any) {
          console.error(" Error processing order query:", error);
          const errorResponse: Content = {
            text: "I'm having trouble retrieving your order right now.",
            thought: `Order query failed: ${error?.message || error}`,
            metadata: {
              plugin: "order-management-plugin",
              error: error?.message || String(error),
              timestamp: new Date().toISOString(),
            },
          };
          if (callback) {
            try {
              await callback(errorResponse);
            } catch {
              /* ignore */
            }
          }
        }
      }
    },
  ],
};

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  customerName: varchar("customer_name", { length: 255 }),
  customerEmail: varchar("customer_email", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 20 }),
  deliveryAddress: text("delivery_address"),
  items: jsonb("items"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 50 }),
  agentId: uuid("agent_id"),
  catalogId: uuid("catalog_id"),
  storeId: uuid("store_id"),
  ownerId: bigint("owner_id", { mode: "number" }),
  notes: text("notes"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  shippedAt: timestamp("shipped_at", { withTimezone: false }),
  deliveredAt: timestamp("delivered_at", { withTimezone: false }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: false }),
  cancelledReason: text("cancelled_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// PLUGIN
// ============================================================================

export const orderPlugin: Plugin = {
  name: "order-management-plugin",
  description: "Handles order status queries and order management operations",
  priority: 50,

  init: async (
    config: Record<string, string>,
    runtime: IAgentRuntime
  ): Promise<void> => {
    console.log(" Order Management Plugin initialized");
  },

  actions: <Action[]>[
    {
      name: "CHECK_ORDER_STATUS",
      similes: ["check order", "order status", "track order", "order tracking"],
      description: "Check the status of a customer order by order ID",
      examples: [
        [
          {
            name: "user",
            content: { text: "What is the status of order #123?" } as Content,
          },
          {
            name: "assistant",
            content: {
              text: "Let me check the status of order #123 for you.",
            } as Content,
          },
        ],
      ],
      handler: checkOrderStatusHandler,
      validate: checkOrderStatusValidator,
    },
    {
      name: "SEARCH_ORDERS",
      similes: ["find orders", "search orders", "my orders", "order history"],
      description: "Search for orders by customer ID or other criteria",
      examples: [
        [
          {
            name: "user",
            content: { text: "Show me all my recent orders" } as Content,
          },
          {
            name: "assistant",
            content: { text: "I'll search for your recent orders." } as Content,
          },
        ],
      ],
      handler: searchOrdersHandler,
      validate: searchOrdersValidator,
    },
  ],

  evaluators: <Evaluator[]>[
    {
      name: "ORDER_RESPONSE_VALIDATOR",
      description:
        "Validates that order responses contain accurate information",
      similes: ["order validator", "order response check"],
      examples: [],
      handler: orderResponseValidatorHandler,
      validate: orderResponseValidatorValidator,
    },
    {
      name: "ORDER_QUERY_DETECTOR",
      description: "Detects if a message is asking about orders",
      similes: ["order detector", "order intent"],
      examples: [],
      handler: orderQueryDetectorHandler,
      validate: orderQueryDetectorValidator,
    },
  ],

  events: orderEvents,

  config: {
    orderQueryKeywords: [
      "order status",
      "order number",
      "track order",
      "where is my order",
      "order tracking",
      "delivery status",
      "shipping status",
      "order #",
      "order id",
      "my order",
      "check order",
      "order update",
      "delivery update",
    ],
  },
  schema:{
    tables: [orders],
  }
};

export default orderPlugin;
