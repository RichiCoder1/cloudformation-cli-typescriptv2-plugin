import { AwsCredentialIdentity } from '@aws-sdk/types';
import {
    CloudWatch,
    Dimension,
    PutMetricDataInput,
    StandardUnit,
} from '@aws-sdk/client-cloudwatch';
import { Logger } from 'pino';
import { Action } from '~/request.js';
import { isNativeError } from 'node:util/types';
import pQueue from 'p-queue';
import pRetry from 'p-retry';

export enum MetricTypes {
    HandlerException = 'HandlerException',
    HandlerInvocationCount = 'HandlerInvocationCount',
    HandlerInvocationDuration = 'HandlerInvocationDuration',
}

const METRIC_NAMESPACE_ROOT = 'AWS/CloudFormation';

export type DimensionRecord = Record<string, string>;

export function formatDimensions(
    dimensions: DimensionRecord
): Array<Dimension> {
    const formatted: Array<Dimension> = [];
    for (const [key, value] of Object.entries(dimensions)) {
        const dimension: Dimension = {
            Name: key,
            Value: value,
        };
        formatted.push(dimension);
    }
    return formatted;
}

export class MetricsPublisher {
    public readonly queue: pQueue | undefined;

    private resourceNamespace: string;
    private client: CloudWatch | null = null;

    constructor(
        private readonly logger: Logger,
        readonly credentials: AwsCredentialIdentity | null,
        private readonly resourceType: string,
        prefix: string
    ) {
        this.resourceNamespace = `${prefix}`;
        if (credentials?.accessKeyId) {
            this.client = new CloudWatch({ credentials });
            this.queue = new pQueue();
        }
    }

    async publishMetric(
        metricName: PutMetricDataInput['MetricData'][0]['MetricName'],
        dimensions: DimensionRecord,
        unit: PutMetricDataInput['MetricData'][0]['Unit'],
        value: number,
        timestamp: Date
    ): Promise<void> {
        if (!this.client) {
            return Promise.resolve();
        }
        try {
            this.logger.debug({ metricName }, 'Publishing metric.');
            const timeout = AbortSignal.timeout(5000);
            await this.queue.add(
                async () => {
                    return pRetry(
                        () => {
                            return this.client.putMetricData({
                                Namespace: `${METRIC_NAMESPACE_ROOT}/${this.resourceNamespace}`,
                                MetricData: [
                                    {
                                        MetricName: metricName,
                                        Dimensions:
                                            formatDimensions(dimensions),
                                        Unit: unit,
                                        Timestamp: timestamp,
                                        Value: value,
                                    },
                                ],
                            });
                        },
                        { retries: 3, signal: timeout }
                    );
                },
                { signal: timeout }
            );
        } catch (err) {
            this.logger.error(
                err,
                `An error occurred while publishing metrics`
            );
        }
    }

    /**
     * Publishes an exception based metric
     */
    async publishExceptionMetric(
        timestamp: Date,
        action: Action,
        error: unknown
    ): Promise<any> {
        if (!(error instanceof Error) && !isNativeError(error)) {
            return;
        }

        const dimensions: DimensionRecord = {
            DimensionKeyActionType: action,
            DimensionKeyExceptionType: error.name,
            DimensionKeyResourceType: this.resourceType,
        };
        return this.publishMetric(
            MetricTypes.HandlerException,
            dimensions,
            StandardUnit.Count,
            1.0,
            timestamp
        );
    }

    /**
     * Publishes a metric related to invocations
     */
    async publishInvocationMetric(
        timestamp: Date,
        action: Action
    ): Promise<any> {
        const dimensions: DimensionRecord = {
            DimensionKeyActionType: action,
            DimensionKeyResourceType: this.resourceType,
        };
        return this.publishMetric(
            MetricTypes.HandlerInvocationCount,
            dimensions,
            StandardUnit.Count,
            1.0,
            timestamp
        );
    }

    /**
     * Publishes an duration metric
     */
    async publishDurationMetric(
        timestamp: Date,
        action: Action,
        milliseconds: number
    ): Promise<any> {
        const dimensions: DimensionRecord = {
            DimensionKeyActionType: action,
            DimensionKeyResourceType: this.resourceType,
        };
        return this.publishMetric(
            MetricTypes.HandlerInvocationDuration,
            dimensions,
            StandardUnit.Milliseconds,
            milliseconds,
            timestamp
        );
    }

    /**
     * Publishes an log delivery exception metric
     */
    async publishLogDeliveryExceptionMetric(
        timestamp: Date,
        error: Error
    ): Promise<any> {
        const dimensions: DimensionRecord = {
            DimensionKeyActionType: 'ProviderLogDelivery',
            DimensionKeyExceptionType: error.name,
            DimensionKeyResourceType: this.resourceType,
        };
        try {
            return await this.publishMetric(
                MetricTypes.HandlerException,
                dimensions,
                StandardUnit.Count,
                1.0,
                timestamp
            );
        } catch (err) {
            this.logger.error(err, 'Failed to publish log delivery metric');
        }
        return Promise.resolve(null);
    }
}
