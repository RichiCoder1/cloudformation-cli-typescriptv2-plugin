import { MetricsPublisher } from './logging/metrics.js';
import { Logger } from 'pino';
import { Context } from 'aws-lambda';
import camelcaseKeys from 'camelcase-keys';
import { compile, CoreValidator, TypeOf } from 'suretype';
import { BaseRequest } from '~/event.js';
import { ensureBaseRequest } from './event.js';
import {
    OnCreateEvent,
    OnCreateResult,
    SuccessWithCallback,
} from './handlers.js';
import { defaultLogger } from './logging/base.js';
import { getInstrumentation } from './logging/index.js';
import { BaseResponse, OperationStatus } from './response.js';
import { SetRequired, CamelCasedPropertiesDeep } from 'type-fest';

export interface ResourceHandlerProperties<
    TProperties extends CoreValidator<unknown>,
    TTypeConfiguration extends CoreValidator<unknown> = BaseRequest['RequestData']['TypeConfiguration'],
    TPrimaryKeys extends keyof TypeOf<TProperties> = never
> {
    readonly typeName: string;
    readonly schema: TProperties;
    readonly ids: readonly TPrimaryKeys[];
    readonly typeConfigurationSchema?: TTypeConfiguration;
}

export interface ResourceHandlers<
    TProperties extends CoreValidator<unknown>,
    TTypeConfiguration extends CoreValidator<unknown> = BaseRequest['RequestData']['TypeConfiguration'],
    TPrimaryKeys extends keyof TypeOf<TProperties> = never,
    THandler = ResourceHandlerBase<
        TProperties,
        TTypeConfiguration,
        TPrimaryKeys
    >
> {
    readonly create?: (
        this: THandler,
        event: OnCreateEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) => Promise<OnCreateResult<TProperties, TPrimaryKeys>>;
}

export abstract class ResourceHandlerBase<
    TProperties extends CoreValidator<unknown>,
    TTypeConfiguration extends CoreValidator<unknown>,
    TPrimaryKeys extends keyof TypeOf<TProperties>
> {
    #handlers: ResourceHandlers<
        TProperties,
        TTypeConfiguration,
        TPrimaryKeys
    > | null = null;

    #logger: Logger = defaultLogger;
    #metrics: MetricsPublisher | null = null;

    get logger() {
        return this.#logger;
    }

    get metrics() {
        return this.#metrics!;
    }

    constructor(
        private readonly options: ResourceHandlerProperties<
            TProperties,
            TTypeConfiguration,
            TPrimaryKeys
        >
    ) {}

    public handlers(
        options: ResourceHandlers<TProperties, TTypeConfiguration, TPrimaryKeys>
    ) {
        this.#handlers = options;
    }

    public async entrypoint(
        event: unknown,
        context: Context
    ): Promise<BaseResponse> {
        try {
            const baseRequest = ensureBaseRequest(event);
            const [logger, metrics] = await getInstrumentation(
                baseRequest,
                context,
                defaultLogger
            );
            this.#logger = logger;
            const ensureProperties = compile(this.options.schema, {
                ensure: true,
            });
            switch (baseRequest.Action) {
                case 'CREATE':
                    const properties = ensureProperties(
                        baseRequest.RequestData.ResourceProperties
                    );
                    const createHandler = this.#handlers!.create.bind(this);
                    const result = await createHandler({
                        requestType: 'Create',
                        properties: camelcaseKeys(properties, {
                            deep: true,
                        }) as any,
                        request: baseRequest,
                        logger,
                        typeConfiguration:
                            baseRequest.RequestData.TypeConfiguration,
                    });
                    return {
                        Status: OperationStatus.Success,
                        ResourceModel: camelcaseKeys(result.properties, {
                            deep: true,
                            pascalCase: true,
                        }),
                    };
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
                    throw error;
            }
        } catch (e) {
            defaultLogger.error(e, 'Failed to parse request');
            throw e;
        }
    }

    public created(
        properties: CamelCasedPropertiesDeep<
            SetRequired<TypeOf<TProperties>, TPrimaryKeys>
        >
    ): OnCreateResult<TProperties, TPrimaryKeys> {
        return {
            status: 'SUCCESS',
            properties,
        };
    }

    public createInProgress(
        properties: SuccessWithCallback<TProperties>['properties'],
        callbackContext: Record<string, string>
    ): OnCreateResult<TProperties, TPrimaryKeys> {
        return {
            status: 'IN_PROGRESS',
            properties,
            callbackContext,
        };
    }
}
