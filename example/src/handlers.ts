import { resource } from './generated/index.js';

resource.handlers({
    async create(event) {
        return this.created({
            // ID (from primaryIdentifies) is required
            // Will return a type error if not provided
            tPSCode: '123456679',
            // Standard required properties
            title: 'My Title',
            testCode: 'NOT_STARTED',
        });
    },
    async update(event) {
        return this.updated({
            // ID (from primaryIdentifies) is required
            // Will return a type error if not provided
            tPSCode: '123456679',
            // Standard required properties
            title: 'My Title',
            testCode: 'NOT_STARTED',
        });
    },
    async delete(event) {
        return this.deleted();
    },
    async read(event) {
        return this.readResult({
            // ID (from primaryIdentifies) is required
            // Will return a type error if not provided
            tPSCode: '123456679',
            // Standard required properties
            title: 'My Title',
            testCode: 'NOT_STARTED',
        });
    },
    async list(event) {
        return this.listResult([
            {
                // ID (from primaryIdentifies) is required
                // Will return a type error if not provided
                tPSCode: '123456679',
                // Standard required properties
                title: 'My Title',
                testCode: 'NOT_STARTED',
            },
        ]);
    },
});

// Entrypoint for production usage after registered in CloudFormation
export const entrypoint = resource.entrypoint;

// Entrypoint used for local testing
export const testEntrypoint = resource.testEntrypoint;
