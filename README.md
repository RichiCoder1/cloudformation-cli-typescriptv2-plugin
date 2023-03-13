# CloudFormation Typescript (v2) Plugin

This is a plugin for the [CloudFormation CLI](https://github.com/aws-cloudformation/cloudformation-cli) that enables the use of Typescript for resource providers, as well providing a number of other QoL improvments over the default TypeScript plugin. It can also be used for the development of JavaScript providers, though that has not be as tested.

> **Warning**
> This plugin is still in beta, and is not yet ready for production use. It is not recommended to use this plugin for any production workloads.

## Installation

To install the plugin, run the following command:

```bash
pip install cfn-cli-typescriptv2-plugin
```

The `cfn` cli will automatically detect the plugin and make it available as a language provider option.

## Usage

Create and navigate to a new directory for your resource provider, and run the following command:

```bash
cfn init
```

This will walk you through the process of creating a new resource provider. When asked for the language, select `Typescript (v2)`.

This plugin automatically generates bindings from your schema file via the `npm run generate` command, and makes then available via the `.cfn` folder as `$cfn`. You should not need to interact with this folder directly, and should only update the schema file.

See the generated `README.md` file for more information on how to use the generated bindings, and the general [CloudFormation CLI Documentation](https://docs.aws.amazon.com/cloudformation-cli/latest/userguide/what-is-cloudformation-cli.html) for more information on how to use the CloudFormation CLI, test your resource provider, and publish it.
