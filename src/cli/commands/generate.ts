import { Program } from '../program.js';
import { join } from 'path';
import {
    quicktype,
    InputData,
    JSONSchemaInput,
    FetchingJSONSchemaStore,
} from 'quicktype-core';
import { legalizeName } from 'quicktype-core/dist/language/JavaScript.js';
import { isES3IdentifierStart } from 'quicktype-core/dist/language/JavaScriptUnicodeMaps.js';
import {
    splitIntoWords,
    combineWords,
    allLowerWordStyle,
    firstUpperWordStyle,
} from 'quicktype-core/dist/support/Strings.js';
import {
    acronymStyle,
    AcronymStyleOptions,
} from 'quicktype-core/dist/support/Acronyms.js';
import { default as tsDedent } from 'ts-dedent';
const { dedent } = tsDedent;

const LIB_NAME = '@richicoder/cloudformation-cli-typescriptv2-lib';

const jsifier = (original: string) => {
    const acronyms = acronymStyle(AcronymStyleOptions.Pascal);
    const words = splitIntoWords(original);
    return combineWords(
        words,
        legalizeName,
        allLowerWordStyle,
        firstUpperWordStyle,
        allLowerWordStyle,
        acronyms,
        '',
        isES3IdentifierStart
    );
};

export const generate = (program: Program): Program =>
    program.command(
        ['generate'],
        'Generates typescript code based on resource schema',
        (yargs) =>
            yargs
                .option('schema', {
                    type: 'string',
                    description: 'The path to the resource schema.',
                })
                .options('root', {
                    type: 'string',
                    description: 'The root directory for the resource.',
                    default: './',
                })
                .option('out', {
                    type: 'string',
                    description: 'The output directory for generated code.',
                    default: '.cfn/typescript/generated',
                })
                .option('jsify', {
                    type: 'boolean',
                    description: 'The output directory for generated code.',
                    default: false,
                }),
        async (argv) => {
            const { makeConverter, getJsonSchemaReader, getSureTypeWriter } =
                await import('typeconv');

            const {
                default: { readJson, exists, mkdirp, writeFile, emptyDir },
            } = await import('fs-extra');
            const { v, extractSingleJsonSchema } = await import('suretype');
            const { JsonPointer } = await import('json-ptr');

            const { schema, root, out, jsify } = argv;

            if (!(await exists(schema))) {
                console.error(`Schema file ${schema} does not exist.`);
                throw new Error(`Schema file ${schema} does not exist.`);
            }

            const outputDirectory = join(root, out);
            try {
                await mkdirp(outputDirectory);
            } catch (e) {
                console.error(
                    `Could not create output directory ${outputDirectory}`
                );
                throw e;
            }

            await emptyDir(outputDirectory);

            const reader = getJsonSchemaReader();
            const writer = getSureTypeWriter({
                useUnknown: true,
                unsupported: 'error',
                missingReference: 'error',
                userPackage: 'cloudformation-cli-typescriptv2-plugin',
                userPackageUrl:
                    'https://github.com/richicoder1/cloudformation-cli-typescriptv2-plugin',
                exportValidator: false,
                exportEnsurer: false,
                exportTypeGuard: false,
            });

            const { convert } = makeConverter(reader, writer);

            const schemaJson = await readJson(schema, 'utf8');

            // Modify the schema to make it work with suretype, as well as do some extra validation steps
            const { definitions, ...resource } = structuredClone(schemaJson);
            resource.type = 'object';
            resource.additionalProperties = false;
            definitions['ResourceProperties'] = resource;

            const typeConfigurationSchema =
                resource.typeConfiguration ??
                extractSingleJsonSchema(v.object({}).additional(false)).schema;

            definitions['TypeConfiguration'] = typeConfigurationSchema;

            const idPaths: string[] = resource['primaryIdentifier'];
            const additionalIdPaths: string[] =
                resource['additionalIdentifiers'] ?? [];
            const requiredIds = new Set<string>();
            const additionalIds = new Set<string>();
            for (const id of idPaths) {
                const ptr = new JsonPointer(id);
                const path = ptr.path;
                if (ptr.path.length !== 2) {
                    throw new Error(
                        `Invalid primaryIdentifier ${id}. The primaryIdentifier must be a direct property. Nested properties are not supported.`
                    );
                }
                if (path[0] !== 'properties') {
                    throw new Error(
                        `Invalid primaryIdentifier ${id}. The primaryIdentifier must come from properties.`
                    );
                }
                if (typeof path[1] === 'number') {
                    throw new Error(
                        `Invalid primaryIdentifier ${id}. The primaryIdentifier must be a fixed property name, not any array index.`
                    );
                }
                requiredIds.add(path[1]);
            }

            for (const id of additionalIdPaths) {
                const ptr = new JsonPointer(id);
                const path = ptr.path;
                if (ptr.path.length !== 2) {
                    throw new Error(
                        `Invalid additionalIdentifiers ${id}. The primaryIdentifier must be a direct property. Nested properties are not supported.`
                    );
                }
                if (path[0] !== 'properties') {
                    throw new Error(
                        `Invalid additionalIdentifiers ${id}. The primaryIdentifier must come from properties.`
                    );
                }
                if (typeof path[1] === 'number') {
                    throw new Error(
                        `Invalid additionalIdentifiers ${id}. The primaryIdentifier must be a fixed property name, not any array index.`
                    );
                }
                additionalIds.add(path[1]);
            }

            const { data } = await convert({ data: { definitions } as any });

            await writeFile(join(outputDirectory, 'schema.ts'), data, 'utf8');

            const indexSource = jsify
                ? getTransformedEmit(
                      Array.from(requiredIds),
                      Array.from(additionalIds),
                      schemaJson.typeName
                  )
                : getUntransformedEmit(
                      Array.from(requiredIds),
                      Array.from(additionalIds),
                      schemaJson.typeName
                  );

            await writeFile(join(outputDirectory, 'index.ts'), indexSource);

            /** Only emit transformer mapper if we're mapping between cases */
            if (jsify) {
                const quickTypeSchema = structuredClone(schemaJson);
                quickTypeSchema.type = 'object';
                quickTypeSchema.additionalProperties = false;
                quickTypeSchema.definitions['TypeConfiguration'] =
                    typeConfigurationSchema;
                const schemaInput = new JSONSchemaInput(
                    new FetchingJSONSchemaStore()
                );

                // We could add multiple schemas for multiple types,
                // but here we're just making one type from JSON schema.
                await schemaInput.addSource({
                    name: 'TransformedResourceProperties',
                    schema: JSON.stringify(quickTypeSchema),
                });
                await schemaInput.addSource({
                    name: 'TransformedTypeConfiguration',
                    schema: JSON.stringify(typeConfigurationSchema),
                });

                const inputData = new InputData();
                inputData.addInput(schemaInput);

                const result = await quicktype({
                    inputData,
                    lang: 'typescript',
                    rendererOptions: {
                        converters: 'all-objects',
                        'raw-type': 'any',
                        'nice-property-names': 'true',
                        'prefer-unions': 'true',
                        'acronym-style': 'camel',
                    },
                });

                const transformer = dedent`
                    /* tslint:disable */
                    /* eslint-disable */
                    /**
                     * This file is generated by quicktype on behalf of cfn-cli-typescriptv2-plugin, DO NOT EDIT.
                     * For more information, see:
                     *  - {@link https://github.com/quicktype/quicktype}
                     *  - {@link https://github.com/richicoder1/cloudformation-cli-typescriptv2-plugin}
                     */
                    ${fixupQuicktype(result.lines)}
                `;

                await writeFile(
                    join(outputDirectory, 'transformer.ts'),
                    transformer,
                    'utf8'
                );

                function fixupQuicktype(lines: string[]) {
                    let aggregated = lines.join('\n');
                    aggregated = aggregated.replace(
                        /props: \[\], additional/i,
                        'props: [] as any[], additional'
                    );
                    return aggregated;
                }
            }
        }
    );

