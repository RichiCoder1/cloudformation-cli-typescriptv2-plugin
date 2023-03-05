import argparse


def setup_subparser(subparsers: argparse._SubParsersAction, parents):
    parser: argparse.ArgumentParser = subparsers.add_parser(
        "typescript",
        description="This sub command generates IDE and build files for TypeScript",
        parents=parents,
    )
    parser.set_defaults(language="typescript")

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

    parser.add_argument(
        "--skip-npm-install",
        action="store_true",
        help="""Skip running npm install after init-ing the project.""",
    )
    parser.set_defaults(skip_npm_install=False)

    return parser
