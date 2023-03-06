import { pino } from 'pino';
import { lambdaRequestTracker, pinoLambdaDestination } from 'pino-lambda';

export const defaultRedaction = {
    paths: [
        '*.RequestData.CallerCredentials',
        '*.requestData.callerCredentials',
        '*.requestData.providerCredentials',
        '*.RequestData.TypeConfiguration',
        '*.requestData.typeConfiguration',
        '*.typeConfiguration',
    ],
};
export const defaultLogger = pino(
    {
        base: {},
        redact: defaultRedaction,
    },
    pinoLambdaDestination()
);
export const withRequest = lambdaRequestTracker();
