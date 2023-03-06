import Pool from 'tinypool';
import type { AwsCredentialIdentity } from '@aws-sdk/types';

export function getPool(credentials: AwsCredentialIdentity) {
    return new Pool({
        // When we're running after compilation, this is the path to the compiled worker
        filename: new URL('./generated/worker.js', import.meta.url).href,
        workerData: {
            credentials: credentials,
        },
    });
}
