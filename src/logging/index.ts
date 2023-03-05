import { MetricsPublisher } from './metrics';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { Logger, multistream, pino } from 'pino';
import { pinoLambdaDestination } from 'pino-lambda';
import { BaseRequest } from '~/event';
import { LambdaContext, LambdaEvent } from 'pino-lambda/dist/types';
import { withRequest } from './base';
import { CloudWatchLogsStream } from './cloudwatch-stream';
import camelcaseKeys from 'camelcase-keys';

function isCredentials(
    credentials: unknown
): credentials is AwsCredentialIdentity {
    return (
        typeof credentials === 'object' &&
        credentials !== null &&
        'accessKeyId' in credentials &&
        'secretAccessKey' in credentials
    );
}

export async function getInstrumentation(
    request: BaseRequest,
    context: LambdaContext,
    log: Logger
): Promise<[Logger, MetricsPublisher]> {
    withRequest(request, context);

    const lambdaDestination = pinoLambdaDestination();
    const resourceType = request.RequestType;

    let providerCredentials = request.RequestData?.ProviderCredentials;
    let credentials: AwsCredentialIdentity | null = null;
    if (providerCredentials && providerCredentials.AccessKeyId) {
        credentials = camelcaseKeys(providerCredentials);
    }

    const metrics = new MetricsPublisher(log, credentials, resourceType);

    if (!credentials) {
        return [pino({}, lambdaDestination), metrics];
    }

    const prefix = getCloudWatchPrefix(request.RequestType, request);
    const logStream = new CloudWatchLogsStream({
        logGroupName: request.RequestData.ProviderLogGroupName!,
        logStreamName: prefix,
        credentials: credentials,
        log,
        metrics,
    });

    try {
        await logStream.ensureLogGroup();
    } catch (e) {
        log.error(e, 'Error ensuring log group');
        metrics.publishExceptionMetric(new Date(), request.Action!, e);
        return [pino({}, lambdaDestination), metrics];
    }

    const requestLogger = pino({}, multistream([logStream, lambdaDestination]));
    return [requestLogger, metrics];
}

function getCloudWatchPrefix(resourceType: string, request: BaseRequest) {
    let cwPrefix = `/${resourceType.replace('::', '/')}/`;
    if (request.RequestData.LogicalResourceId) {
        cwPrefix += request.RequestData.LogicalResourceId + '/';
    }
    return cwPrefix;
}
