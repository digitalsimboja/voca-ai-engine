/**
 * Character utility functions for Voca OS service
 */
import path from "path";
import fs from "fs";
import {
  AgentConfig,
  VocaCharacter,
  Profile,
  CustomerService,
  AICapabilities,
  SocialMedia,
  OrderManagement,
  Integrations
} from "../types/index.js";

/**
 * Builds a comprehensive system prompt with all agent capabilities
 * @param profile - Profile configuration
 * @param customerService - Customer service configuration
 * @param aiCapabilities - AI capabilities configuration
 * @param socialMedia - Social media configuration
 * @param orderManagement - Order management configuration
 * @param integrations - Integrations configuration
 * @returns The system prompt
 */
function buildSystemPrompt(
  profile: Profile,
  customerService?: CustomerService,
  aiCapabilities?: AICapabilities,
  socialMedia?: SocialMedia,
  orderManagement?: OrderManagement,
  integrations?: Integrations
): string {
  const profileName = profile.name;
  const role = profile.role || "customer service assistant";

  let prompt = `You are a professional AI ${role} for ${profileName}. Your primary role is to provide exceptional customer support, product information, and assistance with orders and inquiries. Always maintain a helpful, friendly, and professional tone. Focus on resolving customer issues efficiently, providing accurate product details, assisting with order tracking, and ensuring customer satisfaction. Be empathetic to customer concerns and proactive in offering solutions.`;

  // Add availability and response time
  if (customerService?.hours) {
    prompt += ` You are available ${customerService.hours}.`;
  }
  if (customerService?.responseTime) {
    prompt += ` Aim to respond within ${customerService.responseTime} minutes.`;
  }

  // Add language capabilities
  if (customerService?.languages && customerService.languages.length > 0) {
    prompt += ` You can communicate in ${customerService.languages.join(
      ", "
    )}.`;
  }

  // Add AI capabilities
  if (aiCapabilities) {
    const capabilities: string[] = [];
    if (aiCapabilities.customerInquiries)
      capabilities.push("customer inquiries");
    if (aiCapabilities.orderTracking)
      capabilities.push("order tracking and delivery updates");
    if (aiCapabilities.productRecommendations)
      capabilities.push("product recommendations");
    if (aiCapabilities.deliveryUpdates)
      capabilities.push("delivery status updates");
    if (aiCapabilities.socialMediaEngagement)
      capabilities.push("social media engagement");
    if (aiCapabilities.inventoryAlerts) capabilities.push("inventory alerts");

    if (capabilities.length > 0) {
      prompt += ` Your capabilities include: ${capabilities.join(", ")}.`;
    }
  }

  // Add social media platforms
  if (socialMedia?.platforms) {
    const enabledPlatforms = Object.entries(socialMedia.platforms)
      .filter(([platform, config]) => config.enabled)
      .map(([platform, config]) => {
        if (platform === "instagram" && config.handle) {
          return `Instagram (@${config.handle})`;
        } else if (platform === "facebook" && config.page) {
          return `Facebook (${config.page})`;
        } else if (platform === "twitter" && config.username) {
          return `Twitter (@${config.username})`;
        } else if (platform === "tiktok" && config.username) {
          return `TikTok (@${config.username})`;
        }
        return platform;
      });

    if (enabledPlatforms.length > 0) {
      prompt += ` You are active on social media platforms: ${enabledPlatforms.join(
        ", "
      )}.`;
    }
  }

  // Add order management capabilities
  if (orderManagement) {
    if (orderManagement.trackingEnabled) {
      prompt += ` You can track orders and provide delivery updates. When customers ask about their order status, you can look up their order information using their order number and provide detailed status updates including tracking information, delivery dates, and order details.`;
    }
    if (
      orderManagement.deliveryPartners &&
      orderManagement.deliveryPartners.length > 0
    ) {
      prompt += ` Available delivery partners: ${orderManagement.deliveryPartners.join(
        ", "
      )}.`;
    }
    if (
      orderManagement.orderStatuses &&
      orderManagement.orderStatuses.length > 0
    ) {
      prompt += ` Order statuses you can help with: ${orderManagement.orderStatuses.join(
        ", "
      )}.`;
    }
  }

  // Add integration capabilities
  if (integrations) {
    if (
      integrations.payment?.enabled &&
      integrations.payment.gateways?.length && integrations.payment.gateways.length > 0
    ) {
      prompt += ` Payment gateways available: ${integrations.payment.gateways.join(
        ", "
      )}.`;
    }
    if (
      integrations.delivery?.enabled &&
      integrations.delivery.services?.length && integrations.delivery.services.length > 0
    ) {
      prompt += ` Delivery services: ${integrations.delivery.services.join(
        ", "
      )}.`;
    }
  }

  prompt += ` Always prioritize customer needs and represent ${profileName} with excellence.`;

  return prompt;
}

