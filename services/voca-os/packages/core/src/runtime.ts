import { v4 as uuidv4 } from 'uuid';

// Interface for working memory entries
interface WorkingMemoryEntry {
  actionName: string;
  result: ActionResult;
  timestamp: number;
}
import { createUniqueUuid } from './entities';
import { getEnv, getNumberEnv } from './utils/environment';
import { BufferUtils } from './utils/buffer';
import { decryptSecret, getSalt, safeReplacer } from './index';
import { createLogger } from './logger';
import {
  ChannelType,
  EventType,
  ModelType,
  MODEL_SETTINGS,
  type Content,
  type MemoryMetadata,
  type Character,
  type Action,
  type Evaluator,
  type Provider,
  type HandlerCallback,
  type IDatabaseAdapter,
  type Entity,
  type Room,
  type World,
  type SendHandlerFunction,
  type TargetInfo,
  type ModelParamsMap,
  type ModelResultMap,
  type ModelTypeName,
  type Plugin,
  type Route,
  type UUID,
  type Service,
  type ServiceTypeName,
  type State,
  type TaskWorker,
  type Agent,
  type Log,
  type Participant,
  type Relationship,
  type Task,
  type Memory,
  type ModelHandler,
  type RuntimeSettings,
  type Component,
  IAgentRuntime,
  type ActionResult,
  type ActionContext,
} from './types';

import { BM25 } from './search';
import { stringToUuid } from './utils';

const environmentSettings: RuntimeSettings = {};

export class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];
  constructor(count: number) {
    this.permits = count;
  }
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }
  release(): void {
    this.permits += 1;
    const nextResolve = this.waiting.shift();
    if (nextResolve && this.permits > 0) {
      this.permits -= 1;
      nextResolve();
    }
  }
}

type ServiceResolver = (service: Service) => void;

export class AgentRuntime implements IAgentRuntime {
  readonly #conversationLength = 32 as number;
  readonly agentId: UUID;
  readonly character: Character;
  public adapter!: IDatabaseAdapter;
  readonly actions: Action[] = [];
  readonly evaluators: Evaluator[] = [];
  readonly providers: Provider[] = [];
  readonly plugins: Plugin[] = [];
  private isInitialized = false;
  events: Map<string, ((params: any) => Promise<void>)[]> = new Map();
  stateCache = new Map<
    UUID,
    {
      values: { [key: string]: any };
      data: { [key: string]: any };
      text: string;
    }
  >();
  readonly fetch = fetch;
  services = new Map<ServiceTypeName, Service[]>();
  private serviceTypes = new Map<ServiceTypeName, (typeof Service)[]>();
  models = new Map<string, ModelHandler[]>();
  routes: Route[] = [];
  private taskWorkers = new Map<string, TaskWorker>();
  private sendHandlers = new Map<string, SendHandlerFunction>();
  private eventHandlers: Map<string, ((data: any) => void)[]> = new Map();

  // A map of all plugins available to the runtime, keyed by name, for dependency resolution.
  private allAvailablePlugins = new Map<string, Plugin>();
  // The initial list of plugins specified by the character configuration.
  private characterPlugins: Plugin[] = [];

  public logger;
  private settings: RuntimeSettings;
  private servicesInitQueue = new Set<typeof Service>();
  private servicePromiseHandles = new Map<string, ServiceResolver>(); // write
  private servicePromises = new Map<string, Promise<Service>>(); // read
  public initPromise;
  private initResolver: ((value?: unknown) => void) | undefined;
  private currentRunId?: UUID; // Track the current run ID
  private currentActionContext?: {
    // Track current action execution context
    actionName: string;
    actionId: UUID;
    prompts: Array<{
      modelType: string;
      prompt: string;
      timestamp: number;
    }>;
  };
  private maxWorkingMemoryEntries: number = 50; // Default value, can be overridden

  constructor(opts: {
    conversationLength?: number;
    agentId?: UUID;
    character?: Character;
    plugins?: Plugin[];
    fetch?: typeof fetch;
    adapter?: IDatabaseAdapter;
    settings?: RuntimeSettings;
    events?: { [key: string]: ((params: any) => void)[] };
    allAvailablePlugins?: Plugin[];
  }) {
    this.agentId =
      opts.character?.id ??
      opts?.agentId ??
      stringToUuid(opts.character?.name ?? uuidv4() + opts.character?.username);
    this.character = opts.character as Character;
    const logLevel = getEnv('LOG_LEVEL', 'info');

    this.initPromise = new Promise((resolve) => {
      this.initResolver = resolve;
    });

    // Create the logger with appropriate level - only show debug logs when explicitly configured
    this.logger = createLogger({
      agentName: this.character?.name,
      logLevel: logLevel as any,
    });

    this.#conversationLength = opts.conversationLength ?? this.#conversationLength;
    if (opts.adapter) {
      this.registerDatabaseAdapter(opts.adapter);
    }
    this.fetch = (opts.fetch as typeof fetch) ?? this.fetch;
    this.settings = opts.settings ?? environmentSettings;

    this.plugins = []; // Initialize plugins as an empty array
    this.characterPlugins = opts?.plugins ?? []; // Store the original character plugins

    if (opts.allAvailablePlugins) {
      for (const plugin of opts.allAvailablePlugins) {
        if (plugin?.name) {
          this.allAvailablePlugins.set(plugin.name, plugin);
        }
      }
    }

    this.logger.debug(`Success: Agent ID: ${this.agentId}`);
    this.currentRunId = undefined; // Initialize run ID tracker

    // Set max working memory entries from settings or environment
    if (opts.settings?.MAX_WORKING_MEMORY_ENTRIES) {
      this.maxWorkingMemoryEntries = parseInt(opts.settings.MAX_WORKING_MEMORY_ENTRIES, 10) || 50;
    } else {
      this.maxWorkingMemoryEntries = getNumberEnv('MAX_WORKING_MEMORY_ENTRIES', 50) as number;
    }
  }

  /**
   * Create a new run ID for tracking a sequence of model calls
   */
  createRunId(): UUID {
    return uuidv4() as UUID;
  }

  /**
   * Start a new run for tracking prompts
   */
  startRun(): UUID {
    this.currentRunId = this.createRunId();
    return this.currentRunId;
  }

  /**
   * End the current run
   */
  endRun(): void {
    this.currentRunId = undefined;
  }

  /**
   * Get the current run ID (creates one if it doesn't exist)
   */
  getCurrentRunId(): UUID {
    if (!this.currentRunId) {
      this.currentRunId = this.createRunId();
    }
    return this.currentRunId;
  }

