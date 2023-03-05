import { AwsCredentialIdentity } from '@aws-sdk/types';
import { ResourceNotFoundException } from '@aws-sdk/client-cloudwatch';
import {
    CloudWatchLogsClient,
    CreateLogGroupCommand,
    paginateDescribeLogStreams,
    CreateLogStreamCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { Writable } from 'node:stream';
import { type Logger } from 'pino';
import Pool from 'tinypool';
import type { publishLogMessage } from './background.js';
import { MetricsPublisher } from './metrics.js';

type PublishLogMessageArgs = Parameters<typeof publishLogMessage>;

export interface CloudWatchLogsStreamOptions {
    logGroupName: string;
    logStreamName: string;
    credentials: AwsCredentialIdentity;
    log: Logger;
    metrics: MetricsPublisher;
}

export class CloudWatchLogsStream extends Writable {
    private readonly logGroupName: string;
    private readonly logStreamName: string;
    private readonly client: CloudWatchLogsClient;
    private readonly log: Logger;
    private readonly metrics: MetricsPublisher;
    private readonly pool: Pool;

    constructor(options: CloudWatchLogsStreamOptions) {
        super({ objectMode: false });
        this.logGroupName = options.logGroupName;
        this.logStreamName = options.logStreamName;
        this.client = new CloudWatchLogsClient({
            credentials: options.credentials,
        });
        this.log = options.log.child({
            ['code.namespace']: 'CloudWatchLogsStream',
            logGroupName: this.logGroupName,
            logStreamName: this.logStreamName,
        });
        this.pool = new Pool({
            filename: new URL('./background.js', import.meta.url).href,
            workerData: {
                credentials: options.credentials,
            },
        });
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
                if (page.logStreams?.length ?? 0 === 0) {
                    continue;
                }
                for (const stream of page.logStreams) {
                    if (stream.logStreamName === this.logStreamName) {
                        this.log.info('Found existing log stream');
                        return;
                    }
                }
            }
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                this.log.info(error, 'No log group found, creating one');
                await this.client.send(
                    new CreateLogGroupCommand({
                        logGroupName: this.logGroupName,
                    })
                );
            } else {
                throw error;
            }
        }
        await this.createLogStream();
    }

    private async createLogStream() {
        this.log.info('Creating log stream');
        await this.client.send(
            new CreateLogStreamCommand({
                logGroupName: this.logGroupName,
                logStreamName: this.logStreamName,
            })
        );
    }

    _write(
        chunk: any,
        encoding: BufferEncoding,
        callback: (error?: Error) => void
    ): void {
        if (encoding === 'binary') {
            callback(new Error('Binary encoding not supported'));
            return;
        }

        if (typeof chunk !== 'string') {
            callback(new Error('Only strings are supported'));
            return;
        }
        const timestamp = Math.round(Date.now());
        const record = {
            message: chunk,
            timestamp,
        };
        this.pool
            .run(
                {
                    logEvents: [record],
                    logGroupName: this.logGroupName,
                    logStreamName: this.logStreamName,
                } satisfies PublishLogMessageArgs[0],
                { name: 'publishLogMessage' }
            )
            .then(() => callback())
            .catch((error) => {
                this.log.error(error, 'Error publishing log message');
            });
    }
}
