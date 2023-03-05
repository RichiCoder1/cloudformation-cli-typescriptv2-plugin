import { pino } from 'pino';
import { lambdaRequestTracker, pinoLambdaDestination } from 'pino-lambda';

export const defaultLogger = pino({}, pinoLambdaDestination());
export const withRequest = lambdaRequestTracker();