  async registerPlugin(plugin: Plugin): Promise<void> {
    if (!plugin?.name) {
      // Ensure plugin and plugin.name are defined
      const errorMsg = 'Plugin or plugin name is undefined';
      this.logger.error(`*** registerPlugin: ${errorMsg}`);
      throw new Error(`*** registerPlugin: ${errorMsg}`);
    }

    // Check if a plugin with the same name is already registered.
    const existingPlugin = this.plugins.find((p) => p.name === plugin.name);
    if (existingPlugin) {
      this.logger.warn(
        `${this.character.name}(${this.agentId}) - Plugin ${plugin.name} is already registered. Skipping re-registration.`
      );
      return; // Do not proceed further with other registration steps
    }

<<<<<<< HEAD
    async registerService(service: Service): Promise<void> {
        const serviceType = service.serviceType;
        elizaLogger.log(`${this.character.name}(${this.agentId}) - Registering service:`, serviceType);

        if (this.services.has(serviceType)) {
            elizaLogger.warn(
                `${this.character.name}(${this.agentId}) - Service ${serviceType} is already registered. Skipping registration.`
            );
            return;
        }

        // Add the service to the services map
        this.services.set(serviceType, service);
        elizaLogger.success(`${this.character.name}(${this.agentId}) - Service ${serviceType} registered successfully`);
    }

    /**
     * Creates an instance of AgentRuntime.
     * @param opts - The options for configuring the AgentRuntime.
     * @param opts.conversationLength - The number of messages to hold in the recent message cache.
     * @param opts.token - The JWT token, can be a JWT token if outside worker, or an OpenAI token if inside worker.
     * @param opts.serverUrl - The URL of the worker.
     * @param opts.actions - Optional custom actions.
     * @param opts.evaluators - Optional custom evaluators.
     * @param opts.services - Optional custom services.
     * @param opts.memoryManagers - Optional custom memory managers.
     * @param opts.providers - Optional context providers.
     * @param opts.model - The model to use for generateText.
     * @param opts.embeddingModel - The model to use for embedding.
     * @param opts.agentId - Optional ID of the agent.
     * @param opts.databaseAdapter - The database adapter used for interacting with the database.
     * @param opts.fetch - Custom fetch function to use for making requests.
     */

    constructor(opts: {
        conversationLength?: number; // number of messages to hold in the recent message cache
        agentId?: UUID; // ID of the agent
        character?: Character; // The character to use for the agent
        token: string; // JWT token, can be a JWT token if outside worker, or an OpenAI token if inside worker
        serverUrl?: string; // The URL of the worker
        actions?: Action[]; // Optional custom actions
        evaluators?: Evaluator[]; // Optional custom evaluators
        plugins?: Plugin[];
        providers?: Provider[];
        modelProvider: ModelProviderName;

        services?: Service[]; // Map of service name to service instance
        managers?: IMemoryManager[]; // Map of table name to memory manager
        databaseAdapter?: IDatabaseAdapter; // The database adapter used for interacting with the database
        fetch?: typeof fetch | unknown;
        speechModelPath?: string;
        cacheManager?: ICacheManager;
        logging?: boolean;
        // verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    }) {
        // use the character id if it exists, otherwise use the agentId if it is passed in, otherwise use the character name
        this.agentId =
            opts.character?.id ??
            opts?.agentId ??
            stringToUuid(opts.character?.name ?? uuidv4());
        this.character = opts.character;

        if(!this.character) {
            throw new Error("Character input is required");
        }

        elizaLogger.info(`${this.character.name}(${this.agentId}) - Initializing AgentRuntime with options:`, {
            character: opts.character?.name,
            modelProvider: opts.modelProvider,
            characterModelProvider: opts.character?.modelProvider,
        });

        elizaLogger.debug(
            `[AgentRuntime] Process working directory: ${process.cwd()}`,
        );

        // Define the root path once
        this.knowledgeRoot = join(
            process.cwd(),
            "..",
            "characters",
            "knowledge",
        );

        elizaLogger.debug(
            `[AgentRuntime] Process knowledgeRoot: ${this.knowledgeRoot}`,
        );

        this.#conversationLength =
            opts.conversationLength ?? this.#conversationLength;

        this.databaseAdapter = opts.databaseAdapter;

        elizaLogger.success(`Agent ID: ${this.agentId}`);

        this.fetch = (opts.fetch as typeof fetch) ?? this.fetch;

        this.cacheManager = opts.cacheManager;

        this.messageManager = new MemoryManager({
            runtime: this,
            tableName: "messages",
        });

        this.descriptionManager = new MemoryManager({
            runtime: this,
            tableName: "descriptions",
        });

        this.loreManager = new MemoryManager({
            runtime: this,
            tableName: "lore",
        });

        this.documentsManager = new MemoryManager({
            runtime: this,
            tableName: "documents",
        });

        this.knowledgeManager = new MemoryManager({
            runtime: this,
            tableName: "fragments",
        });

        this.ragKnowledgeManager = new RAGKnowledgeManager({
            runtime: this,
            tableName: "knowledge",
            knowledgeRoot: this.knowledgeRoot,
        });

        (opts.managers ?? []).forEach((manager: IMemoryManager) => {
            this.registerMemoryManager(manager);
        });

        (opts.services ?? []).forEach((service: Service) => {
            this.registerService(service);
        });

        this.serverUrl = opts.serverUrl ?? this.serverUrl;

        elizaLogger.info(`${this.character.name}(${this.agentId}) - Setting Model Provider:`, {
            characterModelProvider: this.character.modelProvider,
            optsModelProvider: opts.modelProvider,
            currentModelProvider: this.modelProvider,
            finalSelection:
                this.character.modelProvider ??
                opts.modelProvider ??
                this.modelProvider,
        });

        this.modelProvider =
            this.character.modelProvider ??
            opts.modelProvider ??
            this.modelProvider;

        this.imageModelProvider =
            this.character.imageModelProvider ?? this.modelProvider;

        this.imageVisionModelProvider =
            this.character.imageVisionModelProvider ?? this.modelProvider;

        elizaLogger.info(
          `${this.character.name}(${this.agentId}) - Selected model provider:`,
          this.modelProvider
        );

        elizaLogger.info(
          `${this.character.name}(${this.agentId}) - Selected image model provider:`,
          this.imageModelProvider
        );

        elizaLogger.info(
            `${this.character.name}(${this.agentId}) - Selected image vision model provider:`,
            this.imageVisionModelProvider
        );

        // Validate model provider
        if (!Object.values(ModelProviderName).includes(this.modelProvider)) {
            elizaLogger.error("Invalid model provider:", this.modelProvider);
            elizaLogger.error(
                "Available providers:",
                Object.values(ModelProviderName),
            );
            throw new Error(`Invalid model provider: ${this.modelProvider}`);
        }

        if (!this.serverUrl) {
            elizaLogger.warn("No serverUrl provided, defaulting to localhost");
        }

        this.token = opts.token;

        this.plugins = [
            ...(opts.character?.plugins ?? []),
            ...(opts.plugins ?? []),
        ];

        this.plugins.forEach((plugin) => {
            plugin.actions?.forEach((action) => {
                this.registerAction(action);
            });

            plugin.evaluators?.forEach((evaluator) => {
                this.registerEvaluator(evaluator);
            });

            plugin.services?.forEach((service) => {
                this.registerService(service);
            });

            plugin.providers?.forEach((provider) => {
                this.registerContextProvider(provider);
            });

            plugin.adapters?.forEach((adapter) => {
                this.registerAdapter(adapter);
            });
        });

        (opts.actions ?? []).forEach((action) => {
            this.registerAction(action);
        });

        (opts.providers ?? []).forEach((provider) => {
            this.registerContextProvider(provider);
        });

        (opts.evaluators ?? []).forEach((evaluator: Evaluator) => {
            this.registerEvaluator(evaluator);
        });

        // this.verifiableInferenceAdapter = opts.verifiableInferenceAdapter;
    }

    private async initializeDatabase() {
        // By convention, we create a user and room using the agent id.
        // Memories related to it are considered global context for the agent.
        this.ensureRoomExists(this.agentId);
        this.ensureUserExists(
            this.agentId,
            this.character.username || this.character.name,
            this.character.name,
        ).then(() => {
            // postgres needs the user to exist before you can add a participant
            this.ensureParticipantExists(this.agentId, this.agentId);
        });
    }

    async initialize() {
        this.initializeDatabase();

        for (const [serviceType, service] of this.services.entries()) {
            try {
                await service.initialize(this);
                this.services.set(serviceType, service);
                elizaLogger.success(
                    `${this.character.name}(${this.agentId}) - Service ${serviceType} initialized successfully`
                );
            } catch (error) {
                elizaLogger.error(
                    `${this.character.name}(${this.agentId}) - Failed to initialize service ${serviceType}:`,
                    error
                );
                throw error;
            }
        }

        // should already be initiailized
        /*
        for (const plugin of this.plugins) {
            if (plugin.services)
                await Promise.all(
                    plugin.services?.map((service) => service.initialize(this)),
                );
        }
        */
=======
    // Add the plugin to the runtime's list of active plugins
    (this.plugins as Plugin[]).push(plugin);
    this.logger.debug(
      `Success: Plugin ${plugin.name} added to active plugins for ${this.character.name}(${this.agentId}).`
    );
>>>>>>> 826a7d55bf98539c5bc1a2fa7a65aeaa03ffd76a

    if (plugin.init) {
      try {
        await plugin.init(plugin.config || {}, this);
        this.logger.debug(`Success: Plugin ${plugin.name} initialized successfully`);
      } catch (error) {
        // Check if the error is related to missing API keys
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('API key') ||
          errorMessage.includes('environment variables') ||
          errorMessage.includes('Invalid plugin configuration')
        ) {
<<<<<<< HEAD
            elizaLogger.info(
                `[RAG Check] RAG Knowledge enabled: ${this.character.settings.ragKnowledge ? true : false}`,
            );
            elizaLogger.debug(
                `[RAG Check] Knowledge items:`,
                this.character.knowledge,
            );

            if (this.character.settings.ragKnowledge) {
                // Type guards with logging for each knowledge type
                const [directoryKnowledge, pathKnowledge, stringKnowledge] =
                    this.character.knowledge.reduce(
                        (acc, item) => {
                            if (typeof item === "object") {
                                if (isDirectoryItem(item)) {
                                    elizaLogger.debug(
                                        `[RAG Filter] Found directory item: ${JSON.stringify(item)}`,
                                    );
                                    acc[0].push(item);
                                } else if ("path" in item) {
                                    elizaLogger.debug(
                                        `[RAG Filter] Found path item: ${JSON.stringify(item)}`,
                                    );
                                    acc[1].push(item);
                                }
                            } else if (typeof item === "string") {
                                elizaLogger.debug(
                                    `[RAG Filter] Found string item: ${item.slice(0, 100)}...`,
                                );
                                acc[2].push(item);
                            }
                            return acc;
                        },
                        [[], [], []] as [
                            Array<{ directory: string; shared?: boolean }>,
                            Array<{ path: string; shared?: boolean }>,
                            Array<string>,
                        ],
                    );

                elizaLogger.info(
                    `[RAG Summary] Found ${directoryKnowledge.length} directories, ${pathKnowledge.length} paths, and ${stringKnowledge.length} strings`,
                );

                // Process each type of knowledge
                if (directoryKnowledge.length > 0) {
                    elizaLogger.info(
                        `[RAG Process] Processing directory knowledge sources:`,
                    );
                    for (const dir of directoryKnowledge) {
                        elizaLogger.info(
                            `  - Directory: ${dir.directory} (shared: ${!!dir.shared})`,
                        );
                        await this.processCharacterRAGDirectory(dir);
                    }
                }

                if (pathKnowledge.length > 0) {
                    elizaLogger.info(
                        `[RAG Process] Processing individual file knowledge sources`,
                    );
                    await this.processCharacterRAGKnowledge(pathKnowledge);
                }

                if (stringKnowledge.length > 0) {
                    elizaLogger.info(
                        `[RAG Process] Processing direct string knowledge`,
                    );
                    await this.processCharacterRAGKnowledge(stringKnowledge);
                }
            } else {
                // Non-RAG mode: only process string knowledge
                const stringKnowledge = this.character.knowledge.filter(
                    (item): item is string => typeof item === "string",
                );
                await this.processCharacterKnowledge(stringKnowledge);
            }

            // After all new knowledge is processed, clean up any deleted files
            elizaLogger.info(
                `[RAG Cleanup] Starting cleanup of deleted knowledge files`,
            );
            await this.ragKnowledgeManager.cleanupDeletedKnowledgeFiles();
            elizaLogger.info(`[RAG Cleanup] Cleanup complete`);
        }
    }

    async stop() {
        elizaLogger.debug("runtime::stop - character", this.character.name);
        // stop services, they don't have a stop function
        // just initialize

        // plugins
        // have actions, providers, evaluators (no start/stop)
        // services (just initialized), clients

        // client have a start
        for (const c of this.clients) {
            elizaLogger.log(
                "runtime::stop - requesting",
                c,
                "client stop for",
                this.character.name,
            );
            c.stop(this);
        }
        // we don't need to unregister with directClient
        // don't need to worry about knowledge
    }

    /**
     * Processes character knowledge by creating document memories and fragment memories.
     * This function takes an array of knowledge items, creates a document memory for each item if it doesn't exist,
     * then chunks the content into fragments, embeds each fragment, and creates fragment memories.
     * @param knowledge An array of knowledge items containing id, path, and content.
     */
    private async processCharacterKnowledge(items: string[]) {
        const ids = items.map(i => stringToUuid(i));
        const exists = await this.documentsManager.getMemoriesByIds(ids);
        const toAdd = [];
        for(const i in items) {
          const exist = exists[i];
          if (!exist) {
            toAdd.push([items[i], ids[i]]);
          }
        }
        if (!toAdd.length) return;
        elizaLogger.info('discovered ' + toAdd.length + ' new knowledge items')
        const chunkSize = 512;
        const ps = [];
        for (const a of toAdd) {
            const item = a[0];
            const knowledgeId = a[1];

            if (item.length > chunkSize) {
              // these are just slower
              elizaLogger.info(
                  this.character.name,
                  " knowledge item over 512 characters, splitting - ",
                  item.slice(0, 100),
              );
            }

            ps.push(knowledge.set(this, {
                id: knowledgeId,
                content: {
                    text: item,
                },
            }));
        }
        // wait for it all to be added
        await Promise.all(ps);
        elizaLogger.success(this.character.name, 'knowledge is synchronized');
    }

    /**
     * Processes character knowledge by creating document memories and fragment memories.
     * This function takes an array of knowledge items, creates a document knowledge for each item if it doesn't exist,
     * then chunks the content into fragments, embeds each fragment, and creates fragment knowledge.
     * An array of knowledge items or objects containing id, path, and content.
     */
    private async processCharacterRAGKnowledge(
        items: (string | { path: string; shared?: boolean })[],
    ) {
        let hasError = false;

        for (const item of items) {
            if (!item) continue;

            try {
                // Check if item is marked as shared
                let isShared = false;
                let contentItem = item;

                // Only treat as shared if explicitly marked
                if (typeof item === "object" && "path" in item) {
                    isShared = item.shared === true;
                    contentItem = item.path;
                } else {
                    contentItem = item;
                }

                // const knowledgeId = stringToUuid(contentItem);
                const knowledgeId = this.ragKnowledgeManager.generateScopedId(
                    contentItem,
                    isShared,
                );
                const fileExtension = contentItem
                    .split(".")
                    .pop()
                    ?.toLowerCase();

                // Check if it's a file or direct knowledge
                if (
                    fileExtension &&
                    ["md", "txt", "pdf"].includes(fileExtension)
                ) {
                    try {
                        const filePath = join(this.knowledgeRoot, contentItem);
                        // Get existing knowledge first with more detailed logging
                        elizaLogger.debug("[RAG Query]", {
                            knowledgeId,
                            agentId: this.agentId,
                            relativePath: contentItem,
                            fullPath: filePath,
                            isShared,
                            knowledgeRoot: this.knowledgeRoot,
                        });

                        // Get existing knowledge first
                        const existingKnowledge =
                            await this.ragKnowledgeManager.getKnowledge({
                                id: knowledgeId,
                                agentId: this.agentId, // Keep agentId as it's used in OR query
                            });

                        elizaLogger.debug("[RAG Query Result]", {
                            relativePath: contentItem,
                            fullPath: filePath,
                            knowledgeId,
                            isShared,
                            exists: existingKnowledge.length > 0,
                            knowledgeCount: existingKnowledge.length,
                            firstResult: existingKnowledge[0]
                                ? {
                                      id: existingKnowledge[0].id,
                                      agentId: existingKnowledge[0].agentId,
                                      contentLength:
                                          existingKnowledge[0].content.text
                                              .length,
                                  }
                                : null,
                            results: existingKnowledge.map((k) => ({
                                id: k.id,
                                agentId: k.agentId,
                                isBaseKnowledge: !k.id.includes("chunk"),
                            })),
                        });

                        // Read file content
                        const content: string = await readFile(
                            filePath,
                            "utf8",
                        );
                        if (!content) {
                            hasError = true;
                            continue;
                        }

                        if (existingKnowledge.length > 0) {
                            const existingContent =
                                existingKnowledge[0].content.text;

                            elizaLogger.debug("[RAG Compare]", {
                                path: contentItem,
                                knowledgeId,
                                isShared,
                                existingContentLength: existingContent.length,
                                newContentLength: content.length,
                                contentSample: content.slice(0, 100),
                                existingContentSample: existingContent.slice(
                                    0,
                                    100,
                                ),
                                matches: existingContent === content,
                            });

                            if (existingContent === content) {
                                elizaLogger.info(
                                    `${isShared ? "Shared knowledge" : "Knowledge"} ${contentItem} unchanged, skipping`,
                                );
                                continue;
                            }

                            // Content changed, remove old knowledge before adding new
                            elizaLogger.info(
                                `${isShared ? "Shared knowledge" : "Knowledge"} ${contentItem} changed, updating...`,
                            );
                            await this.ragKnowledgeManager.removeKnowledge(
                                knowledgeId,
                            );
                            await this.ragKnowledgeManager.removeKnowledge(
                                `${knowledgeId}-chunk-*` as UUID,
                            );
                        }

                        elizaLogger.info(
                            `Processing ${fileExtension.toUpperCase()} file content for`,
                            this.character.name,
                            "-",
                            contentItem,
                        );

                        await this.ragKnowledgeManager.processFile({
                            path: contentItem,
                            content: content,
                            type: fileExtension as "pdf" | "md" | "txt",
                            isShared: isShared,
                        });
                    } catch (error: any) {
                        hasError = true;
                        elizaLogger.error(
                            `Failed to read knowledge file ${contentItem}. Error details:`,
                            error?.message || error || "Unknown error",
                        );
                        continue;
                    }
                } else {
                    // Handle direct knowledge string
                    elizaLogger.info(
                        "Processing direct knowledge for",
                        this.character.name,
                        "-",
                        contentItem.slice(0, 100),
                    );

                    const existingKnowledge =
                        await this.ragKnowledgeManager.getKnowledge({
                            id: knowledgeId,
                            agentId: this.agentId,
                        });

                    if (existingKnowledge.length > 0) {
                        elizaLogger.info(
                            `Direct knowledge ${knowledgeId} already exists, skipping`,
                        );
                        continue;
                    }

                    await this.ragKnowledgeManager.createKnowledge({
                        id: knowledgeId,
                        agentId: this.agentId,
                        content: {
                            text: contentItem,
                            metadata: {
                                type: "direct",
                            },
                        },
                    });
                }
            } catch (error: any) {
                hasError = true;
                elizaLogger.error(
                    `Error processing knowledge item ${item}:`,
                    error?.message || error || "Unknown error",
                );
                continue;
            }
        }

        if (hasError) {
            elizaLogger.warn(
                "Some knowledge items failed to process, but continuing with available knowledge",
            );
        }
    }

    /**
     * Processes directory-based RAG knowledge by recursively loading and processing files.
     * @param dirConfig The directory configuration containing path and shared flag
     */
    private async processCharacterRAGDirectory(dirConfig: {
        directory: string;
        shared?: boolean;
    }) {
        if (!dirConfig.directory) {
            elizaLogger.error("[RAG Directory] No directory specified");
            return;
        }

        // Sanitize directory path to prevent traversal attacks
        const sanitizedDir = dirConfig.directory.replace(/\.\./g, "");
        const dirPath = join(this.knowledgeRoot, sanitizedDir);

        try {
            // Check if directory exists
            const dirExists = existsSync(dirPath);
            if (!dirExists) {
                elizaLogger.error(
                    `[RAG Directory] Directory does not exist: ${sanitizedDir}`,
                );
                return;
            }

            elizaLogger.debug(`[RAG Directory] Searching in: ${dirPath}`);
            // Use glob to find all matching files in directory
            const files = await glob("**/*.{md,txt,pdf}", {
                cwd: dirPath,
                nodir: true,
                absolute: false,
            });

            if (files.length === 0) {
                elizaLogger.warn(
                    `No matching files found in directory: ${dirConfig.directory}`,
                );
                return;
            }

            elizaLogger.info(
                `[RAG Directory] Found ${files.length} files in ${dirConfig.directory}`,
            );

            // Process files in batches to avoid memory issues
            const BATCH_SIZE = 5;
            for (let i = 0; i < files.length; i += BATCH_SIZE) {
                const batch = files.slice(i, i + BATCH_SIZE);

                await Promise.all(
                    batch.map(async (file) => {
                        try {
                            const relativePath = join(sanitizedDir, file);

                            elizaLogger.debug(
                                `[RAG Directory] Processing file ${i + 1}/${files.length}:`,
                                {
                                    file,
                                    relativePath,
                                    shared: dirConfig.shared,
                                },
                            );

                            await this.processCharacterRAGKnowledge([
                                {
                                    path: relativePath,
                                    shared: dirConfig.shared,
                                },
                            ]);
                        } catch (error) {
                            elizaLogger.error(
                                `[RAG Directory] Failed to process file: ${file}`,
                                error instanceof Error
                                    ? {
                                          name: error.name,
                                          message: error.message,
                                          stack: error.stack,
                                      }
                                    : error,
                            );
                        }
                    }),
                );

                elizaLogger.debug(
                    `[RAG Directory] Completed batch ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} files`,
                );
            }

            elizaLogger.success(
                `[RAG Directory] Successfully processed directory: ${sanitizedDir}`,
            );
        } catch (error) {
            elizaLogger.error(
                `[RAG Directory] Failed to process directory: ${sanitizedDir}`,
                error instanceof Error
                    ? {
                          name: error.name,
                          message: error.message,
                          stack: error.stack,
                      }
                    : error,
            );
            throw error; // Re-throw to let caller handle it
        }
    }

    getSetting(key: string) {
        // check if the key is in the character.settings.secrets object
        if (this.character.settings?.secrets?.[key]) {
            return this.character.settings.secrets[key];
        }
        // if not, check if it's in the settings object
        if (this.character.settings?.[key]) {
            return this.character.settings[key];
        }

        // if not, check if it's in the settings object
        if (settings[key]) {
            return settings[key];
        }

        return null;
    }

    /**
     * Get the number of messages that are kept in the conversation buffer.
     * @returns The number of recent messages to be kept in memory.
     */
    getConversationLength() {
        return this.#conversationLength;
    }

    /**
     * Register an action for the agent to perform.
     * @param action The action to register.
     */
    registerAction(action: Action) {
        elizaLogger.success(`${this.character.name}(${this.agentId}) - Registering action: ${action.name}`);
        this.actions.push(action);
    }

    /**
     * Register an evaluator to assess and guide the agent's responses.
     * @param evaluator The evaluator to register.
     */
    registerEvaluator(evaluator: Evaluator) {
        this.evaluators.push(evaluator);
    }

    /**
     * Register a context provider to provide context for message generation.
     * @param provider The context provider to register.
     */
    registerContextProvider(provider: Provider) {
        this.providers.push(provider);
    }

    /**
     * Register an adapter for the agent to use.
     * @param adapter The adapter to register.
     */
    registerAdapter(adapter: Adapter) {
        this.adapters.push(adapter);
    }

    /**
     * Process the actions of a message.
     * @param message The message to process.
     * @param content The content of the message to process actions from.
     */
    async processActions(
        message: Memory,
        responses: Memory[],
        state?: State,
        callback?: HandlerCallback,
    ): Promise<void> {
        for (const response of responses) {
            if (!response.content?.action) {
                elizaLogger.warn("No action found in the response content.");
                continue;
            }

            const normalizedAction = response.content.action
                .toLowerCase()
                .replace("_", "");

            elizaLogger.success(`Normalized action: ${normalizedAction}`);

            let action = this.actions.find(
                (a: { name: string }) =>
                    a.name
                        .toLowerCase()
                        .replace("_", "")
                        .includes(normalizedAction) ||
                    normalizedAction.includes(
                        a.name.toLowerCase().replace("_", ""),
                    ),
            );

            if (!action) {
                elizaLogger.info("Attempting to find action in similes.");
                for (const _action of this.actions) {
                    const simileAction = _action.similes.find(
                        (simile) =>
                            simile
                                .toLowerCase()
                                .replace("_", "")
                                .includes(normalizedAction) ||
                            normalizedAction.includes(
                                simile.toLowerCase().replace("_", ""),
                            ),
                    );
                    if (simileAction) {
                        action = _action;
                        elizaLogger.success(
                            `Action found in similes: ${action.name}`,
                        );
                        break;
                    }
                }
            }

            if (!action) {
                elizaLogger.error(
                    "No action found for",
                    response.content.action,
                );
                continue;
            }

            if (!action.handler) {
                elizaLogger.error(`Action ${action.name} has no handler.`);
                continue;
            }

            try {
                elizaLogger.info(
                    `Executing handler for action: ${action.name}`,
                );
                await action.handler(this, message, state, {}, callback);
            } catch (error) {
                elizaLogger.error(error);
            }
        }
    }

    /**
     * Evaluate the message and state using the registered evaluators.
     * @param message The message to evaluate.
     * @param state The state of the agent.
     * @param didRespond Whether the agent responded to the message.~
     * @param callback The handler callback
     * @returns The results of the evaluation.
     */
    async evaluate(
        message: Memory,
        state: State,
        didRespond?: boolean,
        callback?: HandlerCallback,
    ) {
        const evaluatorPromises = this.evaluators.map(
            async (evaluator: Evaluator) => {
                elizaLogger.log("Evaluating", evaluator.name);
                if (!evaluator.handler) {
                    return null;
                }
                if (!didRespond && !evaluator.alwaysRun) {
                    return null;
                }
                const result = await evaluator.validate(this, message, state);
                if (result) {
                    return evaluator;
                }
                return null;
            },
        );

        const resolvedEvaluators = await Promise.all(evaluatorPromises);
        const evaluatorsData = resolvedEvaluators.filter(
            (evaluator): evaluator is Evaluator => evaluator !== null,
        );

        // if there are no evaluators this frame, return
        if (!evaluatorsData || evaluatorsData.length === 0) {
            return [];
        }

        const context = composeContext({
            state: {
                ...state,
                evaluators: formatEvaluators(evaluatorsData),
                evaluatorNames: formatEvaluatorNames(evaluatorsData),
            },
            template:
                this.character.templates?.evaluationTemplate ||
                evaluationTemplate,
        });

        const result = await generateText({
            runtime: this,
            context,
            modelClass: ModelClass.SMALL,
            // verifiableInferenceAdapter: this.verifiableInferenceAdapter,
        });

        const evaluators = parseJsonArrayFromText(
            result,
        ) as unknown as string[];

        for (const evaluator of this.evaluators) {
            if (!evaluators?.includes(evaluator.name)) continue;

            if (evaluator.handler)
                await evaluator.handler(this, message, state, {}, callback);
        }

        return evaluators;
    }

    /**
     * Ensure the existence of a participant in the room. If the participant does not exist, they are added to the room.
     * @param userId - The user ID to ensure the existence of.
     * @throws An error if the participant cannot be added.
     */
    async ensureParticipantExists(userId: UUID, roomId: UUID) {
        const participants =
            await this.databaseAdapter.getParticipantsForAccount(userId);

        if (participants?.length === 0) {
            await this.databaseAdapter.addParticipant(userId, roomId);
        }
    }

    /**
     * Ensure the existence of a user in the database. If the user does not exist, they are added to the database.
     * @param userId - The user ID to ensure the existence of.
     * @param userName - The user name to ensure the existence of.
     * @returns
     */

    async ensureUserExists(
        userId: UUID,
        userName: string | null,
        name: string | null,
        email?: string | null,
        source?: string | null,
    ) {
        const account = await this.databaseAdapter.getAccountById(userId);
        if (!account) {
            await this.databaseAdapter.createAccount({
                id: userId,
                name: name || this.character.name || "Unknown User",
                username: userName || this.character.username || "Unknown",
                // TODO: We might not need these account pieces
                email: email || this.character.email || userId,
                // When invoke ensureUserExists and saving account.details
                // Performing a complete JSON.stringify on character will cause a TypeError: Converting circular structure to JSON error in some more complex plugins.
                details: this.character ? Object.assign({}, this.character, {
                    source,
                    plugins: this.character?.plugins?.map((plugin) => plugin.name),
                }) : { summary: "" },
            });
            elizaLogger.success(`User ${userName} created successfully.`);
        }
    }

    async ensureParticipantInRoom(userId: UUID, roomId: UUID) {
        const participants =
            await this.databaseAdapter.getParticipantsForRoom(roomId);
        if (!participants.includes(userId)) {
            await this.databaseAdapter.addParticipant(userId, roomId);
            if (userId === this.agentId) {
                elizaLogger.log(
                    `Agent ${this.character.name} linked to room ${roomId} successfully.`,
                );
            } else {
                elizaLogger.log(
                    `User ${userId} linked to room ${roomId} successfully.`,
                );
            }
        }
    }

    async ensureConnection(
        userId: UUID,
        roomId: UUID,
        userName?: string,
        userScreenName?: string,
        source?: string,
    ) {
        await Promise.all([
            this.ensureUserExists(
                this.agentId,
                this.character.username ?? "Agent",
                this.character.name ?? "Agent",
                source,
            ),
            this.ensureUserExists(
                userId,
                userName ?? "User" + userId,
                userScreenName ?? "User" + userId,
                source,
            ),
            this.ensureRoomExists(roomId),
        ]);

        await Promise.all([
            this.ensureParticipantInRoom(userId, roomId),
            this.ensureParticipantInRoom(this.agentId, roomId),
        ]);
    }

    /**
     * Ensure the existence of a room between the agent and a user. If no room exists, a new room is created and the user
     * and agent are added as participants. The room ID is returned.
     * @param userId - The user ID to create a room with.
     * @returns The room ID of the room between the agent and the user.
     * @throws An error if the room cannot be created.
     */
    async ensureRoomExists(roomId: UUID) {
        const room = await this.databaseAdapter.getRoom(roomId);
        if (!room) {
            await this.databaseAdapter.createRoom(roomId);
            elizaLogger.log(`Room ${roomId} created successfully.`);
        }
    }

    /**
     * Compose the state of the agent into an object that can be passed or used for response generation.
     * @param message The message to compose the state from.
     * @returns The state of the agent.
     */
    async composeState(
        message: Memory,
        additionalKeys: { [key: string]: unknown } = {},
    ) {
        const { userId, roomId } = message;

        const conversationLength = this.getConversationLength();

        const [actorsData, recentMessagesData, goalsData]: [
            Actor[],
            Memory[],
            Goal[],
        ] = await Promise.all([
            getActorDetails({ runtime: this, roomId }),
            this.messageManager.getMemories({
                roomId,
                count: conversationLength,
                unique: false,
            }),
            getGoals({
                runtime: this,
                count: 10,
                onlyInProgress: false,
                roomId,
            }),
        ]);

        const goals = formatGoalsAsString({ goals: goalsData });

        const actors = formatActors({ actors: actorsData ?? [] });

        const recentMessages = formatMessages({
            messages: recentMessagesData,
            actors: actorsData,
        });

        const recentPosts = formatPosts({
            messages: recentMessagesData,
            actors: actorsData,
            conversationHeader: false,
        });

        // const lore = formatLore(loreData);

        const senderName = actorsData?.find(
            (actor: Actor) => actor.id === userId,
        )?.name;

        // TODO: We may wish to consolidate and just accept character.name here instead of the actor name
        const agentName =
            actorsData?.find((actor: Actor) => actor.id === this.agentId)
                ?.name || this.character.name;

        let allAttachments = message.content.attachments || [];

        if (recentMessagesData && Array.isArray(recentMessagesData)) {
            const lastMessageWithAttachment = recentMessagesData.find(
                (msg) =>
                    msg.content.attachments &&
                    msg.content.attachments.length > 0,
            );

            if (lastMessageWithAttachment) {
                const lastMessageTime =
                    lastMessageWithAttachment?.createdAt ?? Date.now();
                const oneHourBeforeLastMessage =
                    lastMessageTime - 60 * 60 * 1000; // 1 hour before last message

                allAttachments = recentMessagesData.reverse().flatMap((msg) => {
                    const msgTime = msg.createdAt ?? Date.now();
                    const isWithinTime = msgTime >= oneHourBeforeLastMessage;
                    const attachments = msg.content.attachments || [];
                    if (!isWithinTime) {
                        attachments.forEach((attachment) => {
                            attachment.text = "[Hidden]";
                        });
                    }
                    return attachments;
                });
            }
        }

        const formattedAttachments = allAttachments
            .map(
                (attachment) =>
                    `ID: ${attachment.id}
Name: ${attachment.title}
URL: ${attachment.url}
Type: ${attachment.source}
Description: ${attachment.description}
Text: ${attachment.text}
  `,
            )
            .join("\n");

        // randomly get 3 bits of lore and join them into a paragraph, divided by \n
        let lore = "";
        // Assuming this.lore is an array of lore bits
        if (this.character.lore && this.character.lore.length > 0) {
            const shuffledLore = [...this.character.lore].sort(
                () => Math.random() - 0.5,
            );
            const selectedLore = shuffledLore.slice(0, 10);
            lore = selectedLore.join("\n");
        }

        const formattedCharacterPostExamples = this.character.postExamples
            .sort(() => 0.5 - Math.random())
            .map((post) => {
                const messageString = `${post}`;
                return messageString;
            })
            .slice(0, 50)
            .join("\n");

        const formattedCharacterMessageExamples = this.character.messageExamples
            .sort(() => 0.5 - Math.random())
            .slice(0, 5)
            .map((example) => {
                const exampleNames = Array.from({ length: 5 }, () =>
                    uniqueNamesGenerator({ dictionaries: [names] }),
                );

                return example
                    .map((message) => {
                        let messageString = `${message.user}: ${message.content.text}`;
                        exampleNames.forEach((name, index) => {
                            const placeholder = `{{user${index + 1}}}`;
                            messageString = messageString.replaceAll(
                                placeholder,
                                name,
                            );
                        });
                        return messageString;
                    })
                    .join("\n");
            })
            .join("\n\n");

        const getRecentInteractions = async (
            userA: UUID,
            userB: UUID,
        ): Promise<Memory[]> => {
            // Find all rooms where userA and userB are participants
            const rooms = await this.databaseAdapter.getRoomsForParticipants([
                userA,
                userB,
            ]);

            // Check the existing memories in the database
            return this.messageManager.getMemoriesByRoomIds({
                // filter out the current room id from rooms
                roomIds: rooms.filter((room) => room !== roomId),
                limit: 20,
            });
        };

        const recentInteractions =
            userId !== this.agentId
                ? await getRecentInteractions(userId, this.agentId)
                : [];

        const getRecentMessageInteractions = async (
            recentInteractionsData: Memory[],
        ): Promise<string> => {
            // Format the recent messages
            const formattedInteractions = await Promise.all(
                recentInteractionsData.map(async (message) => {
                    const isSelf = message.userId === this.agentId;
                    let sender: string;
                    if (isSelf) {
                        sender = this.character.name;
                    } else {
                        const accountId =
                            await this.databaseAdapter.getAccountById(
                                message.userId,
                            );
                        sender = accountId?.username || "unknown";
                    }
                    return `${sender}: ${message.content.text}`;
                }),
            );

            return formattedInteractions.join("\n");
        };

        const formattedMessageInteractions =
            await getRecentMessageInteractions(recentInteractions);

        const getRecentPostInteractions = async (
            recentInteractionsData: Memory[],
            actors: Actor[],
        ): Promise<string> => {
            const formattedInteractions = formatPosts({
                messages: recentInteractionsData,
                actors,
                conversationHeader: true,
            });

            return formattedInteractions;
        };

        const formattedPostInteractions = await getRecentPostInteractions(
            recentInteractions,
            actorsData,
        );

        // if bio is a string, use it. if its an array, pick one at random
        let bio = this.character.bio || "";
        if (Array.isArray(bio)) {
            // get three random bio strings and join them with " "
            bio = bio
                .sort(() => 0.5 - Math.random())
                .slice(0, 3)
                .join(" ");
        }

        let knowledgeData = [];
        let formattedKnowledge = "";

        if (this.character.settings?.ragKnowledge) {
            const recentContext = recentMessagesData
                .sort((a, b) => b.createdAt - a.createdAt) // Sort by timestamp descending (newest first)
                .slice(0, 3) // Get the 3 most recent messages
                .reverse() // Reverse to get chronological order
                .map((msg) => msg.content.text)
                .join(" ");

            knowledgeData = await this.ragKnowledgeManager.getKnowledge({
                query: message.content.text,
                conversationContext: recentContext,
                limit: 8,
            });

            formattedKnowledge = formatKnowledge(knowledgeData);
=======
          console.warn(`Plugin ${plugin.name} requires configuration. ${errorMessage}`);
          console.warn(
            'Please check your environment variables and ensure all required API keys are set.'
          );
          console.warn('You can set these in your .env file.');
>>>>>>> 826a7d55bf98539c5bc1a2fa7a65aeaa03ffd76a
        } else {
          throw error;
        }
      }
    }
    if (plugin.adapter) {
      this.logger.debug(`Registering database adapter for plugin ${plugin.name}`);
      this.registerDatabaseAdapter(plugin.adapter);
    }
    if (plugin.actions) {
      for (const action of plugin.actions) {
        this.registerAction(action);
      }
    }
    if (plugin.evaluators) {
      for (const evaluator of plugin.evaluators) {
        this.registerEvaluator(evaluator);
      }
    }
    if (plugin.providers) {
      for (const provider of plugin.providers) {
        this.registerProvider(provider);
      }
    }
    if (plugin.models) {
      for (const [modelType, handler] of Object.entries(plugin.models)) {
        this.registerModel(
          modelType as ModelTypeName,
          handler as (params: any) => Promise<any>,
          plugin.name,
          plugin?.priority
        );
      }
    }
    if (plugin.routes) {
      for (const route of plugin.routes) {
        this.routes.push(route);
      }
    }
    if (plugin.events) {
      for (const [eventName, eventHandlers] of Object.entries(plugin.events)) {
        for (const eventHandler of eventHandlers) {
          this.registerEvent(eventName, eventHandler);
        }
      }
    }
    if (plugin.services) {
      for (const service of plugin.services) {
        // ensure we have a promise, so when it's actually loaded via registerService,
        // we can trigger the loading of service dependencies
        if (!this.servicePromises.has(service.serviceType)) {
          this._createServiceResolver(service.serviceType as ServiceTypeName);
        }

        if (this.isInitialized) {
          await this.registerService(service);
        } else {
          this.servicesInitQueue.add(service);
        }
      }
    }
  }

  getAllServices(): Map<ServiceTypeName, Service[]> {
    return this.services;
  }

  async stop() {
    this.logger.debug(`runtime::stop - character ${this.character.name}`);
    for (const [serviceName, services] of this.services) {
      this.logger.debug(`runtime::stop - requesting service stop for ${serviceName}`);
      for (const service of services) {
        await service.stop();
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Agent already initialized');
      return;
    }
    const pluginRegistrationPromises: Promise<void>[] = [];

    // The resolution is now expected to happen in the CLI layer (e.g., startAgent)
    // The runtime now accepts a pre-resolved, ordered list of plugins.
    const pluginsToLoad = this.characterPlugins;

    for (const plugin of pluginsToLoad) {
      if (plugin) {
        pluginRegistrationPromises.push(this.registerPlugin(plugin));
      }
    }
    await Promise.all(pluginRegistrationPromises);

    if (!this.adapter) {
      this.logger.error(
        'Database adapter not initialized. Make sure @elizaos/plugin-sql is included in your plugins.'
      );
      throw new Error(
        'Database adapter not initialized. The SQL plugin (@elizaos/plugin-sql) is required for agent initialization. Please ensure it is included in your character configuration.'
      );
    }
    try {
      await this.adapter.init();

      // Run migrations for all loaded plugins
      this.logger.info('Running plugin migrations...');
      await this.runPluginMigrations();
      this.logger.info('Plugin migrations completed.');

      const existingAgent = await this.ensureAgentExists(this.character as Partial<Agent>);
      if (!existingAgent) {
        const errorMsg = `Agent ${this.character.name} does not exist in database after ensureAgentExists call`;
        throw new Error(errorMsg);
      }

      // No need to transform agent's own ID
      let agentEntity = await this.getEntityById(this.agentId);

      if (!agentEntity) {
        const created = await this.createEntity({
          id: this.agentId,
          names: [this.character.name],
          metadata: {},
          agentId: existingAgent.id!,
        });
        if (!created) {
          const errorMsg = `Failed to create entity for agent ${this.agentId}`;
          throw new Error(errorMsg);
        }

        agentEntity = await this.getEntityById(this.agentId);
        if (!agentEntity) throw new Error(`Agent entity not found for ${this.agentId}`);

        this.logger.debug(`Success: Agent entity created successfully for ${this.character.name}`);
      }
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create agent entity: ${errorMsg}`);
      throw error;
    }
    try {
      // Room creation and participant setup
      const room = await this.getRoom(this.agentId);
      if (!room) {
        await this.createRoom({
          id: this.agentId,
          name: this.character.name,
          source: 'elizaos',
          type: ChannelType.SELF,
          channelId: this.agentId,
          serverId: this.agentId,
          worldId: this.agentId,
        });
      }
      const participants = await this.adapter.getParticipantsForRoom(this.agentId);
      if (!participants.includes(this.agentId)) {
        const added = await this.addParticipant(this.agentId, this.agentId);
        if (!added) {
          const errorMsg = `Failed to add agent ${this.agentId} as participant to its own room`;
          throw new Error(errorMsg);
        }
        this.logger.debug(`Agent ${this.character.name} linked to its own room successfully`);
      }
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to add agent as participant: ${errorMsg}`);
      throw error;
    }
    const embeddingModel = this.getModel(ModelType.TEXT_EMBEDDING);
    if (!embeddingModel) {
      this.logger.warn(
        `[AgentRuntime][${this.character.name}] No TEXT_EMBEDDING model registered. Skipping embedding dimension setup.`
      );
    } else {
      await this.ensureEmbeddingDimension();
    }
    for (const service of this.servicesInitQueue) {
      await this.registerService(service);
    }
    this.isInitialized = true;
    if (this.initResolver) {
      this.initResolver(); // resolve initPromise
    }
  }

  async runPluginMigrations(): Promise<void> {
    const drizzle = (this.adapter as any)?.db;
    if (!drizzle) {
      this.logger.warn('Drizzle instance not found on adapter, skipping plugin migrations.');
      return;
    }

    const pluginsWithSchemas = this.plugins.filter((p) => p.schema);
    this.logger.info(`Found ${pluginsWithSchemas.length} plugins with schemas to migrate.`);

    for (const p of pluginsWithSchemas) {
      if (p.schema) {
        this.logger.info(`Running migrations for plugin: ${p.name}`);
        try {
          // You might need a more generic way to run migrations if they are not all Drizzle-based
          // For now, assuming a function on the adapter or a utility function
          if (this.adapter && 'runMigrations' in this.adapter) {
            await (this.adapter as any).runMigrations(p.schema, p.name);
            this.logger.info(`Successfully migrated plugin: ${p.name}`);
          }
        } catch (error) {
          this.logger.error(
            error instanceof Error ? error : new Error(String(error)),
            `Failed to migrate plugin ${p.name}`
          );
          // Decide if you want to throw or continue
        }
      }
    }
  }

  async getConnection(): Promise<unknown> {
    // Updated return type
    if (!this.adapter) {
      throw new Error('Database adapter not registered');
    }
    return this.adapter.getConnection();
  }

  setSetting(key: string, value: string | boolean | null | any, secret = false) {
    if (secret) {
      if (!this.character.secrets) {
        this.character.secrets = {};
      }
      this.character.secrets[key] = value;
    } else {
      if (!this.character.settings) {
        this.character.settings = {};
      }
      this.character.settings[key] = value;
    }
  }

  getSetting(key: string): string | boolean | null | any {
    const value =
      this.character.secrets?.[key] ||
      this.character.settings?.[key] ||
      (typeof this.character.settings === 'object' &&
        this.character.settings !== null &&
        'secrets' in this.character.settings &&
        (this.character.settings as Record<string, any>).secrets?.[key]) ||
      this.settings[key];
    const decryptedValue = decryptSecret(value, getSalt());
    if (decryptedValue === 'true') return true;
    if (decryptedValue === 'false') return false;
    return decryptedValue || null;
  }

  getConversationLength() {
    return this.#conversationLength;
  }

  registerDatabaseAdapter(adapter: IDatabaseAdapter) {
    if (this.adapter) {
      this.logger.warn(
        'Database adapter already registered. Additional adapters will be ignored. This may lead to unexpected behavior.'
      );
    } else {
      this.adapter = adapter;
      this.logger.debug('Success: Database adapter registered successfully.');
    }
  }

  registerProvider(provider: Provider) {
    this.providers.push(provider);
    this.logger.debug(`Success: Provider ${provider.name} registered successfully.`);
  }

  registerAction(action: Action) {
    if (this.actions.find((a) => a.name === action.name)) {
      this.logger.warn(
        `${this.character.name}(${this.agentId}) - Action ${action.name} already exists. Skipping registration.`
      );
    } else {
      try {
        this.actions.push(action);
        this.logger.success(
          `${this.character.name}(${this.agentId}) - Action ${action.name} registered successfully.`
        );
      } catch (e) {
        console.error('Error registering action', e);
      }
    }
  }

  registerEvaluator(evaluator: Evaluator) {
    this.evaluators.push(evaluator);
  }

  // Helper functions for immutable action plan updates
  private updateActionPlan<T>(plan: T, updates: Partial<T>): T {
    return { ...plan, ...updates };
  }

  private updateActionStep<T, S>(
    plan: T & { steps: S[] },
    index: number,
    stepUpdates: Partial<S>
  ): T & { steps: S[] } {
    // Add bounds checking
    if (!plan.steps || index < 0 || index >= plan.steps.length) {
      this.logger.warn(
        `Invalid step index: ${index} for plan with ${plan.steps?.length || 0} steps`
      );
      return plan;
    }
    return {
      ...plan,
      steps: plan.steps.map((step: S, i: number) =>
        i === index ? { ...step, ...stepUpdates } : step
      ),
    };
  }

  async processActions(
    message: Memory,
    responses: Memory[],
    state?: State,
    callback?: HandlerCallback
  ): Promise<void> {
    // Determine if we have multiple actions to execute
    const allActions: string[] = [];
    for (const response of responses) {
      if (response.content?.actions && response.content.actions.length > 0) {
        allActions.push(...response.content.actions);
      }
    }

    const hasMultipleActions = allActions.length > 1;
    const runId = this.createRunId();

    // Create action plan if multiple actions
    let actionPlan: {
      runId: UUID;
      totalSteps: number;
      currentStep: number;
      steps: Array<{
        action: string;
        status: 'pending' | 'completed' | 'failed';
        result?: ActionResult;
        error?: string;
      }>;
      thought: string;
      startTime: number;
    } | null = null;

    if (hasMultipleActions) {
      // Extract thought from response content
      const thought =
        responses[0]?.content?.thought ||
        `Executing ${allActions.length} actions: ${allActions.join(', ')}`;

      actionPlan = {
        runId,
        totalSteps: allActions.length,
        currentStep: 0,
        steps: allActions.map((action) => ({
          action,
          status: 'pending' as const,
        })),
        thought,
        startTime: Date.now(),
      };
    }

    let actionIndex = 0;

    for (const response of responses) {
      if (!response.content?.actions || response.content.actions.length === 0) {
        this.logger.warn('No action found in the response content.');
        continue;
      }
      const actions = response.content.actions;

      // Initialize action results array for this run
      const actionResults: ActionResult[] = [];
      let accumulatedState = state;

      function normalizeAction(actionString: string) {
        return actionString.toLowerCase().replace(/_/g, '');
      }
      this.logger.debug(`Found actions: ${this.actions.map((a) => normalizeAction(a.name))}`);

      for (const responseAction of actions) {
        // Update current step in plan immutably
        if (actionPlan) {
          actionPlan = this.updateActionPlan(actionPlan, { currentStep: actionIndex + 1 });
        }

        // Compose state with previous action results and plan
        accumulatedState = await this.composeState(message, [
          'RECENT_MESSAGES',
          'ACTION_STATE', // This will include the action plan
        ]);

        // Add action plan to state if it exists
        if (actionPlan && accumulatedState.data) {
          accumulatedState.data.actionPlan = actionPlan;
          accumulatedState.data.actionResults = actionResults;
        }

        this.logger.debug(`Success: Calling action: ${responseAction}`);
        const normalizedResponseAction = normalizeAction(responseAction);

        // First try exact match
        let action = this.actions.find(
          (a: { name: string }) => normalizeAction(a.name) === normalizedResponseAction
        );

        if (!action) {
          // Then try fuzzy matching
          action = this.actions.find(
            (a: { name: string }) =>
              normalizeAction(a.name).includes(normalizedResponseAction) ||
              normalizedResponseAction.includes(normalizeAction(a.name))
          );
        }

        if (action) {
          this.logger.debug(`Success: Found action: ${action?.name}`);
        } else {
          this.logger.debug('Attempting to find action in similes.');
          for (const _action of this.actions) {
            // First try exact match in similes
            const exactSimileMatch = _action.similes?.find(
              (simile) => normalizeAction(simile) === normalizedResponseAction
            );

            if (exactSimileMatch) {
              action = _action;
              this.logger.debug(`Success: Action found in similes (exact match): ${action.name}`);
              break;
            }

            // Then try fuzzy match in similes
            const fuzzySimileMatch = _action.similes?.find(
              (simile) =>
                normalizeAction(simile).includes(normalizedResponseAction) ||
                normalizedResponseAction.includes(normalizeAction(simile))
            );

            if (fuzzySimileMatch) {
              action = _action;
              this.logger.debug(`Success: Action found in similes (fuzzy match): ${action.name}`);
              break;
            }
          }
        }
        if (!action) {
          const errorMsg = `No action found for: ${responseAction}`;
          this.logger.error(errorMsg);

          // Update plan with error immutably
          if (actionPlan && actionPlan.steps[actionIndex]) {
            actionPlan = this.updateActionStep(actionPlan, actionIndex, {
              status: 'failed',
              error: errorMsg,
            });
          }

          const actionMemory: Memory = {
            id: uuidv4() as UUID,
            entityId: message.entityId,
            roomId: message.roomId,
            worldId: message.worldId,
            content: {
              thought: errorMsg,
              source: 'auto',
              type: 'action_result',
              actionName: responseAction,
              actionStatus: 'failed',
              runId,
            },
          };
          await this.createMemory(actionMemory, 'messages');
          actionIndex++;
          continue;
        }
        if (!action.handler) {
          this.logger.error(`Action ${action.name} has no handler.`);

          // Update plan with error immutably
          if (actionPlan && actionPlan.steps[actionIndex]) {
            actionPlan = this.updateActionStep(actionPlan, actionIndex, {
              status: 'failed',
              error: 'No handler',
            });
          }

          actionIndex++;
          continue;
        }
        try {
          this.logger.debug(`Executing handler for action: ${action.name}`);

          // Start tracking this action's execution
          const actionId = uuidv4() as UUID;
          this.currentActionContext = {
            actionName: action.name,
            actionId,
            prompts: [],
          };

          // Create action context with plan information
          const actionContext: ActionContext = {
            previousResults: actionResults,
            getPreviousResult: (actionName: string) => {
              return actionResults.find((r) => r.data?.actionName === actionName);
            },
          };

          // Add plan information to options if multiple actions
          const options: { [key: string]: unknown } = {
            context: actionContext,
          };

          if (actionPlan) {
            options.actionPlan = {
              totalSteps: actionPlan.totalSteps,
              currentStep: actionPlan.currentStep,
              steps: actionPlan.steps,
              thought: actionPlan.thought,
            };
          }

          // Execute action with context
          const result = await action.handler(
            this,
            message,
            accumulatedState,
            options,
            callback,
            responses
          );

          // Handle backward compatibility for void, null, true, false returns
          const isLegacyReturn =
            result === undefined || result === null || typeof result === 'boolean';

          // Only create ActionResult if we have a proper result
          let actionResult: ActionResult | null = null;

          if (!isLegacyReturn) {
            // Ensure we have an ActionResult with required success field
            if (
              typeof result === 'object' &&
              result !== null &&
              ('values' in result || 'data' in result || 'text' in result)
            ) {
              // Ensure success field exists with default true
              actionResult = {
                ...result,
                success: 'success' in result ? result.success : true, // Default to true if not specified
              } as ActionResult;
            } else {
              actionResult = {
                success: true, // Default success for legacy results
                data: {
                  actionName: action.name,
                  legacyResult: result,
                },
              };
            }

            actionResults.push(actionResult);

            // Merge returned values into state
            if (actionResult.values) {
              accumulatedState = {
                ...accumulatedState,
                values: { ...accumulatedState.values, ...actionResult.values },
                data: {
                  ...(accumulatedState.data || {}),
                  actionResults: [...(accumulatedState.data?.actionResults || []), actionResult],
                  actionPlan,
                },
              };
            }

            // Store in working memory (in state data) with cleanup
            if (actionResult && accumulatedState.data) {
              if (!accumulatedState.data.workingMemory) accumulatedState.data.workingMemory = {};

              // Add new entry first, then clean up if we exceed the limit
              const memoryKey = `action_${responseAction}_${uuidv4()}`;
              const memoryEntry: WorkingMemoryEntry = {
                actionName: action.name,
                result: actionResult,
                timestamp: Date.now(),
              };
              accumulatedState.data.workingMemory[memoryKey] = memoryEntry;

              // Clean up old entries if we now exceed the limit
              const entries = Object.entries(accumulatedState.data.workingMemory);
              if (entries.length > this.maxWorkingMemoryEntries) {
                // Sort by timestamp (newest first) and keep only the most recent entries
                const sorted = entries.sort((a, b) => {
                  const entryA = a[1] as WorkingMemoryEntry | null;
                  const entryB = b[1] as WorkingMemoryEntry | null;
                  const timestampA = entryA?.timestamp ?? 0;
                  const timestampB = entryB?.timestamp ?? 0;
                  return timestampB - timestampA;
                });
                // Keep exactly maxWorkingMemoryEntries entries (including the new one we just added)
                accumulatedState.data.workingMemory = Object.fromEntries(
                  sorted.slice(0, this.maxWorkingMemoryEntries)
                );
              }
            }

            // Update plan with success immutably
            if (actionPlan && actionPlan.steps[actionIndex]) {
              actionPlan = this.updateActionStep(actionPlan, actionIndex, {
                status: 'completed',
                result: actionResult,
              });
            }
          }

          // Store action result as memory
          const actionMemory: Memory = {
            id: actionId,
            entityId: this.agentId,
            roomId: message.roomId,
            worldId: message.worldId,
            content: {
              text: actionResult?.text || `Executed action: ${action.name}`,
              source: 'action',
              type: 'action_result',
              actionName: action.name,
              actionStatus: actionResult?.success ? 'completed' : 'failed',
              actionResult: isLegacyReturn ? { legacy: result } : actionResult,
              runId,
              ...(actionPlan && {
                planStep: `${actionPlan.currentStep}/${actionPlan.totalSteps}`,
                planThought: actionPlan.thought,
              }),
            },
            metadata: {
              type: 'action_result',
              actionName: action.name,
              runId,
              actionId,
              ...(actionPlan && {
                totalSteps: actionPlan.totalSteps,
                currentStep: actionPlan.currentStep,
              }),
            },
          };
          await this.createMemory(actionMemory, 'messages');

          this.logger.debug(
            `Action ${action.name} completed`,
            JSON.stringify({
              isLegacyReturn,
              result: isLegacyReturn ? result : undefined,
              hasValues: actionResult ? !!actionResult.values : false,
              hasData: actionResult ? !!actionResult.data : false,
              hasText: actionResult ? !!actionResult.text : false,
            })
          );

          // log to database with collected prompts
          await this.adapter.log({
            entityId: message.entityId,
            roomId: message.roomId,
            type: 'action',
            body: {
              action: action.name,
              actionId,
              message: message.content.text,
              messageId: message.id,
              state: accumulatedState,
              responses,
              result: isLegacyReturn ? { legacy: result } : actionResult,
              isLegacyReturn,
              prompts: this.currentActionContext?.prompts || [],
              promptCount: this.currentActionContext?.prompts.length || 0,
              runId,
              ...(actionPlan && {
                planStep: `${actionPlan.currentStep}/${actionPlan.totalSteps}`,
                planThought: actionPlan.thought,
              }),
            },
          });

          // Clear action context
          this.currentActionContext = undefined;
        } catch (error: any) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(error);

          // Update plan with error using immutable pattern
          if (actionPlan && actionPlan.steps[actionIndex]) {
            actionPlan = this.updateActionStep(actionPlan, actionIndex, {
              status: 'failed',
              error: errorMessage,
            });
          }

          // Clear action context on error
          this.currentActionContext = undefined;

          // Create error result
          const errorResult: ActionResult = {
            success: false, // Required field
            data: {
              actionName: action.name,
              error: errorMessage,
              errorObject: error,
            },
          };
          actionResults.push(errorResult);

          const actionMemory: Memory = {
            id: uuidv4() as UUID,
            content: {
              thought: errorMessage,
              source: 'auto',
              type: 'action_result',
              actionName: action.name,
              actionStatus: 'failed',
              error: errorMessage,
              runId,
              ...(actionPlan && {
                planStep: `${actionPlan.currentStep}/${actionPlan.totalSteps}`,
                planThought: actionPlan.thought,
              }),
            },
            entityId: this.agentId,
            roomId: message.roomId,
            worldId: message.worldId,
            metadata: {
              type: 'action_result',
              actionName: action.name,
              runId,
              error: true,
              ...(actionPlan && {
                totalSteps: actionPlan.totalSteps,
                currentStep: actionPlan.currentStep,
              }),
            },
          };
          await this.createMemory(actionMemory, 'messages');

          // Decide whether to continue or abort
          // For now, only abort on critical errors
          if (error?.critical || error?.code === 'CRITICAL_ERROR') {
            throw error;
          }
        }

        actionIndex++;
      }

      // Store accumulated results for evaluators and providers
      if (message.id) {
        this.stateCache.set(`${message.id}_action_results`, {
          values: { actionResults },
          data: { actionResults, actionPlan },
          text: JSON.stringify(actionResults),
        });
      }
    }
  }

