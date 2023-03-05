import { ResourceHandler } from '{{ lib_name }}';
import { schemaResourceProperties } from './generated/resource';

const resource = new ResourceHandler({
    schema: schemaResourceProperties,
    async create({ request, properties }) {
        return {
            status: 'SUCCESS',
            properties: {},
        };
    },
});

// Entrypoint for production usage after registered in CloudFormation
export const entrypoint = resource.entrypoint;

// Entrypoint used for local testing
export const testEntrypoint = resource.testEntrypoint;
