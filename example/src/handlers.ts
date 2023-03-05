import { resource } from './generated/index.js';

resource.handlers({
    async create(event) {
        return this.created({
            tPSCode: 'askljda',
            title: 'asdad',
            testCode: 'NOT_STARTED',
        });
    },
});

// Entrypoint for production usage after registered in CloudFormation
export const entrypoint = resource.entrypoint;

// Entrypoint used for local testing
export const testEntrypoint = resource.testEntrypoint;
