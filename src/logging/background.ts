import type { AwsCredentialIdentity } from '@aws-sdk/types';
import {
    PutMetricDataCommandInput,
    CloudWatch,
} from '@aws-sdk/client-cloudwatch';
import {
    CloudWatchLogs,
    PutLogEventsCommandInput,
} from '@aws-sdk/client-cloudwatch-logs';
import pRetry from 'p-retry';
import Pool from 'tinypool';

export type WorkerData = {
    credentials: AwsCredentialIdentity;
};

const workerData = Pool.workerData as WorkerData;

const logClient = new CloudWatchLogs({
    credentials: workerData.credentials,
});

const metricClient = new CloudWatch({
    credentials: workerData.credentials,
});

export async function publishLogMessage(input: PutLogEventsCommandInput) {
    return pRetry(
        async () => {
            await logClient.putLogEvents(input);
        },
        { retries: 3 }
    );
}

export async function publishMetric(input: PutMetricDataCommandInput) {
    return pRetry(
        async () => {
            await metricClient.putMetricData(input);
        },
        { retries: 3 }
    );
}
