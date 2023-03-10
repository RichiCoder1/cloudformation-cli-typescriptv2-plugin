import type { AwsCredentialIdentity } from '@aws-sdk/types';
import type { Context } from 'aws-lambda';
import assert from 'node:assert';
import { isNativeError } from 'node:util/types';
import { Logger, stdSerializers } from 'pino';
import { ensure, ObjectValidator, TypeOf, ValidationError } from 'suretype';
import { SetRequired } from 'type-fest';
import { defaultProvider as defaultNodeCredentials } from '@aws-sdk/credential-provider-node';
import { AsyncLocalStorage } from 'node:async_hooks';
// If there were a better way to get these types, I would.
import type { AwsAuthInputConfig } from '@aws-sdk/middleware-signing/dist-types/configurations.js';
import type { RegionInputConfig } from '@aws-sdk/config-resolver/dist-types/regionConfig/resolveRegionConfig.js';

import {
    Action,
    BaseRequest,
    ensureBaseRequest,
    RequestAwsCredentials,
    TestRequestSchema,
} from './request.js';
import { AlreadyExistsError, BaseHandlerError } from './errors.js';
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
    TPrimaryKeys extends keyof TTransformedProperties = never,
    TAdditionalKeys extends keyof TTransformedProperties = never,
    TTransformedProperties extends Input = TypeOf<TProperties>,
    TTransformedTypeConfiguration extends Input = TypeOf<TTypeConfiguration>
> {
    readonly typeName: string;
    readonly schema: TProperties;
    readonly ids: readonly TPrimaryKeys[];
    readonly typeConfigurationSchema: TTypeConfiguration;
    transformProperties?: {
        toJS: (properties: unknown) => TTransformedProperties;
        fromJS: (properties: unknown) => TypeOf<TProperties>;
    };
    transformTypeConfiguration?: {
        toJS: (typeConfiguration: unknown) => TTransformedTypeConfiguration;
    };
    transformIds?: {
        fromJS: (ids: Record<TPrimaryKeys, unknown>) => Record<any, unknown>;
    };
}

export interface ResourceHandlers<
    TPropertiesSchema extends ObjectValidator<unknown>,
    TTypeConfigurationSchema extends ObjectValidator<unknown>,
    TPrimaryKeys extends keyof TProperties,
    TAdditionalKeys extends keyof TProperties = never,
    // These are defined to help simplify later types
    TProperties extends Input = TypeOf<TPropertiesSchema>,
    TTypeConfiguration extends Input = TypeOf<TTypeConfigurationSchema>,
    THandler = ResourceBuilderBase<
        TPropertiesSchema,
        TTypeConfigurationSchema,
        TPrimaryKeys,
        TAdditionalKeys,
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
    ) => Promise<DeleteResult<TProperties, TPrimaryKeys>>;

    readonly read: (
        this: THandler,
        event: ReadEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<SuccessWithPropertiesResult<TProperties, TPrimaryKeys>>;

    readonly list: (
        this: THandler,
        event: ListEvent<TTypeConfiguration>
    ) => Promise<ListResult<TProperties, TPrimaryKeys, TAdditionalKeys>>;
}

// Handler agnostic event format
interface GenericRequestEvent {
    action: Action;
    resourceProperties: unknown;
    oldResourceProperties?: unknown;
    typeConfiguration?: unknown;
}

interface HandlerContext {
    logger: Logger;
    metrics: MetricsPublisher;
    credentials: AwsCredentialIdentity;
    region: string;
    action?: Action;
}

export abstract class ResourceBuilderBase<
    TPropertiesSchema extends ObjectValidator<unknown>,
    TTypeConfigurationSchema extends ObjectValidator<unknown>,
    TPrimaryKeys extends keyof TProperties,
    TAdditionalKeys extends keyof TProperties,
    // These are defined to help simplify later types
    TProperties extends Input,
    TTypeConfiguration extends Input
