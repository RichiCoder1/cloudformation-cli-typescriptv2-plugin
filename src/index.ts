import { isNativeError } from 'node:util/types';
import { MetricsPublisher } from './logging/metrics.js';
import { Logger, stdSerializers } from 'pino';
import { Context } from 'aws-lambda';
import camelcaseKeys from 'camelcase-keys';
import { compile, ObjectValidator, TypeOf, ValidationError } from 'suretype';
import { BaseRequest } from '~/request.js';
import { ensureBaseRequest } from './request.js';
import {
    CreateEvent,
    PendableSuccessResult,
    InProgress,
    UpdateEvent,
    DeleteResult,
    ReadEvent,
    ListResult,
    ListEvent,
    DeleteEvent,
    SuccessWithPropertiesResult,
} from './handlers.js';
import { defaultLogger } from './logging/base.js';
import { getInstrumentation } from './logging/index.js';
import { CfnResponse, HandlerErrorCode, OperationStatus } from './response.js';
import { SetRequired, CamelCasedPropertiesDeep } from 'type-fest';
import { AlreadyExistsError, BaseHandlerError } from './exceptions.js';
import assert from 'node:assert';
import { SimplifyDeep } from 'type-fest/source/merge-deep.js';
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
    THandler = ResourceHandlerBase<
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

export abstract class ResourceHandlerBase<
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

    public handlers(
        options: ResourceHandlers<
            TPropertiesSchema,
            TTypeConfigurationSchema,
            TPrimaryKeys,
            TProperties,
            TTypeConfiguration
        >
    ) {
        this.#handlers = options;
    }

    public async entrypoint(
        event: unknown,
        context: Context
    ): Promise<CfnResponse> {
        try {
            const baseRequest = ensureBaseRequest(event);
            const [logger, metrics] = await getInstrumentation(
                baseRequest,
                context,
                defaultLogger
            );
            this.#logger = logger;
            switch (baseRequest.Action) {
                case 'CREATE':
                    return await this.#handleCreate(baseRequest);
                case 'UPDATE':
                    return await this.#handleUpdate(baseRequest);
                case 'DELETE':
                    return await this.#handleDelete(baseRequest);
                case 'READ':
                    return await this.#handleRead(baseRequest);
                case 'LIST':
                    return await this.#handleList(baseRequest);
                default:
                    logger.error(
                        `Called with unknown action ${baseRequest.Action}`
                    );
                    const error = new Error(
                        `Called with unknown action ${baseRequest.Action}`
                    );
                    metrics.publishExceptionMetric(
                        new Date(),
                        baseRequest.Action,
                        error
                    );
                    return {
                        Status: OperationStatus.Failed,
                        Message: `Was called with unknown action ${baseRequest.Action}`,
                        ErrorCode: HandlerErrorCode.InvalidRequest,
                    };
            }
        } catch (e) {
            defaultLogger.error(e, 'Failed to parse request');
            return this.#getErrorForException(e);
        }
    }

    async #handleCreate(request: BaseRequest): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(request.Action === 'CREATE');
        const properties = ensureProperties(
            request.RequestData.ResourceProperties
        );
        const typeConfiguration = ensureTypeConfiguration(
            request.RequestData.TypeConfiguration ?? {}
        );
        const createHandler = this.#handlers!.create.bind(this);
        const result = await createHandler({
            action: request.Action,
            properties: camelcaseKeys(properties, {
                deep: true,
            }) as any,
            request,
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

    async #handleUpdate(request: BaseRequest): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(request.Action === 'UPDATE');
        const properties = ensureProperties(
            request.RequestData.ResourceProperties
        );
        const oldProperties = ensureProperties(
            request.RequestData.OldResourceProperties
        );
        const typeConfiguration = ensureTypeConfiguration(
            request.RequestData.TypeConfiguration ?? {}
        );
        const updateHandler = this.#handlers!.update.bind(this);
        const result = await updateHandler({
            action: request.Action,
            properties: camelcaseKeys(properties, {
                deep: true,
            }) as any,
            previousProperties: camelcaseKeys(oldProperties, {
                deep: true,
            }) as any,
            request,
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

    async #handleDelete(request: BaseRequest): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(request.Action === 'DELETE');
        const properties = ensureProperties(
            request.RequestData.ResourceProperties
        );
        const typeConfiguration = ensureTypeConfiguration(
            request.RequestData.TypeConfiguration ?? {}
        );
        const deleteHandler = this.#handlers!.delete.bind(this);
        const result = await deleteHandler({
            action: request.Action,
            properties: camelcaseKeys(properties, {
                deep: true,
            }) as any,
            request,
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

    async #handleRead(request: BaseRequest): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(request.Action === 'READ');
        const properties = ensureProperties(
            request.RequestData.ResourceProperties
        );
        const typeConfiguration = ensureTypeConfiguration(
            request.RequestData.TypeConfiguration ?? {}
        );
        const readHandler = this.#handlers!.read.bind(this);
        const result = await readHandler({
            action: request.Action,
            properties: camelcaseKeys(properties, {
                deep: true,
            }) as any,
            request,
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

    async #handleList(request: BaseRequest): Promise<CfnResponse> {
        const ensureProperties = compile(this.options.schema, {
            ensure: true,
        });
        const ensureTypeConfiguration = compile(
            this.options.typeConfigurationSchema,
            {
                ensure: true,
            }
        );
        assert(request.Action === 'LIST');
        const typeConfiguration = ensureTypeConfiguration(
            request.RequestData.TypeConfiguration ?? {}
        );
        const listHandler = this.#handlers!.list.bind(this);
        const result = await listHandler({
            action: request.Action,
            request,
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
            this.#logger.warn(e, 'Failed to handle request');

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
