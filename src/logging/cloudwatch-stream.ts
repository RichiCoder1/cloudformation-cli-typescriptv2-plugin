import { AwsCredentialIdentity } from '@aws-sdk/types';
import {
    CloudWatchLogs,
    paginateDescribeLogStreams,
    ResourceNotFoundException,
    ResourceAlreadyExistsException,
} from '@aws-sdk/client-cloudwatch-logs';
import { Writable } from 'node:stream';
import { type Logger } from 'pino';
import pQueue from 'p-queue';
import pRetry from 'p-retry';
import { MetricsPublisher } from './metrics.js';

export interface CloudWatchLogsStreamOptions {
    logGroupName: string;
    logStreamName: string;
    credentials: AwsCredentialIdentity;
    log: Logger;
    metrics: MetricsPublisher;
}

export class CloudWatchLogsStream extends Writable {
    public readonly queue: pQueue;

    private readonly logGroupName: string;
    private readonly logStreamName: string;
    private readonly client: CloudWatchLogs;
    private readonly log: Logger;
    private readonly metrics: MetricsPublisher;

    constructor(options: CloudWatchLogsStreamOptions) {
        super({ objectMode: false, defaultEncoding: 'utf-8' });
        this.logGroupName = options.logGroupName;
        this.logStreamName = options.logStreamName;
        this.client = new CloudWatchLogs({
            credentials: options.credentials,
        });
        this.log = options.log.child({
            ['code.namespace']: 'CloudWatchLogsStream',
            logGroupName: this.logGroupName,
            logStreamName: this.logStreamName,
        });
        this.queue = new pQueue({});
    }

    async ensureLogGroup() {
        try {
            this.log.debug('Checking for log group');
            const paginator = paginateDescribeLogStreams(
                {
                    client: this.client,
                    pageSize: 5,
                },
                {
                    logGroupName: this.logGroupName,
                    logStreamNamePrefix: this.logStreamName,
                }
            );

            for await (const page of paginator) {
                if ((page.logStreams?.length ?? 0) === 0) {
                    continue;
                }
                for (const stream of page.logStreams) {
                    if (stream.logStreamName === this.logStreamName) {
                        this.log.debug('Found existing log stream');
                        return;
                    }
                }
            }
        } catch (error: any) {
            if (error instanceof ResourceNotFoundException) {
                this.log.debug('No log group found, creating one');
                await this.client.createLogGroup({
                    logGroupName: this.logGroupName,
                });
                this.log.debug(`Created log group.`);
            } else {
                this.log.error(error, 'Failed to check for log group.');
                throw error;
            }
        }
        await this.createLogStream();
    }

    private async createLogStream() {
        try {
            this.log.debug('Creating log stream');
            await this.client.createLogStream({
                logGroupName: this.logGroupName,
                logStreamName: this.logStreamName,
            });
        } catch (error) {
            if (error instanceof ResourceAlreadyExistsException) {
                this.log.debug('Log stream already exists.');
            } else {
                throw error;
            }
        }
    }

    _write(
        chunk: any,
        encoding: BufferEncoding,
        callback: (error?: Error) => void
    ): void {
        if (encoding === 'binary') {
            const error = new Error('Binary encoding not supported');
            this.metrics.publishLogDeliveryExceptionMetric(new Date(), error);
            callback(error);
            return;
        }

        let message: string;
        try {
            message = chunk.toString();
        } catch (error) {
            this.log.error(error, `Failed to stringify chunk`);
            this.log.error(
                { chunk, encoding },
                `Got chunk type: ${typeof chunk}`
            );
            this.metrics.publishLogDeliveryExceptionMetric(
                new Date(),
                error as Error
            );
            callback(error as Error);
            return;
        }

        const timestamp = Math.round(Date.now());
        const record = {
            message,
            timestamp,
        };
        const timeout = AbortSignal.timeout(5000);
        this.queue
            .add(
                async () => {
                    return await pRetry(
                        () => {
                            return this.client.putLogEvents({
                                logEvents: [record],
                                logGroupName: this.logGroupName,
                                logStreamName: this.logStreamName,
                            });
                        },
                        { retries: 3, signal: timeout }
                    );
                },
                { signal: timeout }
            )
            .then(() => callback())
            .catch((error) => {
                this.log.error(error, 'Error publishing log message');
                this.metrics
                    .publishLogDeliveryExceptionMetric(new Date(), error)
                    .then(() => callback(error));
            });
    }
}
