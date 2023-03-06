import { AwsCredentialIdentity } from '@aws-sdk/types';
import { Context } from 'aws-lambda';
import camelcaseKeys from 'camelcase-keys';
import assert from 'node:assert';
import { isNativeError } from 'node:util/types';
import { Logger, stdSerializers } from 'pino';
import {
    compile,
    ensure,
    ObjectValidator,
    TypeOf,
    ValidationError,
} from 'suretype';
import { CamelCasedPropertiesDeep, SetRequired } from 'type-fest';
import {
    Action,
    BaseRequest,
    ensureBaseRequest,
    TestRequestSchema,
} from '~/request.js';
import { AlreadyExistsError, BaseHandlerError } from './exceptions.js';
import {
    CreateEvent,
    DeleteEvent,
    DeleteResult,
    InProgress,
    ListEvent,
    ListResult,
    PendableSuccessResult,
    ReadEvent,
    SuccessWithPropertiesResult,
    UpdateEvent,
} from './handlers.js';
import { defaultLogger } from './logging/base.js';
import { getInstrumentation } from './logging/index.js';
import { MetricsPublisher } from './logging/metrics.js';
import { CfnResponse, HandlerErrorCode, OperationStatus } from './response.js';
import { Input } from './types.js';

const errorFormatter = stdSerializers.err;

export interface ResourceHandlerProperties<
    TProperties extends ObjectValidator<unknown>,
    TTypeConfiguration extends ObjectValidator<unknown> = BaseRequest['RequestData']['TypeConfiguration'],
    TPrimaryKeys extends keyof TypeOf<TProperties> = never
> {
    readonly typeName: string;
    readonly schema: TProperties;
    readonly ids: readonly TPrimaryKeys[];
    readonly typeConfigurationSchema: TTypeConfiguration;
}

export interface ResourceHandlers<
    TPropertiesSchema extends ObjectValidator<unknown>,
    TTypeConfigurationSchema extends ObjectValidator<unknown>,
    TPrimaryKeys extends keyof TypeOf<TPropertiesSchema>,
    // These are defined to help simplify later types
    TProperties extends Input = TypeOf<TPropertiesSchema>,
    TTypeConfiguration extends Input = TypeOf<TTypeConfigurationSchema>,
    THandler = ResourceBuilderBase<
        TPropertiesSchema,
        TTypeConfigurationSchema,
        TPrimaryKeys,
        TProperties,
        TTypeConfiguration
    >