  async evaluate(
    message: Memory,
    state: State,
    didRespond?: boolean,
    callback?: HandlerCallback,
    responses?: Memory[]
  ) {
    const evaluatorPromises = this.evaluators.map(async (evaluator: Evaluator) => {
      if (!evaluator.handler) {
        return null;
      }
      if (!didRespond && !evaluator.alwaysRun) {
        return null;
      }
      const result = await evaluator.validate(this, message, state);
      if (result) {
        return evaluator;
      }
      return null;
    });
    const evaluators = (await Promise.all(evaluatorPromises)).filter(Boolean) as Evaluator[];
    if (evaluators.length === 0) {
      return [];
    }
    state = await this.composeState(message, ['RECENT_MESSAGES', 'EVALUATORS']);
    await Promise.all(
      evaluators.map(async (evaluator) => {
        if (evaluator.handler) {
          await evaluator.handler(this, message, state, {}, callback, responses);
          this.adapter.log({
            entityId: message.entityId,
            roomId: message.roomId,
            type: 'evaluator',
            body: {
              evaluator: evaluator.name,
              messageId: message.id,
              message: message.content.text,
              state,
            },
          });
        }
      })
    );
    return evaluators;
  }

  // highly SQL optimized queries
  async ensureConnections(
    entities: any[],
    rooms: any[],
    source: string,
    world: any
  ): Promise<void> {
    // guards
    if (!entities) {
      console.trace();
      this.logger.error('ensureConnections - no entities');
      return;
    }
    if (!rooms || rooms.length === 0) {
      console.trace();
      this.logger.error('ensureConnections - no rooms');
      return;
    }

    // Create/ensure the world exists for this server
    await this.ensureWorldExists({ ...world, agentId: this.agentId });

    const firstRoom = rooms[0];

    // Helper function for chunking arrays
    const chunkArray = (arr: any[], size: number) =>
      arr.reduce((chunks: any[][], item: any, i: number) => {
        if (i % size === 0) chunks.push([]);
        chunks[chunks.length - 1].push(item);
        return chunks;
      }, []);

    // Step 1: Create all rooms FIRST (before adding any participants)
    const roomIds = rooms.map((r: any) => r.id);
    const roomExistsCheck = await this.getRoomsByIds(roomIds);
    const roomsIdExists = roomExistsCheck?.map((r: any) => r.id);
    const roomsToCreate = roomIds.filter((id: any) => !roomsIdExists?.includes(id));

    const rf = {
      worldId: world.id,
      serverId: world.serverId,
      source,
      agentId: this.agentId,
    };

    if (roomsToCreate.length) {
      this.logger.debug(
        'runtime/ensureConnections - create',
        roomsToCreate.length.toLocaleString(),
        'rooms'
      );
      const roomObjsToCreate = rooms
        .filter((r: any) => roomsToCreate.includes(r.id))
        .map((r: any) => ({ ...r, ...rf }));
      await this.createRooms(roomObjsToCreate);
    }

    // Step 2: Create all entities
    const entityIds = entities.map((e: any) => e.id);
    const entityExistsCheck = await this.adapter.getEntitiesByIds(entityIds);
    const entitiesToUpdate = entityExistsCheck?.map((e: any) => e.id);
    const entitiesToCreate = entities.filter((e: any) => !entitiesToUpdate?.includes(e.id));

    const r = {
      roomId: firstRoom.id,
      channelId: firstRoom.channelId,
      type: firstRoom.type,
    };
    const wf = {
      worldId: world.id,
      serverId: world.serverId,
    };

    if (entitiesToCreate.length) {
      this.logger.debug(
        'runtime/ensureConnections - creating',
        entitiesToCreate.length.toLocaleString(),
        'entities...'
      );
      const ef = {
        ...r,
        ...wf,
        source,
        agentId: this.agentId,
      };
      const entitiesToCreateWFields = entitiesToCreate.map((e: any) => ({ ...e, ...ef }));
      // pglite doesn't like over 10k records
      const batches = chunkArray(entitiesToCreateWFields, 5000);
      for (const batch of batches) {
        await this.createEntities(batch);
      }
    }

    // Step 3: Now add all participants (rooms and entities must exist by now)
    // Always add the agent to the first room
    await this.ensureParticipantInRoom(this.agentId, firstRoom.id);

    // Add all entities to the first room
    const entityIdsInFirstRoom = await this.getParticipantsForRoom(firstRoom.id);
    const entityIdsInFirstRoomFiltered = entityIdsInFirstRoom.filter(Boolean);
    const missingIdsInRoom = entityIds.filter(
      (id: any) => !entityIdsInFirstRoomFiltered.includes(id)
    );

    if (missingIdsInRoom.length) {
      this.logger.debug(
        'runtime/ensureConnections - Missing',
        missingIdsInRoom.length.toLocaleString(),
        'connections in',
        firstRoom.id
      );
      // pglite handle this at over 10k records fine though
      const batches = chunkArray(missingIdsInRoom, 5000);
      for (const batch of batches) {
        await this.addParticipantsRoom(batch, firstRoom.id);
      }
    }

    this.logger.success(`Success: Successfully connected world`);
  }

