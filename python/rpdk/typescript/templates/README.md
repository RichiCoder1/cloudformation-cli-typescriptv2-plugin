# {{ type_name }}

Congratulations on starting development! Next steps:

1. Write the JSON schema describing your resource, [{{ schema_path.name }}](./{{ schema_path.name }})
2. Implement your resource handlers in [handlers.ts](./{{ project_path }}/handlers.ts)

> Be sure not to modify any of the generated files in `.cfn` by hand, any modifications will be overwritten when the `generate` or `package` commands are run. You can `.gitignore` this directory if you wish, but be sure to run `cfn generate` before type-checking or building your project.

## Getting Started

Implement CloudFormation resource [here](./{{ project_path }}/handlers.ts). Each function must always return a either the model in question, or throw a `BaseHandlerError` from `{{ lib_name }}/errors`.

For example, a `CREATE` handler might look like this:

```typescript
        async create(event) {
            // Get the model from the request
            // This is the resource model as defined in the schema
            // **IMPORTANT**: Unless you've enabled `--jsify-properties`, this will be PascalCase
            // like most standard CloudFormation properties.
            const model = event.properties;

            const result = await fetch('https://example.com/endpoint', {
                method: 'POST',
                body: JSON.stringify(model),
            }).catch((e) => {
                // If you want to return a specific error code, you can throw a one of the errors
                // from `{{ lib_name }}/errors`.
                throw new ServiceInternalError('Failed to create resource', e);
            });

            if (result.status !== 200) {
                if (result.status === 409) {
                    throw new AlreadyExistsError(event, model.TPSCode);
                } else if (result.status === 400) {
                    throw new InvalidRequestError(event, model.TPSCode);
                }
                throw new ServiceInternalError('Failed to create resource: ' + result.statusText);
            }

            const data = await result.json();

            return this.created({
                // ID (from primaryIdentifiers) is required
                // You'll get a type error and a runtime error if you don't provide it
                TPSCode: data.tpsCode,
                // Standard required properties
                Title: data.title,
                TestCode: data.testCode,
            });
        },
```

The [{{ lib_name }}](https://github.com/richicoder1/cloudformation-cli-typescriptv2-plugin) library provides helpers for returning the correct `ProgressEvent` for each operation. For example, `this.created` will return a `ProgressEvent` with the correct status, message, and model. It's strongly recommend you use these helpers as they will provide simplified editor validation. Errors can be thrown from the `{{ lib_name }}/errors` module, which will be caught and converted into the correct `ProgressEvent` by the library.

All logs will be delivered to CloudWatch if you use the `this.logger` method.

## Making HTTP Requests

The node environment provides a `fetch` method for making HTTP requests. If you need to make a request to an external service, you can use this method. If you need to make a request to an AWS service, you should use the AWS SDK instead as described below.

The standard `fetch` method does not provide any retry logic however, so consider using a library like [`got`](https://www.npmjs.com/package/got) if you need retry logic or other advanced features.

## Using the AWS SDK

If you need to access AWS resources, first make sure you have the correct permissions required via `handlers.<event>.permissions` in your schema file. The [{{ lib_name }}](https://github.com/richicoder1/cloudformation-cli-typescriptv2-plugin) library has a helper that can be called via `the.getSdk` which accepts the target SDK as the first argument. For example:

```typescript
import { S3 } from '@aws-sdk/client-s3';
/* ... */
        async create(event) {
            // type is the AWS SDK v3 S3 client automatically set to the current region and credentials
            const sdk = this.getSdk(S3);
            const result = await sdk.createBucket({
                Bucket: event.properties.BucketName,
            });
            return this.created({
                BucketName: result.BucketName,
            });
        },
/* ... */
```

This method will automatically set the region and credentials for you, and currently doesn't allow overriding them.

The AWS SDK v3 automatically provides retry and transient error logic, but be sure to handle any errors or use a library like `p-retry` if you need retry behavior.
