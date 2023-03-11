import { resourceBuilder } from '$cfn/index.js';

const { entrypoint, testEntrypoint } = resourceBuilder
    .handle({
        async create(event) {
            this.logger.info(event.properties);
            return this.created({
                // ID (from primaryIdentifies) is required
                // Will return a type error if not provided
                tpsCode: '123456679',
                // Standard required properties
                title: 'My Title',
                testCode: 'NOT_STARTED',
            });
        },
        async update(event) {
            return this.updated({
                // ID (from primaryIdentifies) is required
                // Will return a type error if not provided
                tpsCode: '123456679',
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
                tpsCode: '123456679',
                // Standard required properties
                title: 'My Title',
                testCode: 'NOT_STARTED',
            });
        },
        async list(event) {
            return this.listResult(
                [
                    {
                        // ID (from primaryIdentifies) is required
                        // Will return a type error if not provided
                        tpsCode: '123456679',
                    },
                ],
                null
            );
        },
    })
    .build();

// Entrypoint for production usage after registered in CloudFormation
export { entrypoint, testEntrypoint };
