import camelcaseKeys from 'camelcase-keys';
import { ensureBaseRequest } from './event';
import { BaseRequest } from '~/event';
import { OnCreateEvent, OnCreateResult } from './handlers';
import { compile, CoreValidator, TypeOf } from 'suretype';
import { Context } from 'aws-lambda';
import { BaseResponse, OperationStatus } from './response';
import { getInstrumentation } from './logging';
import { defaultLogger } from './logging/base';

export interface ResourceHandlerProperties<
    TProperties extends CoreValidator<unknown>,
    TTypeConfiguration extends CoreValidator<unknown> = BaseRequest['RequestData']['TypeConfiguration'],
    TPrimaryKeys extends keyof TypeOf<TProperties> = never
> {
    readonly typeName: string;
    readonly schema: TProperties;
    readonly typeConfigurationSchema?: TTypeConfiguration;
    create(
        event: OnCreateEvent<TProperties, TTypeConfiguration, TPrimaryKeys>
    ): Promise<OnCreateResult<TProperties>>;
}

export class ResourceHandler<TProperties extends CoreValidator<unknown>> {
    constructor(
        private readonly options: ResourceHandlerProperties<TProperties>
    ) {}

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
            const ensureProperties = compile(this.options.schema, {
                ensure: true,
            });
            switch (baseRequest.Action) {
                case 'CREATE':
                    const properties = ensureProperties(
                        baseRequest.RequestData.ResourceProperties
                    );
                    const result = await this.options.create({
                        requestType: 'Create',
                        properties: camelcaseKeys(properties, { deep: true }),
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
}