  async ensureConnection({
    entityId,
    roomId,
    worldId,
    worldName,
    userName,
    name,
    source,
    type,
    channelId,
    serverId,
    userId,
    metadata,
  }: {
    entityId: UUID;
    roomId: UUID;
    worldId: UUID;
    worldName?: string;
    userName?: string;
    name?: string;
    source?: string;
    type?: ChannelType;
    channelId?: string;
    serverId?: string;
    userId?: UUID;
    metadata?: Record<string, any>;
  }) {
    if (!worldId && serverId) {
      worldId = createUniqueUuid(this, serverId);
    }
    const names = [name, userName].filter(Boolean) as string[];
    const entityMetadata = {
      [source!]: {
        id: userId,
        name: name,
        userName: userName,
      },
    };
    try {
      // First check if the entity exists
      const entity = await this.getEntityById(entityId);

      if (!entity) {
        try {
          const success = await this.createEntity({
            id: entityId,
            names,
            metadata: entityMetadata,
            agentId: this.agentId,
          });
          if (success) {
            this.logger.debug(
              `Created new entity ${entityId} for user ${name || userName || 'unknown'}`
            );
          } else {
            throw new Error(`Failed to create entity ${entityId}`);
          }
        } catch (error: any) {
          if (error.message?.includes('duplicate key') || error.code === '23505') {
            this.logger.debug(
              `Entity ${entityId} exists in database but not for this agent. This is normal in multi-agent setups.`
            );
          } else {
            throw error;
          }
        }
      } else {
        await this.adapter.updateEntity({
          id: entityId,
          names: [...new Set([...(entity.names || []), ...names])].filter(Boolean) as string[],
          metadata: {
            ...entity.metadata,
            [source!]: {
              ...(entity.metadata?.[source!] as Record<string, any>),
              id: userId,
              name: name,
              userName: userName,
            },
          },
          agentId: this.agentId,
        });
      }
      await this.ensureWorldExists({
        id: worldId,
        name: worldName || serverId ? `World for server ${serverId}` : `World for room ${roomId}`,
        agentId: this.agentId,
        serverId: serverId || 'default',
        metadata,
      });
      await this.ensureRoomExists({
        id: roomId,
        name: name || 'default',
        source: source || 'default',
        type: type || ChannelType.DM,
        channelId,
        serverId,
        worldId,
      });
      try {
        await this.ensureParticipantInRoom(entityId, roomId);
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          const added = await this.addParticipant(entityId, roomId);
          if (!added) {
            throw new Error(`Failed to add participant ${entityId} to room ${roomId}`);
          }
          this.logger.debug(`Added participant ${entityId} to room ${roomId} directly`);
        } else {
          throw error;
        }
      }
      await this.ensureParticipantInRoom(this.agentId, roomId);

      this.logger.debug(`Success: Successfully connected entity ${entityId} in room ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Failed to ensure connection: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

<<<<<<< HEAD
const formatKnowledge = (knowledge: KnowledgeItem[]) => {
    // Group related content in a more natural way
    return knowledge.map(item => {
        // Get the main content text
        const text = item.content.text;

        // Clean up formatting but maintain natural text flow
        const cleanedText = text
            .trim()
            .replace(/\n{3,}/g, '\n\n'); // Replace excessive newlines

        return cleanedText;
    }).join('\n\n'); // Separate distinct pieces with double newlines
};
=======
  async ensureParticipantInRoom(entityId: UUID, roomId: UUID) {
    // Make sure entity exists in database before adding as participant
    const entity = await this.getEntityById(entityId);

    // If entity is not found but it's not the agent itself, we might still want to proceed
    // This can happen when an entity exists in the database but isn't associated with this agent
    if (!entity && entityId !== this.agentId) {
      this.logger.warn(
        `Entity ${entityId} not directly accessible to agent ${this.agentId}. Will attempt to add as participant anyway.`
      );
    } else if (!entity && entityId === this.agentId) {
      throw new Error(`Agent entity ${entityId} not found, cannot add as participant.`);
    } else if (!entity) {
      throw new Error(`User entity ${entityId} not found, cannot add as participant.`);
    }
    const participants = await this.adapter.getParticipantsForRoom(roomId);
    if (!participants.includes(entityId)) {
      // Add participant using the ID
      const added = await this.addParticipant(entityId, roomId);

      if (!added) {
        throw new Error(`Failed to add participant ${entityId} to room ${roomId}`);
      }
      if (entityId === this.agentId) {
        this.logger.debug(`Agent ${this.character.name} linked to room ${roomId} successfully.`);
      } else {
        this.logger.debug(`User ${entityId} linked to room ${roomId} successfully.`);
      }
    }
  }

  async removeParticipant(entityId: UUID, roomId: UUID): Promise<boolean> {
    return await this.adapter.removeParticipant(entityId, roomId);
  }

  async getParticipantsForEntity(entityId: UUID): Promise<Participant[]> {
    return await this.adapter.getParticipantsForEntity(entityId);
  }

  async getParticipantsForRoom(roomId: UUID): Promise<UUID[]> {
    return await this.adapter.getParticipantsForRoom(roomId);
  }

  async addParticipant(entityId: UUID, roomId: UUID): Promise<boolean> {
    return await this.adapter.addParticipantsRoom([entityId], roomId);
  }

  async addParticipantsRoom(entityIds: UUID[], roomId: UUID): Promise<boolean> {
    return await this.adapter.addParticipantsRoom(entityIds, roomId);
  }

  /**
   * Ensure the existence of a world.
   */
  async ensureWorldExists({ id, name, serverId, metadata }: World) {
    const world = await this.getWorld(id);
    if (!world) {
      this.logger.debug(
        'Creating world:',
        JSON.stringify({
          id,
          name,
          serverId,
          agentId: this.agentId,
        })
      );
      await this.adapter.createWorld({
        id,
        name,
        agentId: this.agentId,
        serverId: serverId || 'default',
        metadata,
      });
      this.logger.debug(`World ${id} created successfully.`);
    }
  }

  async ensureRoomExists({ id, name, source, type, channelId, serverId, worldId, metadata }: Room) {
    if (!worldId) throw new Error('worldId is required');
    const room = await this.getRoom(id);
    if (!room) {
      await this.createRoom({
        id,
        name,
        agentId: this.agentId,
        source,
        type,
        channelId,
        serverId,
        worldId,
        metadata,
      });
      this.logger.debug(`Room ${id} created successfully.`);
    }
  }

  async composeState(
    message: Memory,
    includeList: string[] | null = null,
    onlyInclude = false,
    skipCache = false
  ): Promise<State> {
    const filterList = onlyInclude ? includeList : null;
    const emptyObj = {
      values: {},
      data: {},
      text: '',
    } as State;
    const cachedState =
      skipCache || !message.id ? emptyObj : (await this.stateCache.get(message.id)) || emptyObj;
    const providerNames = new Set<string>();
    if (filterList && filterList.length > 0) {
      filterList.forEach((name) => providerNames.add(name));
    } else {
      this.providers
        .filter((p) => !p.private && !p.dynamic)
        .forEach((p) => providerNames.add(p.name));
    }
    if (!filterList && includeList && includeList.length > 0) {
      includeList.forEach((name) => providerNames.add(name));
    }
    const providersToGet = Array.from(
      new Set(this.providers.filter((p) => providerNames.has(p.name)))
    ).sort((a, b) => (a.position || 0) - (b.position || 0));
    const providerData = await Promise.all(
      providersToGet.map(async (provider) => {
        const start = Date.now();
        try {
          const result = await provider.get(this, message, cachedState);
          const duration = Date.now() - start;

          this.logger.debug(`${provider.name} Provider took ${duration}ms to respond`);
          return {
            ...result,
            providerName: provider.name,
          };
        } catch (error: any) {
          console.error('provider error', provider.name, error);
          return { values: {}, text: '', data: {}, providerName: provider.name };
        }
      })
    );
    const currentProviderResults = { ...(cachedState.data?.providers || {}) };
    for (const freshResult of providerData) {
      currentProviderResults[freshResult.providerName] = freshResult;
    }
    const orderedTexts: string[] = [];
    for (const provider of providersToGet) {
      const result = currentProviderResults[provider.name];
      if (result && result.text && result.text.trim() !== '') {
        orderedTexts.push(result.text);
      }
    }
    const providersText = orderedTexts.join('\n');
    const aggregatedStateValues = { ...(cachedState.values || {}) };
    for (const provider of providersToGet) {
      const providerResult = currentProviderResults[provider.name];
      if (providerResult && providerResult.values && typeof providerResult.values === 'object') {
        Object.assign(aggregatedStateValues, providerResult.values);
      }
    }
    for (const providerName in currentProviderResults) {
      if (!providersToGet.some((p) => p.name === providerName)) {
        const providerResult = currentProviderResults[providerName];
        if (providerResult && providerResult.values && typeof providerResult.values === 'object') {
          Object.assign(aggregatedStateValues, providerResult.values);
        }
      }
    }
    const newState = {
      values: {
        ...aggregatedStateValues,
        providers: providersText,
      },
      data: {
        ...(cachedState.data || {}),
        providers: currentProviderResults,
      },
      text: providersText,
    } as State;
    if (message.id) {
      this.stateCache.set(message.id, newState);
    }
    return newState;
  }

  getService<T extends Service = Service>(serviceName: ServiceTypeName | string): T | null {
    const serviceInstances = this.services.get(serviceName as ServiceTypeName);
    if (!serviceInstances || serviceInstances.length === 0) {
      // it's not a warn, a plugin might just not be installed
      this.logger.debug(`Service ${serviceName} not found`);
      return null;
    }
    return serviceInstances[0] as T;
  }

  /**
   * Type-safe service getter that ensures the correct service type is returned
   * @template T - The expected service class type
   * @param serviceName - The service type name
   * @returns The service instance with proper typing, or null if not found
   */
  getTypedService<T extends Service = Service>(serviceName: ServiceTypeName | string): T | null {
    return this.getService<T>(serviceName);
  }

  /**
   * Get all services of a specific type
   * @template T - The expected service class type
   * @param serviceName - The service type name
   * @returns Array of service instances with proper typing
   */
  getServicesByType<T extends Service = Service>(serviceName: ServiceTypeName | string): T[] {
    const serviceInstances = this.services.get(serviceName as ServiceTypeName);
    if (!serviceInstances || serviceInstances.length === 0) {
      this.logger.debug(`No services found for type ${serviceName}`);
      return [];
    }
    return serviceInstances as T[];
  }

  /**
   * Get all registered service types
   * @returns Array of registered service type names
   */
  getRegisteredServiceTypes(): ServiceTypeName[] {
    return Array.from(this.services.keys());
  }

  /**
   * Check if a service type is registered
   * @param serviceType - The service type to check
   * @returns true if the service is registered
   */
  hasService(serviceType: ServiceTypeName | string): boolean {
    const serviceInstances = this.services.get(serviceType as ServiceTypeName);
    return serviceInstances !== undefined && serviceInstances.length > 0;
  }

  async registerService(serviceDef: typeof Service): Promise<void> {
    const serviceType = serviceDef.serviceType as ServiceTypeName;
    if (!serviceType) {
      this.logger.warn(
        `Service ${serviceDef.name} is missing serviceType. Please define a static serviceType property.`
      );
      return;
    }
    this.logger.debug(
      `${this.character.name}(${this.agentId}) - Registering service:`,
      serviceType
    );

    try {
      const serviceInstance = await serviceDef.start(this);

      // Initialize arrays if they don't exist
      if (!this.services.has(serviceType)) {
        this.services.set(serviceType, []);
      }
      if (!this.serviceTypes.has(serviceType)) {
        this.serviceTypes.set(serviceType, []);
      }

      // Add the service to the arrays
      this.services.get(serviceType)!.push(serviceInstance);
      this.serviceTypes.get(serviceType)!.push(serviceDef);

      // inform everyone that's waiting for this service, that it's now available
      // removes the need for polling and timers
      const resolve = this.servicePromiseHandles.get(serviceType);
      if (resolve) {
        resolve(serviceInstance);
      } else {
        this.logger.debug(
          `${this.character.name} - Service ${serviceType} has no servicePromiseHandle`
        );
      }

      if (typeof (serviceDef as any).registerSendHandlers === 'function') {
        (serviceDef as any).registerSendHandlers(this, serviceInstance);
      }
      this.logger.debug(
        `${this.character.name}(${this.agentId}) - Service ${serviceType} registered successfully`
      );
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `${this.character.name}(${this.agentId}) - Failed to register service ${serviceType}: ${errorMessage}`
      );
      throw error;
    }
  }

  /// ensures servicePromises & servicePromiseHandles for a serviceType
  private _createServiceResolver(serviceType: ServiceTypeName) {
    // consider this in the future iterations
    // const { promise, resolve, reject } = Promise.withResolvers<T>();
    let resolver: ServiceResolver | undefined;
    this.servicePromises.set(
      serviceType,
      new Promise<Service>((resolve) => {
        resolver = resolve;
      })
    );
    if (!resolver) {
      throw new Error(`Failed to create resolver for service ${serviceType}`);
    }
    this.servicePromiseHandles.set(serviceType, resolver);
    return this.servicePromises.get(serviceType)!;
  }

  /// returns a promise that's resolved once this service is loaded
  getServiceLoadPromise(serviceType: ServiceTypeName): Promise<Service> {
    // if this.isInitialized then the this p will exist and already be resolved
    let p = this.servicePromises.get(serviceType);
    if (!p) {
      // not initialized or registered yet, registerPlugin is already smart enough to check to see if we make it here
      p = this._createServiceResolver(serviceType);
    }
    return p;
  }

  registerModel(
    modelType: ModelTypeName,
    handler: (params: any) => Promise<any>,
    provider: string,
    priority?: number
  ) {
    const modelKey = typeof modelType === 'string' ? modelType : ModelType[modelType];
    if (!this.models.has(modelKey)) {
      this.models.set(modelKey, []);
    }

    const registrationOrder = Date.now();
    this.models.get(modelKey)?.push({
      handler,
      provider,
      priority: priority || 0,
      registrationOrder,
    });
    this.models.get(modelKey)?.sort((a, b) => {
      if ((b.priority || 0) !== (a.priority || 0)) {
        return (b.priority || 0) - (a.priority || 0);
      }
      return (a.registrationOrder || 0) - (b.registrationOrder || 0);
    });
  }

  getModel(
    modelType: ModelTypeName,
    provider?: string
  ): ((runtime: IAgentRuntime, params: any) => Promise<any>) | undefined {
    const modelKey = typeof modelType === 'string' ? modelType : ModelType[modelType];
    const models = this.models.get(modelKey);
    if (!models?.length) {
      return undefined;
    }
    if (provider) {
      const modelWithProvider = models.find((m) => m.provider === provider);
      if (modelWithProvider) {
        this.logger.debug(
          `[AgentRuntime][${this.character.name}] Using model ${modelKey} from provider ${provider}`
        );
        return modelWithProvider.handler;
      } else {
        this.logger.warn(
          `[AgentRuntime][${this.character.name}] No model found for provider ${provider}`
        );
      }
    }

    // Return highest priority handler (first in array after sorting)
    this.logger.debug(
      `[AgentRuntime][${this.character.name}] Using model ${modelKey} from provider ${models[0].provider}`
    );
    return models[0].handler;
  }

  /**
   * Retrieves model configuration settings from character settings with support for
   * model-specific overrides and default fallbacks.
   *
   * Precedence order (highest to lowest):
   * 1. Model-specific settings (e.g., TEXT_SMALL_TEMPERATURE)
   * 2. Default settings (e.g., DEFAULT_TEMPERATURE)
   * 3. Legacy settings for backwards compatibility (e.g., MODEL_TEMPERATURE)
   *
   * @param modelType The specific model type to get settings for
   * @returns Object containing model parameters if they exist, or null if no settings are configured
   */
  private getModelSettings(modelType?: ModelTypeName): Record<string, number> | null {
    const modelSettings: Record<string, number> = {};

    // Helper to get a setting value with fallback chain
    const getSettingWithFallback = (
      param: 'MAX_TOKENS' | 'TEMPERATURE' | 'FREQUENCY_PENALTY' | 'PRESENCE_PENALTY',
      legacyKey: string
    ): number | null => {
      // Try model-specific setting first
      if (modelType) {
        const modelSpecificKey = `${modelType}_${param}`;
        const modelValue = this.getSetting(modelSpecificKey);
        if (modelValue !== null && modelValue !== undefined) {
          const numValue = Number(modelValue);
          if (!isNaN(numValue)) {
            return numValue;
          }
          // If model-specific value exists but is invalid, continue to fallbacks
        }
      }

      // Fall back to default setting
      const defaultKey = `DEFAULT_${param}`;
      const defaultValue = this.getSetting(defaultKey);
      if (defaultValue !== null && defaultValue !== undefined) {
        const numValue = Number(defaultValue);
        if (!isNaN(numValue)) {
          return numValue;
        }
        // If default value exists but is invalid, continue to legacy
      }

      // Fall back to legacy setting for backwards compatibility
      const legacyValue = this.getSetting(legacyKey);
      if (legacyValue !== null && legacyValue !== undefined) {
        const numValue = Number(legacyValue);
        if (!isNaN(numValue)) {
          return numValue;
        }
      }

      return null;
    };

    // Get settings with proper fallback chain
    const maxTokens = getSettingWithFallback('MAX_TOKENS', MODEL_SETTINGS.MODEL_MAX_TOKEN);
    const temperature = getSettingWithFallback('TEMPERATURE', MODEL_SETTINGS.MODEL_TEMPERATURE);
    const frequencyPenalty = getSettingWithFallback(
      'FREQUENCY_PENALTY',
      MODEL_SETTINGS.MODEL_FREQ_PENALTY
    );
    const presencePenalty = getSettingWithFallback(
      'PRESENCE_PENALTY',
      MODEL_SETTINGS.MODEL_PRESENCE_PENALTY
    );

    // Add settings if they exist
    if (maxTokens !== null) modelSettings.maxTokens = maxTokens;
    if (temperature !== null) modelSettings.temperature = temperature;
    if (frequencyPenalty !== null) modelSettings.frequencyPenalty = frequencyPenalty;
    if (presencePenalty !== null) modelSettings.presencePenalty = presencePenalty;

    // Return null if no settings were configured
    return Object.keys(modelSettings).length > 0 ? modelSettings : null;
  }

  async useModel<T extends ModelTypeName, R = ModelResultMap[T]>(
    modelType: T,
    params: Omit<ModelParamsMap[T], 'runtime'> | any,
    provider?: string
  ): Promise<R> {
    const modelKey = typeof modelType === 'string' ? modelType : ModelType[modelType];
    const promptContent =
      params?.prompt ||
      params?.input ||
      (Array.isArray(params?.messages) ? JSON.stringify(params.messages) : null);
    const model = this.getModel(modelKey, provider);
    if (!model) {
      const errorMsg = `No handler found for delegate type: ${modelKey}`;
      throw new Error(errorMsg);
    }

    // Log input parameters (keep debug log if useful)
    this.logger.debug(
      `[useModel] ${modelKey} input: ` +
        JSON.stringify(params, safeReplacer(), 2).replace(/\\n/g, '\n')
    );
    let paramsWithRuntime: any;
    if (
      params === null ||
      params === undefined ||
      typeof params !== 'object' ||
      Array.isArray(params) ||
      BufferUtils.isBuffer(params)
    ) {
      paramsWithRuntime = params;
    } else {
      // Include model settings from character configuration if available
      const modelSettings = this.getModelSettings(modelKey);

      if (modelSettings) {
        // Apply model settings if configured
        paramsWithRuntime = {
          ...modelSettings, // Apply model settings first (includes defaults and model-specific)
          ...params, // Then apply specific params (allowing overrides)
          runtime: this,
        };
      } else {
        // No model settings configured, use params as-is
        paramsWithRuntime = {
          ...params,
          runtime: this,
        };
      }
    }
    const startTime =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    try {
      const response = await model(this, paramsWithRuntime);
      const elapsedTime =
        (typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()) - startTime;

      // Log timing / response (keep debug log if useful)
      this.logger.debug(
        `[useModel] ${modelKey} output (took ${Number(elapsedTime.toFixed(2)).toLocaleString()}ms):`,
        Array.isArray(response)
          ? `${JSON.stringify(response.slice(0, 5))}...${JSON.stringify(response.slice(-5))} (${
              response.length
            } items)`
          : JSON.stringify(response, safeReplacer(), 2).replace(/\\n/g, '\n')
      );

      // Log all prompts except TEXT_EMBEDDING to track agent behavior
      if (modelKey !== ModelType.TEXT_EMBEDDING && promptContent) {
        // If we're in an action context, collect the prompt
        if (this.currentActionContext) {
          this.currentActionContext.prompts.push({
            modelType: modelKey,
            prompt: promptContent,
            timestamp: Date.now(),
          });
        }
      }

      // Keep the existing model logging for backward compatibility
      this.adapter.log({
        entityId: this.agentId,
        roomId: this.agentId,
        body: {
          modelType,
          modelKey,
          params: {
            ...(typeof params === 'object' && !Array.isArray(params) && params ? params : {}),
            prompt: promptContent,
          },
          prompt: promptContent,
          runId: this.getCurrentRunId(),
          timestamp: Date.now(),
          executionTime: elapsedTime,
          provider: provider || this.models.get(modelKey)?.[0]?.provider || 'unknown',
          actionContext: this.currentActionContext
            ? {
                actionName: this.currentActionContext.actionName,
                actionId: this.currentActionContext.actionId,
              }
            : undefined,
          response:
            Array.isArray(response) && response.every((x) => typeof x === 'number')
              ? '[array]'
              : response,
        },
        type: `useModel:${modelKey}`,
      });

      return response as R;
    } catch (error: any) {
      throw error;
    }
  }

  registerEvent(event: string, handler: (params: any) => Promise<void>) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(handler);
  }

  getEvent(event: string): ((params: any) => Promise<void>)[] | undefined {
    return this.events.get(event);
  }

  async emitEvent(event: string | string[], params: any) {
    const events = Array.isArray(event) ? event : [event];
    for (const eventName of events) {
      const eventHandlers = this.events.get(eventName);
      if (!eventHandlers) {
        continue;
      }
      try {
        let paramsWithRuntime = { runtime: this };
        if (typeof params === 'object' && params) {
          paramsWithRuntime = { ...params, ...paramsWithRuntime };
        }
        await Promise.all(eventHandlers.map((handler) => handler(paramsWithRuntime)));
      } catch (error) {
        this.logger.error(`Error during emitEvent for ${eventName} (handler execution): ${error}`);
        // throw error; // Re-throw if necessary
      }
    }
  }

  async ensureEmbeddingDimension() {
    this.logger.debug(`[AgentRuntime][${this.character.name}] Starting ensureEmbeddingDimension`);

    if (!this.adapter) {
      throw new Error(
        `[AgentRuntime][${this.character.name}] Database adapter not initialized before ensureEmbeddingDimension`
      );
    }
    try {
      const model = this.getModel(ModelType.TEXT_EMBEDDING);
      if (!model) {
        throw new Error(
          `[AgentRuntime][${this.character.name}] No TEXT_EMBEDDING model registered`
        );
      }

      this.logger.debug(`[AgentRuntime][${this.character.name}] Getting embedding dimensions`);
      const embedding = await this.useModel(ModelType.TEXT_EMBEDDING, null);
      if (!embedding || !embedding.length) {
        throw new Error(`[AgentRuntime][${this.character.name}] Invalid embedding received`);
      }

      this.logger.debug(
        `[AgentRuntime][${this.character.name}] Setting embedding dimension: ${embedding.length}`
      );
      await this.adapter.ensureEmbeddingDimension(embedding.length);
      this.logger.debug(
        `[AgentRuntime][${this.character.name}] Successfully set embedding dimension`
      );
    } catch (error) {
      this.logger.debug(
        `[AgentRuntime][${this.character.name}] Error in ensureEmbeddingDimension: ${error}`
      );
      throw error;
    }
  }

  registerTaskWorker(taskHandler: TaskWorker): void {
    if (this.taskWorkers.has(taskHandler.name)) {
      this.logger.warn(
        `Task definition ${taskHandler.name} already registered. Will be overwritten.`
      );
    }
    this.taskWorkers.set(taskHandler.name, taskHandler);
  }

  getTaskWorker(name: string): TaskWorker | undefined {
    return this.taskWorkers.get(name);
  }

  get db(): any {
    return this.adapter.db;
  }
  async init(): Promise<void> {
    await this.adapter.init();
  }
  async close(): Promise<void> {
    await this.adapter.close();
  }
  async getAgent(agentId: UUID): Promise<Agent | null> {
    return await this.adapter.getAgent(agentId);
  }
  async getAgents(): Promise<Partial<Agent>[]> {
    return await this.adapter.getAgents();
  }
  async createAgent(agent: Partial<Agent>): Promise<boolean> {
    return await this.adapter.createAgent(agent);
  }
  async updateAgent(agentId: UUID, agent: Partial<Agent>): Promise<boolean> {
    return await this.adapter.updateAgent(agentId, agent);
  }
  async deleteAgent(agentId: UUID): Promise<boolean> {
    return await this.adapter.deleteAgent(agentId);
  }
  async ensureAgentExists(agent: Partial<Agent>): Promise<Agent> {
    if (!agent.name) {
      throw new Error('Agent name is required');
    }

    const agents = await this.adapter.getAgents();
    const existingAgentId = agents.find((a) => a.name === agent.name)?.id;

    if (existingAgentId) {
      // Update the agent on restart with the latest character configuration
      const updatedAgent = {
        ...agent,
        id: existingAgentId,
        updatedAt: Date.now(),
      };

      await this.adapter.updateAgent(existingAgentId, updatedAgent);
      const existingAgent = await this.adapter.getAgent(existingAgentId);

      if (!existingAgent) {
        throw new Error(`Failed to retrieve agent after update: ${existingAgentId}`);
      }

      this.logger.debug(`Updated existing agent ${agent.name} on restart`);
      return existingAgent;
    }

    // Create new agent if it doesn't exist
    const newAgent: Agent = {
      ...agent,
      id: stringToUuid(agent.name),
    } as Agent;

    const created = await this.adapter.createAgent(newAgent);
    if (!created) {
      throw new Error(`Failed to create agent: ${agent.name}`);
    }

    this.logger.debug(`Created new agent ${agent.name}`);
    return newAgent;
  }
  async getEntityById(entityId: UUID): Promise<Entity | null> {
    const entities = await this.adapter.getEntitiesByIds([entityId]);
    if (!entities?.length) return null;
    return entities[0];
  }

  async getEntitiesByIds(entityIds: UUID[]): Promise<Entity[] | null> {
    return await this.adapter.getEntitiesByIds(entityIds);
  }
  async getEntitiesForRoom(roomId: UUID, includeComponents?: boolean): Promise<Entity[]> {
    return await this.adapter.getEntitiesForRoom(roomId, includeComponents);
  }
  async createEntity(entity: Entity): Promise<boolean> {
    if (!entity.agentId) {
      entity.agentId = this.agentId;
    }
    return await this.createEntities([entity]);
  }

  async createEntities(entities: Entity[]): Promise<boolean> {
    entities.forEach((e) => {
      e.agentId = this.agentId;
    });
    return await this.adapter.createEntities(entities);
  }

  async updateEntity(entity: Entity): Promise<void> {
    await this.adapter.updateEntity(entity);
  }
  async getComponent(
    entityId: UUID,
    type: string,
    worldId?: UUID,
    sourceEntityId?: UUID
  ): Promise<Component | null> {
    return await this.adapter.getComponent(entityId, type, worldId, sourceEntityId);
  }
  async getComponents(entityId: UUID, worldId?: UUID, sourceEntityId?: UUID): Promise<Component[]> {
    return await this.adapter.getComponents(entityId, worldId, sourceEntityId);
  }
  async createComponent(component: Component): Promise<boolean> {
    return await this.adapter.createComponent(component);
  }
  async updateComponent(component: Component): Promise<void> {
    await this.adapter.updateComponent(component);
  }
  async deleteComponent(componentId: UUID): Promise<void> {
    await this.adapter.deleteComponent(componentId);
  }
  async addEmbeddingToMemory(memory: Memory): Promise<Memory> {
    if (memory.embedding) {
      return memory;
    }
    const memoryText = memory.content.text;
    if (!memoryText) {
      throw new Error('Cannot generate embedding: Memory content is empty');
    }
    try {
      memory.embedding = await this.useModel(ModelType.TEXT_EMBEDDING, {
        text: memoryText,
      });
    } catch (error: any) {
      this.logger.error('Failed to generate embedding:', error);
      memory.embedding = await this.useModel(ModelType.TEXT_EMBEDDING, null);
    }
    return memory;
  }

  async queueEmbeddingGeneration(
    memory: Memory,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<void> {
    // Skip if memory is null or undefined
    if (!memory) {
      return;
    }

    // Skip if memory already has embeddings
    if (memory.embedding) {
      return;
    }

    // Skip if no text content
    if (!memory.content?.text) {
      this.logger.debug('Skipping embedding generation for memory without text content');
      return;
    }

    // Emit event for async embedding generation
    await this.emitEvent(EventType.EMBEDDING_GENERATION_REQUESTED, {
      runtime: this,
      memory,
      priority,
      source: 'runtime',
      retryCount: 0,
      maxRetries: 3,
    });
  }
  async getMemories(params: {
    entityId?: UUID;
    agentId?: UUID;
    roomId?: UUID;
    count?: number;
    unique?: boolean;
    tableName: string;
    start?: number;
    end?: number;
  }): Promise<Memory[]> {
    return await this.adapter.getMemories(params);
  }
  async getAllMemories(): Promise<Memory[]> {
    const tables = ['memories', 'messages', 'facts', 'documents'];
    const allMemories: Memory[] = [];

    for (const tableName of tables) {
      try {
        const memories = await this.adapter.getMemories({
          agentId: this.agentId,
          tableName,
          count: 10000, // Get a large number to fetch all
        });
        allMemories.push(...memories);
      } catch (error) {
        // Continue with other tables if one fails
        this.logger.debug(`Failed to get memories from table ${tableName}: ${error}`);
      }
    }

    return allMemories;
  }
  async getMemoryById(id: UUID): Promise<Memory | null> {
    return await this.adapter.getMemoryById(id);
  }
  async getMemoriesByIds(ids: UUID[], tableName?: string): Promise<Memory[]> {
    return await this.adapter.getMemoriesByIds(ids, tableName);
  }
  async getMemoriesByRoomIds(params: {
    tableName: string;
    roomIds: UUID[];
    limit?: number;
  }): Promise<Memory[]> {
    return await this.adapter.getMemoriesByRoomIds(params);
  }

  async getCachedEmbeddings(params: {
    query_table_name: string;
    query_threshold: number;
    query_input: string;
    query_field_name: string;
    query_field_sub_name: string;
    query_match_count: number;
  }): Promise<{ embedding: number[]; levenshtein_score: number }[]> {
    return await this.adapter.getCachedEmbeddings(params);
  }
  async log(params: {
    body: { [key: string]: unknown };
    entityId: UUID;
    roomId: UUID;
    type: string;
  }): Promise<void> {
    await this.adapter.log(params);
  }
  async searchMemories(params: {
    embedding: number[];
    query?: string;
    match_threshold?: number;
    count?: number;
    roomId?: UUID;
    unique?: boolean;
    worldId?: UUID;
    entityId?: UUID;
    tableName: string;
  }): Promise<Memory[]> {
    const memories = await this.adapter.searchMemories(params);
    if (params.query) {
      const rerankedMemories = await this.rerankMemories(params.query, memories);
      return rerankedMemories;
    }
    return memories;
  }
  async rerankMemories(query: string, memories: Memory[]): Promise<Memory[]> {
    const docs = memories.map((memory) => ({
      title: memory.id,
      content: memory.content.text,
    }));
    const bm25 = new BM25(docs);
    const results = bm25.search(query, memories.length);
    return results.map((result) => memories[result.index]);
  }
  async createMemory(memory: Memory, tableName: string, unique?: boolean): Promise<UUID> {
    if (unique !== undefined) memory.unique = unique;
    return await this.adapter.createMemory(memory, tableName, unique);
  }
  async updateMemory(
    memory: Partial<Memory> & { id: UUID; metadata?: MemoryMetadata }
  ): Promise<boolean> {
    return await this.adapter.updateMemory(memory);
  }
  async deleteMemory(memoryId: UUID): Promise<void> {
    await this.adapter.deleteMemory(memoryId);
  }
  async deleteManyMemories(memoryIds: UUID[]): Promise<void> {
    await this.adapter.deleteManyMemories(memoryIds);
  }
  async clearAllAgentMemories(): Promise<void> {
    this.logger.info(`Clearing all memories for agent ${this.character.name} (${this.agentId})`);

    const allMemories = await this.getAllMemories();
    const memoryIds = allMemories
      .map((memory) => memory.id)
      .filter((id): id is UUID => id !== undefined);

    if (memoryIds.length === 0) {
      this.logger.info('No memories found to delete');
      return;
    }

    this.logger.info(`Found ${memoryIds.length} memories to delete`);
    await this.adapter.deleteManyMemories(memoryIds);

    this.logger.info(`Successfully cleared all ${memoryIds.length} memories for agent`);
  }
  async deleteAllMemories(roomId: UUID, tableName: string): Promise<void> {
    await this.adapter.deleteAllMemories(roomId, tableName);
  }
  async countMemories(roomId: UUID, unique?: boolean, tableName?: string): Promise<number> {
    return await this.adapter.countMemories(roomId, unique, tableName);
  }
  async getLogs(params: {
    entityId: UUID;
    roomId?: UUID;
    type?: string;
    count?: number;
    offset?: number;
  }): Promise<Log[]> {
    return await this.adapter.getLogs(params);
  }
  async deleteLog(logId: UUID): Promise<void> {
    await this.adapter.deleteLog(logId);
  }
  async createWorld(world: World): Promise<UUID> {
    return await this.adapter.createWorld(world);
  }
  async getWorld(id: UUID): Promise<World | null> {
    return await this.adapter.getWorld(id);
  }
  async removeWorld(worldId: UUID): Promise<void> {
    await this.adapter.removeWorld(worldId);
  }
  async getAllWorlds(): Promise<World[]> {
    return await this.adapter.getAllWorlds();
  }
  async updateWorld(world: World): Promise<void> {
    await this.adapter.updateWorld(world);
  }
  async getRoom(roomId: UUID): Promise<Room | null> {
    const rooms = await this.adapter.getRoomsByIds([roomId]);
    if (!rooms?.length) return null;
    return rooms[0];
  }

  async getRoomsByIds(roomIds: UUID[]): Promise<Room[] | null> {
    return await this.adapter.getRoomsByIds(roomIds);
  }
  async createRoom({ id, name, source, type, channelId, serverId, worldId }: Room): Promise<UUID> {
    if (!worldId) throw new Error('worldId is required');
    const res = await this.adapter.createRooms([
      {
        id,
        name,
        source,
        type,
        channelId,
        serverId,
        worldId,
      },
    ]);
    if (!res.length) throw new Error('Failed to create room');
    return res[0];
  }

  async createRooms(rooms: Room[]): Promise<UUID[]> {
    return await this.adapter.createRooms(rooms);
  }

  async deleteRoom(roomId: UUID): Promise<void> {
    await this.adapter.deleteRoom(roomId);
  }
  async deleteRoomsByWorldId(worldId: UUID): Promise<void> {
    await this.adapter.deleteRoomsByWorldId(worldId);
  }
  async updateRoom(room: Room): Promise<void> {
    await this.adapter.updateRoom(room);
  }
  async getRoomsForParticipant(entityId: UUID): Promise<UUID[]> {
    return await this.adapter.getRoomsForParticipant(entityId);
  }
  async getRoomsForParticipants(userIds: UUID[]): Promise<UUID[]> {
    return await this.adapter.getRoomsForParticipants(userIds);
  }

  // deprecate this one
  async getRooms(worldId: UUID): Promise<Room[]> {
    return await this.adapter.getRoomsByWorld(worldId);
  }

  async getRoomsByWorld(worldId: UUID): Promise<Room[]> {
    return await this.adapter.getRoomsByWorld(worldId);
  }
  async getParticipantUserState(
    roomId: UUID,
    entityId: UUID
  ): Promise<'FOLLOWED' | 'MUTED' | null> {
    return await this.adapter.getParticipantUserState(roomId, entityId);
  }
  async setParticipantUserState(
    roomId: UUID,
    entityId: UUID,
    state: 'FOLLOWED' | 'MUTED' | null
  ): Promise<void> {
    await this.adapter.setParticipantUserState(roomId, entityId, state);
  }
  async createRelationship(params: {
    sourceEntityId: UUID;
    targetEntityId: UUID;
    tags?: string[];
    metadata?: { [key: string]: any };
  }): Promise<boolean> {
    return await this.adapter.createRelationship(params);
  }
  async updateRelationship(relationship: Relationship): Promise<void> {
    await this.adapter.updateRelationship(relationship);
  }
  async getRelationship(params: {
    sourceEntityId: UUID;
    targetEntityId: UUID;
  }): Promise<Relationship | null> {
    return await this.adapter.getRelationship(params);
  }
  async getRelationships(params: { entityId: UUID; tags?: string[] }): Promise<Relationship[]> {
    return await this.adapter.getRelationships(params);
  }
  async getCache<T>(key: string): Promise<T | undefined> {
    return await this.adapter.getCache<T>(key);
  }
  async setCache<T>(key: string, value: T): Promise<boolean> {
    return await this.adapter.setCache<T>(key, value);
  }
  async deleteCache(key: string): Promise<boolean> {
    return await this.adapter.deleteCache(key);
  }
  async createTask(task: Task): Promise<UUID> {
    return await this.adapter.createTask(task);
  }
  async getTasks(params: { roomId?: UUID; tags?: string[]; entityId?: UUID }): Promise<Task[]> {
    return await this.adapter.getTasks(params);
  }
  async getTask(id: UUID): Promise<Task | null> {
    return await this.adapter.getTask(id);
  }
  async getTasksByName(name: string): Promise<Task[]> {
    return await this.adapter.getTasksByName(name);
  }
  async updateTask(id: UUID, task: Partial<Task>): Promise<void> {
    await this.adapter.updateTask(id, task);
  }
  async deleteTask(id: UUID): Promise<void> {
    await this.adapter.deleteTask(id);
  }
  on(event: string, callback: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)?.push(callback);
  }
  off(event: string, callback: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      return;
    }
    const handlers = this.eventHandlers.get(event)!;
    const index = handlers.indexOf(callback);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }
  emit(event: string, data: any): void {
    if (!this.eventHandlers.has(event)) {
      return;
    }
    for (const handler of this.eventHandlers.get(event)!) {
      handler(data);
    }
  }
  async sendControlMessage(params: {
    roomId: UUID;
    action: 'enable_input' | 'disable_input';
    target?: string;
  }): Promise<void> {
    try {
      const { roomId, action, target } = params;
      const controlMessage = {
        type: 'control',
        payload: {
          action,
          target,
        },
        roomId,
      };
      await this.emitEvent('CONTROL_MESSAGE', {
        runtime: this,
        message: controlMessage,
        source: 'agent',
      });

      this.logger.debug(`Sent control message: ${action} to room ${roomId}`);
    } catch (error) {
      this.logger.error(`Error sending control message: ${error}`);
    }
  }
  registerSendHandler(source: string, handler: SendHandlerFunction): void {
    if (this.sendHandlers.has(source)) {
      this.logger.warn(`Send handler for source '${source}' already registered. Overwriting.`);
    }
    this.sendHandlers.set(source, handler);
    this.logger.info(`Registered send handler for source: ${source}`);
  }
  async sendMessageToTarget(target: TargetInfo, content: Content): Promise<void> {
    const handler = this.sendHandlers.get(target.source);
    if (!handler) {
      const errorMsg = `No send handler registered for source: ${target.source}`;
      this.logger.error(errorMsg);
      // Optionally throw or just log the error
      throw new Error(errorMsg);
    }
    try {
      await handler(this, target, content);
    } catch (error: any) {
      this.logger.error(`Error executing send handler for source ${target.source}:`, error);
      throw error; // Re-throw error after logging and tracing
    }
  }
  async getMemoriesByWorldId(params: {
    worldId: UUID;
    count?: number;
    tableName?: string;
  }): Promise<Memory[]> {
    return await this.adapter.getMemoriesByWorldId(params);
  }
  async runMigrations(migrationsPaths?: string[]): Promise<void> {
    if (this.adapter && 'runMigrations' in this.adapter) {
      await (this.adapter as any).runMigrations(migrationsPaths);
    } else {
      this.logger.warn('Database adapter does not support migrations.');
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.adapter) {
      throw new Error('Database adapter not registered');
    }
    return await this.adapter.isReady();
  }
}
>>>>>>> 826a7d55bf98539c5bc1a2fa7a65aeaa03ffd76a
