import argparse


def setup_subparser(subparsers: argparse._SubParsersAction, parents):
    parser: argparse.ArgumentParser = subparsers.add_parser(
        "typescriptv2",
        description="This sub command generates IDE and build files for TypeScript",
        parents=parents,
    )
    parser.set_defaults(language="typescriptv2")

    # TODO: use BooleanOptionalAction once we drop support for Python 3.8
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "-d",
        "--use-docker",
        action="store_true",
        dest="use_docker",
        help="""Use docker for TypeScript platform-independent packaging.
            This is recommended if you're using native dependencies.""",
    )
    group.add_argument(
        "--no-docker",
        action="store_false",
        dest="use_docker",
        help="""See --use-docker for more information.""",
    )
    group.set_defaults(use_docker=False)

    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--jsify-properties",
        action="store_true",
        dest="jsify_properties",
        help="""Whether or not to camelCase property names in the generated code.
            This may have surprising results, so enable will care.""",
    )
    group.add_argument(
        "--no-jsify-properties",
        action="store_false",
        dest="use_docker",
        help="""See --jsify-properties for more information.""",
    )
    group.set_defaults(use_docker=False)

    parser.add_argument(
        "--skip-npm-install",
        action="store_true",
        help="""Skip running npm install after init-ing the project.""",
    )
    parser.set_defaults(skip_npm_install=False)

    # Hidden option for testing purposes
    parser.add_argument("--local-registry", action="store_true", help=argparse.SUPPRESS)
    parser.set_defaults(local_registry=False)

    return parser