> {
    #handlers: ResourceHandlers<
        TPropertiesSchema,
        TTypeConfigurationSchema,
        TPrimaryKeys,
        TAdditionalKeys,
        TProperties,
        TTypeConfiguration
    > | null = null;

    #context = new AsyncLocalStorage<HandlerContext>();
    typeName: string;

    get logger() {
        return this.#context.getStore()?.logger ?? defaultLogger;
    }

    get metrics() {
        return this.#context.getStore()?.metrics;
    }

    get currentAction() {
        return this.#context.getStore()?.action ?? 'UNKNOWN';
    }

    constructor(
        private readonly options: ResourceHandlerProperties<
            TPropertiesSchema,
            TTypeConfigurationSchema,
            TPrimaryKeys,
            TAdditionalKeys,
            TProperties,
            TTypeConfiguration
        >
    ) {
        this.typeName = options.typeName;
        options.transformProperties = options.transformProperties ?? {
            toJS: (properties: unknown) => properties as TProperties,
            fromJS: (properties: unknown) =>
                properties as TypeOf<TPropertiesSchema>,
        };
        options.transformTypeConfiguration =
            options.transformTypeConfiguration ?? {
                toJS: (properties: unknown) => properties as TTypeConfiguration,
            };
        options.transformIds = options.transformIds ?? {
            fromJS: (ids: Record<TPrimaryKeys, unknown>) => ids,
        };
    }

    public handle(
        options: ResourceHandlers<
            TPropertiesSchema,
            TTypeConfigurationSchema,
            TPrimaryKeys,
            TAdditionalKeys,
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

    async #testEntrypoint(event: any, context: Context): Promise<CfnResponse> {
        const startTime = performance.now();
        try {
            const testData = this.#ensure(TestRequestSchema, event);
            let credentials: RequestAwsCredentials | null = null;
            if (testData.logGroupName) {
                const provider = defaultNodeCredentials();
                const creds = await provider({});
                credentials = {
                    AccessKeyId: creds.accessKeyId,
                    SecretAccessKey: creds.secretAccessKey,
                    SessionToken: creds.sessionToken,
                };
            }

            const [logger, metrics, queues] = await getInstrumentation(
                {
                    Action: testData.action,
                    ResourceType: this.typeName,
                    ResourceTypeVersion: '0.1.0.dev1',
                    LogicalResourceId:
                        testData.request.logicalResourceIdentifier,
                    Region: testData.region,
                    StackId: 'TestStack',
                    ProviderCredentials: credentials,
                    ProviderLogGroupName: testData.logGroupName,
                },
                context,
                defaultLogger
            );

            const handlerContext = {
                logger,
                metrics,
                action: testData.action,
                credentials: testData.credentials,
                region: testData.region,
            } satisfies HandlerContext;

            const result = await this.#context.run(handlerContext, async () => {
                try {
                    await this.metrics.publishInvocationMetric(
                        new Date(),
                        testData.action
                    );

                    const result = await this.#handleRequest({
                        action: testData.action,
                        resourceProperties:
                            testData.request.desiredResourceState,
                        oldResourceProperties:
                            testData.request.previousResourceState,
                        typeConfiguration: testData.request.typeConfiguration,
                    });

                    // In dev, validate the outgoing models to identify errors earlier
                    if (
                        'ResourceModel' in result &&
                        testData.action !== 'READ'
                    ) {
                        this.#ensure(this.options.schema, result.ResourceModel);
                    }
                    this.logger.info({ result }, 'Successfully got result.');

                    await this.metrics.publishDurationMetric(
                        new Date(),
                        testData.action,
                        performance.now() - startTime
                    );
                    return result;
                } catch (e) {
                    this.logger.error(e, 'Failed to parse request');
                    this.metrics.publishExceptionMetric(
                        new Date(),
                        event?.action,
                        e
                    );
                    return this.#getErrorForException(e);
                }
            });

            // Wait for any metric or logger requests to drain.
            // Both implement timeouts internally, so we shouldn't need to do so here.
            await Promise.all(queues.map((p) => p?.onIdle()));
            return result;
        } catch (e) {
            defaultLogger.error(e, 'Fatal error while handling event');
            return this.#getErrorForException(e);
        }
    }

    async #entrypoint(event: any, context: Context): Promise<CfnResponse> {
        const startTime = performance.now();
        try {
            const baseRequest = ensureBaseRequest(event);
            const [logger, metrics, queues] = await getInstrumentation(
                {
                    Action: baseRequest.Action,
                    ResourceType: baseRequest.ResourceType,
                    ResourceTypeVersion: baseRequest.ResourceTypeVersion,
                    LogicalResourceId:
                        baseRequest.RequestData.LogicalResourceId,
                    Region: baseRequest.Region,
                    StackId: baseRequest.StackID,
                    ProviderCredentials:
                        baseRequest.RequestData.ProviderCredentials,
                    ProviderLogGroupName:
                        baseRequest.RequestData.ProviderLogGroupName,
                },
                context,
                defaultLogger
            );

            const callerCredentials = baseRequest.RequestData.CallerCredentials;
            const credentials = {
                accessKeyId: callerCredentials?.AccessKeyId,
                secretAccessKey: callerCredentials?.SecretAccessKey,
                sessionToken: callerCredentials?.SessionToken,
            } satisfies AwsCredentialIdentity;

            const handlerContext = {
                logger,
                metrics,
                action: baseRequest.Action,
                credentials,
                region: baseRequest.Region,
            } satisfies HandlerContext;

            const result = await this.#context.run(handlerContext, async () => {
                try {
                    await this.metrics.publishInvocationMetric(
                        new Date(),
                        baseRequest.Action
                    );

                    const result = await this.#handleRequest({
                        action: baseRequest.Action,
                        resourceProperties:
                            baseRequest.RequestData.ResourceProperties!,
                        oldResourceProperties:
                            baseRequest.RequestData.PreviousResourceProperties,
                        typeConfiguration:
                            baseRequest.RequestData.TypeConfiguration,
                    });

                    await this.metrics.publishDurationMetric(
                        new Date(),
                        baseRequest.Action,
                        performance.now() - startTime
                    );
                    return result;
                } catch (e) {
                    this.logger.error(e, 'Failed to parse request');
                    this.metrics.publishExceptionMetric(
                        new Date(),
                        event?.Action,
                        e
                    );
                }
            });

            // Wait for any metric or logger requests to drain.
            // Both implement timeouts internally, so we shouldn't need to do so here.
            await Promise.all(queues.map((p) => p?.onIdle()));
            return result;
        } catch (e) {
            defaultLogger.error(e, 'Fatal error while handling event');
            return this.#getErrorForException(e);
        }
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
            this.logger.error(e, 'Resource handler failed to process request');
            this.metrics.publishExceptionMetric(new Date(), event.action, e);
            return this.#getErrorForException(e);
        }
    }

    async #handleCreate({
        action,
        resourceProperties,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        assert(action === 'CREATE');
        const properties = this.#ensure(
            this.options.schema,
            resourceProperties
        );
        const typeConfiguration = this.#ensure(
            this.options.typeConfigurationSchema,
            rawTypeConfiguration ?? {}
        );
        const createHandler = this.#handlers!.create.bind(this);
        const result = await createHandler({
            action,
            properties: this.options.transformProperties?.toJS(properties),
            logger: this.logger,
            typeConfiguration:
                this.options.transformTypeConfiguration.toJS(typeConfiguration),
        });
        if (result.Status === OperationStatus.Success) {
            return {
                Status: result.Status,
                ResourceModel: this.options.transformProperties.fromJS(
                    result.Properties
                ),
            };
        } else {
            return {
                Status: result.Status,
                Message: result.Message,
                ErrorCode: result.ErrorCode,
                ResourceModel: this.options.transformProperties.fromJS(
                    result.Properties
                ),
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
        assert(action === 'UPDATE');
        const properties = this.#ensure(
            this.options.schema,
            resourceProperties
        );
        const oldProperties = this.#ensure(
            this.options.schema,
            oldResourceProperties
        );
        const typeConfiguration = this.#ensure(
            this.options.typeConfigurationSchema,
            rawTypeConfiguration ?? {}
        );
        const updateHandler = this.#handlers!.update.bind(this);
        const result = await updateHandler({
            action: action,
            properties: this.options.transformProperties.toJS(
                properties
            ) as any,
            previousProperties: this.options.transformProperties.toJS(
                oldProperties
            ) as any,
            logger: this.logger,
            typeConfiguration:
                this.options.transformTypeConfiguration.toJS(typeConfiguration),
        });
        if (result.Status === OperationStatus.Success) {
            return {
                Status: result.Status,
                ResourceModel: this.options.transformProperties.toJS(
                    result.Properties
                ),
            };
        } else {
            return {
                Status: result.Status,
                Message: result.Message,
                ErrorCode: result.ErrorCode,
                ResourceModel: this.options.transformProperties.toJS(
                    result.Properties
                ),
                CallbackContext: result.CallbackContext ?? {},
            };
        }
    }

    async #handleDelete({
        action,
        resourceProperties,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        assert(action === 'DELETE');
        const properties = this.#ensure(
            this.options.schema,
            resourceProperties
        );
        const typeConfiguration = this.#ensure(
            this.options.typeConfigurationSchema,
            rawTypeConfiguration ?? {}
        );
        const deleteHandler = this.#handlers!.delete.bind(this);
        const result = await deleteHandler({
            action: action,
            properties: this.options.transformProperties.toJS(
                properties
            ) as any,
            logger: this.logger,
            typeConfiguration:
                this.options.transformTypeConfiguration.toJS(typeConfiguration),
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
                ResourceModel: this.options.transformProperties.toJS(
                    result.Properties
                ),
                CallbackContext: result.CallbackContext ?? {},
            };
        }
    }

    async #handleRead({
        action,
        resourceProperties,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        assert(action === 'READ');
        const properties = this.#ensure(
            this.options.schema,
            resourceProperties
        );
        const typeConfiguration = this.#ensure(
            this.options.typeConfigurationSchema,
            rawTypeConfiguration ?? {}
        );
        const readHandler = this.#handlers!.read.bind(this);
        const result = await readHandler({
            action: action,
            properties: this.options.transformProperties.toJS(properties),
            logger: this.logger,
            typeConfiguration:
                this.options.transformTypeConfiguration.toJS(typeConfiguration),
        });
        return {
            Status: result.Status,
            ResourceModel: this.options.transformProperties.toJS(
                result.Properties
            ),
        };
    }

    async #handleList({
        resourceProperties,
        action,
        typeConfiguration: rawTypeConfiguration,
    }: GenericRequestEvent): Promise<CfnResponse> {
        assert(action === 'LIST');
        const typeConfiguration = this.#ensure(
            this.options.typeConfigurationSchema,
            rawTypeConfiguration ?? {}
        );
        const listHandler = this.#handlers!.list.bind(this);
        const result = await listHandler({
            action: action,
            logger: this.logger,
            properties: resourceProperties,
            typeConfiguration:
                this.options.transformTypeConfiguration.toJS(typeConfiguration),
        });
        return {
            Status: result.Status,
            ResourceModels: result.ResourceIds.map((model) =>
                this.options.transformIds.fromJS(model)
            ),
        };
    }

    #ensure<Schema extends ObjectValidator<unknown>>(
        schema: Schema,
        value: unknown
    ) {
        return ensure(schema, value, {
            ajvOptions: {
                coerceTypes: true,
            },
        });
    }

    #getErrorForException(e: unknown): CfnResponse {
        if (e !== null && (e instanceof Error || isNativeError(e))) {
            const serializedError = errorFormatter(e);
            const message: string = `${serializedError.type}: ${serializedError.message}\n${serializedError.stack}`;
            if (BaseHandlerError.isHandlerError(e)) {
                return {
                    Status: OperationStatus.Failed as const,
                    Message: message,
                    ErrorCode: e.code,
                };
            }
            if (serializedError.type === 'ValidationError') {
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

    public getSdk<TSdk>(
        sdk: new (config: RegionInputConfig & AwsAuthInputConfig) => TSdk
    ) {
        const context = this.#context.getStore();
        return new sdk({
            credentials: context?.credentials,
            region: context?.region,
        });
    }

    /**
     * Indicates the a resource was successfully created
     * @param properties The full properties of the resource, including the id(s).
     */
    public created(
        properties: SetRequired<TProperties, TPrimaryKeys>
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
        properties: InProgress<TProperties, TPrimaryKeys>['Properties'],
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
        properties: SetRequired<TProperties, TPrimaryKeys>
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
        properties: InProgress<TProperties, TPrimaryKeys>['Properties'],
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
    public deleted() {
        return {
            Status: OperationStatus.Success,
        } as const;
    }

    /**
     * Returns the result of a read operation
     * @param properties The full properties of the resource, including the id(s).
     */
    public readResult(properties: SetRequired<TProperties, TPrimaryKeys>) {
        return {
            Status: OperationStatus.Success,
            Properties: properties,
        } as const;
    }

    public listResult(
        properties: SetRequired<
            Pick<TProperties, TPrimaryKeys | TAdditionalKeys>,
            TPrimaryKeys
        >[],
        nextToken: string | null
    ): ListResult<TProperties, TPrimaryKeys, TAdditionalKeys> {
        return {
            Status: OperationStatus.Success,
            ResourceIds: properties,
            NextToken: nextToken,
        } as const;
    }
}
