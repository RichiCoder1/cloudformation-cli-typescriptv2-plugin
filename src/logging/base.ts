import { pino } from 'pino';
import { lambdaRequestTracker, pinoLambdaDestination } from 'pino-lambda';

const logLevel = process.env.LOG_LEVEL;

export const defaultRedaction = {
    paths: [
        '*.RequestData.CallerCredentials',
        '*.requestData.callerCredentials',
        '*.RequestData.ProviderCredentials',
        '*.requestData.providerCredentials',
        '*.RequestData.TypeConfiguration',
        '*.requestData.typeConfiguration',
        '*.typeConfiguration',
        '*.credentials',
    ],
};
export const defaultLogger = pino(
    {
        base: {},
        redact: defaultRedaction,
        level: logLevel,
    },
    pinoLambdaDestination()
);
export const withRequest = lambdaRequestTracker();