function getUntransformedEmit(
    primaryIds: string[],
    additionalIds: string[],
    typeName: string
) {
    return dedent`
    /* tslint:disable */
    /* eslint-disable */
    import { ResourceBuilderBase } from '${LIB_NAME}';
    import { schemaResourceProperties, schemaTypeConfiguration, ResourceProperties, TypeConfiguration } from './schema.js';

    export const TypeName = '${typeName}';

    export const PrimaryIds = [
      ${[...primaryIds].map((id) => `'${id}'`).join(',\n')}
    ] as const;
    export type PrimaryId = typeof PrimaryIds[number];

    export const AdditionalIds = [
      ${[...additionalIds].map((id) => `'${id}'`).join(',\n')}
    ] as const;
    export type AdditionalId = typeof AdditionalIds[number];

    export type PropertiesSchema = typeof schemaResourceProperties;
    export type TypeConfigurationSchema = typeof schemaTypeConfiguration;

    export class ResourceBuilder extends ResourceBuilderBase<
        PropertiesSchema,
        TypeConfigurationSchema,
        PrimaryId,
        AdditionalId,
        ResourceProperties,
        TypeConfiguration
    > {
      constructor() {
          super({
              typeName: TypeName,
              schema: schemaResourceProperties.additional(false),
              typeConfigurationSchema: schemaTypeConfiguration.additional(false),
              ids: PrimaryIds,
          });
      }
    }

    export const resourceBuilder = new ResourceBuilder();

    export * from './schema.js';
  `;
}

