import { Program } from '../program.js';
import { join } from 'path';

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
                .options('src', {
                    type: 'string',
                    description: 'The source directory for the resource.',
                    default: './src',
                })
                .option('out', {
                    type: 'string',
                    description:
                        'The output directory for generated code within the source directory.',
                    default: 'generated',
                }),
        async (argv) => {
            const { makeConverter, getJsonSchemaReader, getSureTypeWriter } =
                await import('typeconv');

            const {
                default: { readJson, exists, mkdirp, writeFile, emptyDir },
            } = await import('fs-extra');
            const {
                default: { dedent },
            } = await import('ts-dedent');
            const { v, extractSingleJsonSchema } = await import('suretype');
            const { JsonPointer } = await import('json-ptr');

            const { schema, src, out } = argv;

            if (!(await exists(schema))) {
                console.error(`Schema file ${schema} does not exist.`);
                throw new Error(`Schema file ${schema} does not exist.`);
            }

            const outputDirectory = join(src, out);
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
                unsupported: 'warn',
                missingReference: 'error',
                userPackage: 'cloudformation-cli-typescript-plugin',
                userPackageUrl:
                    'https://github.com/aws-cloudformation/cloudformation-cli-typescript-plugin',
                exportValidator: false,
                exportEnsurer: false,
                exportTypeGuard: false,
            });
            const { convert } = makeConverter(reader, writer);

            const schemaJson = await readJson(schema, 'utf8');

            // Modify the schema to make it work with suretype, as well as do some extra validation steps
            const { definitions, ...resource } = schemaJson;
            resource.type = 'object';
            definitions['ResourceProperties'] = resource;

            const idPaths: string[] = resource['primaryIdentifier'];
            const requiredIds = new Set<string>();
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

            definitions['TypeConfiguration'] =
                resource.typeConfiguration ??
                extractSingleJsonSchema(v.object({}).additional(false)).schema;

            const { data } = await convert({ data: { definitions } as any });

            await writeFile(join(outputDirectory, 'schema.ts'), data, 'utf8');

            const model = dedent`
              /* tslint:disable */
              /* eslint-disable */
              import { ResourceHandlerBase } from '@amazon-web-services-cloudformation/cloudformation-cli-typescriptv2-lib';
              import { type TypeOf } from 'suretype';
              import type { CamelCasedPropertiesDeep } from 'type-fest';
              import type { ConditionalSimplifyDeep } from 'type-fest/source/conditional-simplify';
              import { schemaResourceProperties, schemaTypeConfiguration } from './schema';

              export const TypeName = '${schemaJson.typeName}';

              export const PrimaryIds = [
                ${[...requiredIds].map((id) => `'${id}'`).join(',\n')}
              ] as const;
              export type PrimaryId = typeof PrimaryIds[number];

              export type PropertiesSchema = typeof schemaResourceProperties;
              export type TypeConfigurationSchema = typeof schemaTypeConfiguration;

              export class ResourceHandler extends ResourceHandlerBase<
                PropertiesSchema,
                TypeConfigurationSchema,
                PrimaryId
              > {
                constructor() {
                    super({
                        typeName: TypeName,
                        schema: schemaResourceProperties,
                        typeConfigurationSchema: schemaTypeConfiguration,
                        ids: PrimaryIds,
                    });
                }
              }

              export const resource = new ResourceHandler();

              export type RawProperties = ConditionalSimplifyDeep<
                  TypeOf<typeof schemaResourceProperties>
              >;
              export type Properties = CamelCasedPropertiesDeep<RawProperties>;

              export type RawTypeConfiguration = ConditionalSimplifyDeep<
                  TypeOf<typeof schemaTypeConfiguration>
              >;
              export type TypeConfiguration = CamelCasedPropertiesDeep<RawTypeConfiguration>;

              export * from './schema';
            `;

            await writeFile(join(outputDirectory, 'index.ts'), model);
        }
    );
