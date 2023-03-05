import { Context } from 'aws-lambda';
import { MetricsPublisher } from './metrics.js';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { Logger, multistream, pino } from 'pino';
import { pinoLambdaDestination } from 'pino-lambda';
import { BaseRequest } from '~/event.js';
import { withRequest } from './base.js';
import { CloudWatchLogsStream } from './cloudwatch-stream.js';
import camelcaseKeys from 'camelcase-keys';

export async function getInstrumentation(
    request: BaseRequest,
    context: Context,
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