/**
 * Creates a dynamic character configuration for a vendor
 * @param vendorId - The vendor identifier
 * @param agentConfig - The agent configuration object
 * @returns The character configuration matching ElizaOS format
 */
export function createDynamicCharacter(vendorId: string, agentConfig: AgentConfig): VocaCharacter {
  const {
    profile,
    customerService,
    aiCapabilities,
    socialMedia,
    orderManagement,
    integrations,
  } = agentConfig;
  
  // Build comprehensive system prompt with all capabilities
  const systemPrompt = buildSystemPrompt(
    profile,
    customerService,
    aiCapabilities,
    socialMedia,
    orderManagement,
    integrations
  );

  const character: VocaCharacter = {
    // Required ElizaOS Character properties
    name: profile.name,
    bio: [
      profile.bio ||
        profile.description ||
        `I am ${profile.name}, your AI assistant for ${profile.name}.`,
      `I help customers with their inquiries and provide excellent service.`,
      `I'm here to assist you with product information, orders, and any questions you may have.`,
      customerService?.hours ? `I'm available ${customerService.hours}.` : null,
      customerService?.languages
        ? `I can communicate in ${customerService.languages.join(", ")}.`
        : null,
      customerService?.responseTime
        ? `I typically respond within ${customerService.responseTime} minutes.`
        : null,
      socialMedia?.platforms ? `I'm active on social media platforms.` : null,
      orderManagement?.trackingEnabled
        ? `I can help track your orders and provide delivery updates.`
        : null,
    ].filter(Boolean) as string[],
    
    // Optional ElizaOS Character properties
    username: profile.name.toLowerCase().replace(/\s+/g, '_'),
    system: systemPrompt,
    adjectives: [
      "HELPFUL",
      "FRIENDLY",
      "PROFESSIONAL",
      "KNOWLEDGEABLE",
      "RESPONSIVE",
      "CARE",
      "SUPPORTIVE",
      "EFFICIENT",
      "RELIABLE",
      "EXPERIENCED",
    ],
    topics: [
      "customer service",
      "product information",
      "order assistance",
      "shipping and delivery",
      "returns and refunds",
      "general inquiries",
      ...(aiCapabilities?.orderTracking
        ? ["order tracking", "delivery updates"]
        : []),
      ...(aiCapabilities?.productRecommendations
        ? ["product recommendations", "shopping assistance"]
        : []),
      ...(aiCapabilities?.socialMediaEngagement
        ? ["social media", "content creation"]
        : []),
      ...(integrations?.payment?.enabled
        ? ["payment processing", "billing"]
        : []),
      ...(orderManagement?.trackingEnabled
        ? ["order status", "tracking information"]
        : []),
      ...(socialMedia?.contentTypes ? socialMedia.contentTypes : []),
    ],
    knowledge: [
      `I know about ${profile.name}'s products and services.`,
      `I understand customer service best practices.`,
      `I can help with order management and tracking.`,
      `I'm familiar with our company policies and procedures.`,
      `I can provide information about shipping and delivery.`,
      `I understand our return and refund policies.`,
      customerService?.hours
        ? `I'm available during ${customerService.hours}.`
        : null,
      customerService?.languages
        ? `I can communicate in ${customerService.languages.join(", ")}.`
        : null,
      customerService?.responseTime
        ? `I aim to respond within ${customerService.responseTime} minutes.`
        : null,
      orderManagement?.orderStatuses
        ? `I can help with order statuses: ${orderManagement.orderStatuses.join(
            ", "
          )}.`
        : null,
      orderManagement?.deliveryPartners
        ? `I work with these delivery partners: ${orderManagement.deliveryPartners.join(
            ", "
          )}.`
        : null,
      integrations?.payment?.enabled
        ? `I can process payments through: ${
            integrations.payment.gateways?.join(", ") || "our payment systems"
          }.`
        : null,
      integrations?.delivery?.enabled
        ? `I can arrange delivery through: ${
            integrations.delivery.services?.join(", ") ||
            "our delivery services"
          }.`
        : null,
      socialMedia?.contentTypes
        ? `I can help with social media content: ${socialMedia.contentTypes.join(
            ", "
          )}.`
        : null,
    ].filter(Boolean) as string[],
    messageExamples: [
      [
        {
          name: "{{user}}",
          content: {
            text: "Hello, I need help with my order",
          },
        },
        {
          name: profile.name,
          content: {
            text: `Hello! I'm ${profile.name}, your AI assistant. I'd be happy to help you with your order. Could you please provide your order number or tell me more about what you need assistance with?`,
          },
        },
      ],
      [
        {
          name: "{{user}}",
          content: {
            text: "What products do you have?",
          },
        },
        {
          name: profile.name,
          content: {
            text: "I'd be happy to help you find the perfect products! Could you tell me what you're looking for or what category interests you?",
          },
        },
      ],
      [
        {
          name: "{{user}}",
          content: {
            text: "Can you track my order?",
          },
        },
        {
          name: profile.name,
          content: {
            text: `Absolutely! I can help you track your order. ${
              orderManagement?.trackingEnabled
                ? "Please provide your order number and I'll give you the latest status update."
                : "I can assist you with order information. Please provide your order details."
            }`,
          },
        },
      ],
    ],
    postExamples: [
      `Welcome to ${profile.name}! I'm here to help with any questions you may have.`,
      `Need assistance? I'm your AI assistant and I'm here to help!`,
      `Have questions about our products or services? Just ask!`,
      `I'm available ${
        customerService?.hours || "24/7"
      } to help with your customer service needs.`,
      socialMedia?.platforms
        ? `Follow us on social media for updates and special offers!`
        : null,
      orderManagement?.trackingEnabled
        ? `Track your orders easily with our automated system!`
        : null,
    ].filter(Boolean) as string[],
    style: {
      all: [
        "friendly and professional tone",
        "helpful and informative responses",
        "clear and concise communication",
        "customer-focused approach",
        "empathetic and understanding",
      ],
      chat: [
        "directly addresses customer concerns",
        "provides helpful information",
        "asks clarifying questions when needed",
        "offers specific solutions",
        "maintains professional tone",
      ],
      post: [
        "welcoming and inviting",
        "encourages customer interaction",
        "highlights service availability",
        "uses positive language",
        "emphasizes helpfulness",
      ],
    },
    plugins: ["@elizaos/plugin-sql", "@elizaos/plugin-openai", "@elizaos/plugin-bootstrap"],
    settings: {
      secrets: {
        GOOGLE_GENERATIVE_AI_API_KEY: process.env["GOOGLE_GENERATIVE_AI_API_KEY"] || '',
        OPENAI_API_KEY: process.env["OPENAI_API_KEY"] || '',
      },
      avatar: `https://elizaos.github.io/eliza-avatars/${profile.name.toLowerCase().replace(/\s+/g, '-')}.png`,
      model: "gpt-3.5-turbo",
      temperature: 0.7,
      maxTokens: 2000,
      memoryLimit: 1000,
      conversationLength: 32
    },
    
    // VocaOS-specific properties
    clients: ["twitter"],
    modelProvider: "openai",
    lore: [
      `I work for ${profile.name} and specialize in customer service.`,
      `I have access to product information and can help with orders.`,
      `I'm trained to be helpful, friendly, and professional.`,
      `I can assist with ${
        aiCapabilities?.customerInquiries
          ? "customer inquiries"
          : "basic questions"
      }.`,
      aiCapabilities?.orderTracking
        ? `I can help track orders and provide delivery updates.`
        : null,
      aiCapabilities?.productRecommendations
        ? `I can recommend products based on your needs.`
        : null,
      aiCapabilities?.socialMediaEngagement
        ? `I can engage with customers on social media platforms.`
        : null,
      customerService?.hours ? `I'm available ${customerService.hours}.` : null,
      customerService?.responseTime
        ? `I typically respond within ${customerService.responseTime} minutes.`
        : null,
      customerService?.languages
        ? `I can communicate in ${customerService.languages.join(", ")}.`
        : null,
      orderManagement?.deliveryPartners
        ? `I work with delivery partners: ${orderManagement.deliveryPartners.join(
            ", "
          )}.`
        : null,
      integrations?.payment?.enabled
        ? `I can help with payment processing using ${
            integrations.payment.gateways?.join(", ") || "our payment systems"
          }.`
        : null,
    ].filter(Boolean) as string[],
    
    // Store the complete configuration for reference
    configuration: {
      profile,
      ...(customerService && { customerService }),
      ...(aiCapabilities && { aiCapabilities }),
      ...(socialMedia && { socialMedia }),
      ...(orderManagement && { orderManagement }),
      ...(integrations && { integrations }),
    },
  };

  // write character to disk for now, later we will use s3 bucket for storage
  const dynamicDir = path.join(process.cwd(), "characters", "dynamic");
  if (!fs.existsSync(dynamicDir)) {
    fs.mkdirSync(dynamicDir, { recursive: true });
  }
  const characterPath = path.join(dynamicDir, `${vendorId}.json`);
  fs.writeFileSync(characterPath, JSON.stringify(character, null, 2));

  return character;
}