function getTransformedEmit(
    primaryIds: string[],
    additionalIds: string[],
    typeName: string
) {
    const reverseIdMap: Record<string, string> = {};
    for (const id of [...primaryIds, ...primaryIds]) {
        reverseIdMap[jsifier(id)] = id;
    }

    return dedent`
    /* tslint:disable */
    /* eslint-disable */
    import { ResourceBuilderBase } from '${LIB_NAME}';
    import { schemaResourceProperties, schemaTypeConfiguration } from './schema.js';
    import {
        Convert,
        TransformedResourceProperties,
        TransformedTypeConfiguration,
    } from './transformer.js';

    export const TypeName = '${typeName}';

    export const PrimaryIds = [
      ${[...primaryIds].map((id) => `'${jsifier(id)}'`).join(',\n')}
    ] as const;
    export type PrimaryId = typeof PrimaryIds[number];

    export const AdditionalIds = [
      ${[...additionalIds].map((id) => `'${jsifier(id)}'`).join(',\n')}
    ] as const;
    export type AdditionalId = typeof AdditionalIds[number];

    export const MapIds = ${JSON.stringify(reverseIdMap, null, 2)} as const;

    export type PropertiesSchema = typeof schemaResourceProperties;
    export type TypeConfigurationSchema = typeof schemaTypeConfiguration;

    export class ResourceBuilder extends ResourceBuilderBase<
        PropertiesSchema,
        TypeConfigurationSchema,
        PrimaryId,
        AdditionalId,
        TransformedResourceProperties,
        TransformedTypeConfiguration
    > {
      constructor() {
          super({
              typeName: TypeName,
              schema: schemaResourceProperties.additional(false),
              typeConfigurationSchema: schemaTypeConfiguration.additional(false),
              ids: PrimaryIds,
              transformProperties: {
                  toJS: Convert.toTransformedResourceProperties,
                  fromJS: Convert.transformedResourcePropertiesToJson,
              },
              transformTypeConfiguration: {
                  toJS: Convert.toTransformedTypeConfiguration,
              },
              transformIds: {
                  fromJS: (ids: Record<PrimaryId | AdditionalId, unknown>) => {
                      const result: Record<typeof MapIds[keyof typeof MapIds], unknown> = {} as any;
                      for (const [key, value] of Object.entries(ids)) {
                          const mapKey = MapIds[key as PrimaryId | AdditionalId];
                          if (!mapKey) {
                              throw new Error(
                                  \`Unknown id \${key}. Make sure you're only setting id properties on the result.\`
                              );
                          }
                          result[mapKey] = value;
                      }
                      return result;
                  },
              },
          });
      }
    }

    export const resourceBuilder = new ResourceBuilder();

    export * from './schema.js';
  `;
}
