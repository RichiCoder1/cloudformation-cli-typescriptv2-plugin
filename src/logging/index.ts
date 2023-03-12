import { Context } from 'aws-lambda';
import { MetricsPublisher } from './metrics.js';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { Logger, multistream, pino } from 'pino';
import { pinoLambdaDestination } from 'pino-lambda';
import pQueue from 'p-queue';
import { RequestAwsCredentials, Action } from '~/request.js';
import { defaultRedaction, defaultLogger, withRequest } from './base.js';
import { CloudWatchLogsStream } from './cloudwatch-stream.js';

export interface InstrumentationProps {
    readonly Action: Action;
    readonly ResourceType: string;
    readonly ResourceTypeVersion: string | null;
    readonly LogicalResourceId: string | null;
    readonly Region: string | null;
    readonly StackId: string | null;
    readonly ProviderCredentials?: RequestAwsCredentials;
    readonly ProviderLogGroupName?: string;
}

export async function getInstrumentation(
    props: InstrumentationProps,
    context: Context,
    log: Logger
): Promise<[Logger, MetricsPublisher, [pQueue | null, pQueue | null]]> {
    const { ProviderCredentials, ...event } = props;
    withRequest(props, context);

    const lambdaDestination = pinoLambdaDestination();
    const resourceType = event.ResourceType;
    const version = event.ResourceTypeVersion;

    const childContext = {
        cloudformation: {
            action: event.Action,
            resourceType: resourceType,
            version,
            // Should we log account id?
            region: event.Region,
            stackId: event.StackId,
            logicalResourceId: event.LogicalResourceId,
        },
    };

    const telemetryPrefix = resourceType.replace(/::/g, '/');

    let credentials: AwsCredentialIdentity | null = null;
    if (ProviderCredentials && ProviderCredentials.AccessKeyId) {
        credentials = {
            accessKeyId: ProviderCredentials.AccessKeyId,
            secretAccessKey: ProviderCredentials.SecretAccessKey,
            sessionToken: ProviderCredentials.SessionToken,
        };
    }

    const metrics = new MetricsPublisher(
        log,
        credentials,
        resourceType,
        telemetryPrefix
    );

    if (!credentials) {
        log.warn(
            'No credentials found, skipping CloudWatch metrics and log stream creation.'
        );
        return [
            defaultLogger.child(childContext),
            metrics,
            [metrics.queue, null],
        ];
    }

    const logStream = new CloudWatchLogsStream({
        logGroupName: event.ProviderLogGroupName!,
        logStreamName: telemetryPrefix,
        credentials: credentials,
        log,
        metrics,
    });

    try {
        await logStream.ensureLogGroup();
    } catch (e) {
        log.error(e, 'Error ensuring log group');
        metrics.publishLogDeliveryExceptionMetric(new Date(), e as Error);
        return [
            defaultLogger.child(childContext),
            metrics,
            [metrics.queue, null],
        ];
    }

    const requestLogger = pino(
        {
            redact: defaultRedaction,
            base: childContext,
        },
        multistream([logStream, lambdaDestination])
    );
    return [requestLogger, metrics, [metrics.queue, logStream.queue]];
}