> {
    readonly create: (
        this: THandler,
        event: CreateEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<PendableSuccessResult<TProperties, TPrimaryKeys>>;

    readonly createCallback?: (
        this: THandler,
        event: CreateEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<PendableSuccessResult<TProperties, TPrimaryKeys>>;

    readonly update: (
        this: THandler,
        event: UpdateEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<PendableSuccessResult<TProperties, TPrimaryKeys>>;

    readonly updateCallback?: (
        this: THandler,
        event: UpdateEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<PendableSuccessResult<TProperties, TPrimaryKeys>>;

    readonly delete: (
        this: THandler,
        event: DeleteEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<DeleteResult<TProperties>>;

    readonly read: (
        this: THandler,
        event: ReadEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<SuccessWithPropertiesResult<TProperties, TPrimaryKeys>>;

    readonly list: (
        this: THandler,
        event: ListEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<ListResult<TProperties, TPrimaryKeys>>;
}

// Handler agnostic event format
interface GenericRequestEvent {
    action: Action;
    resourceProperties: unknown;
    oldResourceProperties?: unknown;
    typeConfiguration?: unknown;
    credentials: AwsCredentialIdentity;
}

export abstract class ResourceBuilderBase<
    TPropertiesSchema extends ObjectValidator<unknown>,
    TTypeConfigurationSchema extends ObjectValidator<unknown>,
    TPrimaryKeys extends keyof TypeOf<TPropertiesSchema>,
    // These are defined to help simplify later types
    TProperties extends Input = TypeOf<TPropertiesSchema>,
    TTypeConfiguration extends Input = TypeOf<TTypeConfigurationSchema>
> {
    #handlers: ResourceHandlers<
        TPropertiesSchema,
        TTypeConfigurationSchema,
        TPrimaryKeys,
        TProperties,
        TTypeConfiguration
    > | null = null;

    #logger: Logger = defaultLogger;
    #metrics: MetricsPublisher | null = null;
    typeName: string;

    get logger() {
        return this.#logger;
    }

    get metrics() {
        return this.#metrics!;
    }

    constructor(
        private readonly options: ResourceHandlerProperties<
            TPropertiesSchema,
            TTypeConfigurationSchema,
            TPrimaryKeys
        >
    ) {
        this.typeName = options.typeName;
    }

    public handle(
        options: ResourceHandlers<
            TPropertiesSchema,
            TTypeConfigurationSchema,
            TPrimaryKeys,
            TProperties,
            TTypeConfiguration
        >
    ) {
        this.#handlers = options;
        return this;
    }

    public build() {
        return {
            entrypoint: this.#entrypoint.bind(this),
            testEntrypoint: this.#testEntrypoint.bind(this),
        };
    }

    async #testEntrypoint(event: unknown): Promise<CfnResponse> {
        const testData = ensure(TestRequestSchema, event);
        return await this.#handleRequest({
            action: testData.action,
            resourceProperties: testData.request.desiredResourceState,
            oldResourceProperties: testData.request.previousResourceState,
            typeConfiguration: testData.request.typeConfiguration,
            credentials: camelcaseKeys(testData.credentials),
        });
    }

    async #entrypoint(event: unknown, context: Context): Promise<CfnResponse> {
        const baseRequest = ensureBaseRequest(event);
        const [logger, metrics] = await getInstrumentation(
            baseRequest,
            context,
            defaultLogger
        );
        this.#logger = logger;
        const credentials = camelcaseKeys(
            baseRequest.RequestData.CallerCredentials!
        );
        return await this.#handleRequest({
            action: baseRequest.Action,
            resourceProperties: baseRequest.RequestData.ResourceProperties!,
            oldResourceProperties:
                baseRequest.RequestData.PreviousResourceProperties,
            typeConfiguration: baseRequest.RequestData.TypeConfiguration,
            credentials,
        });
    }

    async #handleRequest(event: GenericRequestEvent): Promise<CfnResponse> {
        try {
            switch (event.action) {
                case 'CREATE':
                    return await this.#handleCreate(event);
                case 'UPDATE':
                    return await this.#handleUpdate(event);
                case 'DELETE':
                    return await this.#handleDelete(event);
                case 'READ':
                    return await this.#handleRead(event);
                case 'LIST':
                    return await this.#handleList(event);
                default:
                    this.logger.error(
                        `Called with unknown action ${event.action}`
                    );
                    const error = new Error(
                        `Called with unknown action ${event.action}`
                    );
                    this.metrics.publishExceptionMetric(
                        new Date(),
                        event.action,
                        error
                    );
                    return {
                        Status: OperationStatus.Failed,
                        Message: `Was called with unknown action ${event.action}`,
                        ErrorCode: HandlerErrorCode.InvalidRequest,
                    };
            }
        } catch (e) {
            defaultLogger.error(e, 'Failed to parse request');
            return this.#getErrorForException(e);
        }
    }

    async #handleCreate({
        action,
        resourceProperties,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(action === 'CREATE');
        const properties = ensureProperties(resourceProperties);
        const typeConfiguration = ensureTypeConfiguration(
            rawTypeConfiguration ?? {}
        );
        const createHandler = this.#handlers!.create.bind(this);
        const result = await createHandler({
            action,
            properties: camelcaseKeys(properties, {
                deep: true,
            }) as any,
            logger: this.#logger,
            typeConfiguration: camelcaseKeys(typeConfiguration, {
                deep: true,
            }) as any,
        });
        if (result.Status === OperationStatus.Success) {
            return {
                Status: result.Status,
                ResourceModel: camelcaseKeys(result.Properties, {
                    deep: true,
                    pascalCase: true,
                }),
            };
        } else {
            return {
                Status: result.Status,
                Message: result.Message,
                ErrorCode: result.ErrorCode,
                ResourceModel: camelcaseKeys(result.Properties, {
                    deep: true,
                    pascalCase: true,
                }),
                CallbackContext: result.CallbackContext ?? {},
            };
        }
    }

    async #handleUpdate({
        action,
        resourceProperties,
        oldResourceProperties,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(action === 'UPDATE');
        const properties = ensureProperties(resourceProperties);
        const oldProperties = ensureProperties(oldResourceProperties);
        const typeConfiguration = ensureTypeConfiguration(
            rawTypeConfiguration ?? {}
        );
        const updateHandler = this.#handlers!.update.bind(this);
        const result = await updateHandler({
            action: action,
            properties: camelcaseKeys(properties, {
                deep: true,
            }) as any,
            previousProperties: camelcaseKeys(oldProperties, {
                deep: true,
            }) as any,
            logger: this.#logger,
            typeConfiguration: camelcaseKeys(typeConfiguration, {
                deep: true,
            }) as any,
        });
        if (result.Status === OperationStatus.Success) {
            return {
                Status: result.Status,
                ResourceModel: camelcaseKeys(result.Properties, {
                    deep: true,
                    pascalCase: true,
                }),
            };
        } else {
            return {
                Status: result.Status,
                Message: result.Message,
                ErrorCode: result.ErrorCode,
                ResourceModel: camelcaseKeys(result.Properties, {
                    deep: true,
                    pascalCase: true,
                }),
                CallbackContext: result.CallbackContext ?? {},
            };
        }
    }

    async #handleDelete({
        action,
        resourceProperties,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(action === 'DELETE');
        const properties = ensureProperties(resourceProperties);
        const typeConfiguration = ensureTypeConfiguration(
            rawTypeConfiguration ?? {}
        );
        const deleteHandler = this.#handlers!.delete.bind(this);
        const result = await deleteHandler({
            action: action,
            properties: camelcaseKeys(properties, {
                deep: true,
            }) as any,
            logger: this.#logger,
            typeConfiguration: camelcaseKeys(typeConfiguration, {
                deep: true,
            }) as any,
        });
        if (result.Status === OperationStatus.Success) {
            return {
                Status: result.Status,
            };
        } else {
            return {
                Status: result.Status,
                Message: result.Message,
                ErrorCode: result.ErrorCode,
                ResourceModel: camelcaseKeys(result.Properties, {
                    deep: true,
                    pascalCase: true,
                }),
                CallbackContext: result.CallbackContext ?? {},
            };
        }
    }

    async #handleRead({
        action,
        resourceProperties,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(action === 'READ');
        const properties = ensureProperties(resourceProperties);
        const typeConfiguration = ensureTypeConfiguration(
            rawTypeConfiguration ?? {}
        );
        const readHandler = this.#handlers!.read.bind(this);
        const result = await readHandler({
            action: action,
            properties: camelcaseKeys(properties, {
                deep: true,
            }) as any,
            logger: this.#logger,
            typeConfiguration: camelcaseKeys(typeConfiguration, {
                deep: true,
            }) as any,
        });
        return {
            Status: result.Status,
            ResourceModel: camelcaseKeys(result.Properties, {
                deep: true,
                pascalCase: true,
            }),
        };
    }

    async #handleList({
        action,
        resourceProperties,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(action === 'LIST');
        const typeConfiguration = ensureTypeConfiguration(
            rawTypeConfiguration ?? {}
        );
        const listHandler = this.#handlers!.list.bind(this);
        const result = await listHandler({
            action: action,
            logger: this.#logger,
            typeConfiguration: camelcaseKeys(typeConfiguration, {
                deep: true,
            }) as any,
        });
        return {
            Status: result.Status,
            ResourceModels: camelcaseKeys(result.ResourceModels, {
                deep: true,
                pascalCase: true,
            }),
        };
    }

    #getErrorForException(e: unknown): CfnResponse {
        if (e !== null && (e instanceof Error || isNativeError(e))) {
            this.#logger.warn(
                e,
                'There was an issue while handling the request'
            );

            const serializedError = errorFormatter(e);
            const message: string = `${serializedError.type}: ${serializedError.message}\n${serializedError.stack}`;
            if (BaseHandlerError.isHandlerError(e)) {
                return {
                    Status: OperationStatus.Failed as const,
                    Message: message,
                    ErrorCode: e.code,
                };
            }
            if (serializedError.name === 'ValidationError') {
                const validationError = e as ValidationError;
                return {
                    Status: OperationStatus.Failed as const,
                    Message: `${validationError.explanation}\n${message}`,
                    ErrorCode: HandlerErrorCode.InvalidRequest,
                };
            }

            return {
                Status: OperationStatus.Failed as const,
                Message: message,
                ErrorCode: HandlerErrorCode.GeneralServiceException,
            };
        }
        return {
            Status: OperationStatus.Failed as const,
            Message: `Unhandled Exception: ${e}`,
            ErrorCode: HandlerErrorCode.InternalFailure,
        };
    }

    /** Response Helpers */

    /**
     * Indicates the a resource was successfully created
     * @param properties The full properties of the resource, including the id(s).
     */
    public created(
        properties: CamelCasedPropertiesDeep<
            SetRequired<TProperties, TPrimaryKeys>
        >
    ): PendableSuccessResult<TProperties, TPrimaryKeys> {
        return {
            Status: OperationStatus.Success as const,
            Properties: properties,
        };
    }

    /**
     * Indicates the a resource was is being created.
     * Will trigger a createCallback after the specified delay (default 10 seconds).
     * @param properties The partial properties so far of the resource.
     * @param callbackContext Any context that should be passed back to the handler on the next callback.
     * This should just be a basic string:string dictionary.
     * @param callbackDelayInSeconds The delay in seconds before the next callback. Default 10 seconds.
     */
    public createInProgress(
        properties: InProgress<TProperties>['Properties'],
        options: {
            callbackContext: Record<string, string>;
            callbackDelayInSeconds?: number;
            message: string;
            errorCode?: HandlerErrorCode;
        }
    ): PendableSuccessResult<TProperties, TPrimaryKeys> {
        options.callbackDelayInSeconds ??= 10;
        return {
            Status: OperationStatus.InProgress as const,
            Properties: properties,
            Message: options.message,
            ErrorCode: options.errorCode,
            CallbackContext: options.callbackContext,
            CallbackDelaySeconds: options.callbackDelayInSeconds,
        };
    }

    /**
     * Called during create when a resource already exists
     * @param id The id of the resource that already exists
     */
    public alreadyExists(id: string) {
        throw new AlreadyExistsError(this.typeName, id);
    }

    public updated(
        properties: CamelCasedPropertiesDeep<
            SetRequired<TProperties, TPrimaryKeys>
        >
    ): PendableSuccessResult<TProperties, TPrimaryKeys> {
        return {
            Status: OperationStatus.Success as const,
            Properties: properties,
        };
    }
    /**
     * Indicates the a resource was updated.
     * Will trigger a updatedCallback after the specified delay (default 10 seconds).
     * @param properties The partial properties so far of the resource.
     * @param callbackContext Any context that should be passed back to the handler on the next callback.
     * This should just be a basic string:string dictionary.
     * @param callbackDelayInSeconds The delay in seconds before the next callback. Default 10 seconds.
     */
    public updateInProgress(
        properties: InProgress<TProperties>['Properties'],
        options: {
            callbackContext: Record<string, string>;
            callbackDelayInSeconds?: number;
            message: string;
            errorCode?: HandlerErrorCode;
        }
    ): PendableSuccessResult<TProperties, TPrimaryKeys> {
        options.callbackDelayInSeconds ??= 10;
        return {
            Status: OperationStatus.InProgress as const,
            Properties: properties,
            Message: options.message,
            ErrorCode: options.errorCode,
            CallbackContext: options.callbackContext,
            CallbackDelaySeconds: options.callbackDelayInSeconds,
        };
    }

    /**
     * Indicates the a resource was successfully deleted
     */
    public async deleted() {
        return {
            Status: OperationStatus.Success,
        } as const;
    }

    /**
     * Returns the result of a read operation
     * @param properties The full properties of the resource, including the id(s).
     */
    public async readResult(
        properties: CamelCasedPropertiesDeep<
            SetRequired<TProperties, TPrimaryKeys>
        >
    ) {
        return {
            Status: OperationStatus.Success,
            Properties: properties,
        } as const;
    }

    public async listResult(
        properties: CamelCasedPropertiesDeep<
            SetRequired<TProperties, TPrimaryKeys>
        >[]
    ) {
        return {
            Status: OperationStatus.Success,
            Properties: properties,
        } as const;
    }
}
