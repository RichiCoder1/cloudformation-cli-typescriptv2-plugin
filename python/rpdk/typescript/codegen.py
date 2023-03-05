import logging
import os
from pathlib import Path
import shutil
from subprocess import CalledProcessError  # nosec
from tempfile import TemporaryFile
from zipfile import ZipFile
import yaml

from rpdk.core.data_loaders import resource_stream
from rpdk.core.exceptions import DownstreamError, InternalError
from rpdk.core.init import input_with_validation
from rpdk.core.plugin_base import LanguagePlugin
from rpdk.core.project import Project

from .utils import run_tool_cmd

LOG = logging.getLogger(__name__)

EXECUTABLE = "cfn"
SUPPORT_LIB_NAME = (
    "@amazon-web-services-cloudformation/cloudformation-cli-typescriptv2-lib"
)
SUPPORT_LIB_VERSION = "^2.0.0-a0"
MAIN_HANDLER_FUNCTION = "TypeFunction"


def validate_no(value):
    return value.lower() in ("y", "yes")


class TypescriptLanguagePlugin(LanguagePlugin):
    MODULE_NAME = __name__
    NAME = "typescript"
    RUNTIME = "nodejs18.x"
    ENTRY_POINT = "dist/handlers.entrypoint"
    TEST_ENTRY_POINT = "dist/handlers.testEntrypoint"
    CODE_URI = "./"

    package_root: Path | None

    def __init__(self):
        self.env = self._setup_jinja_env(
            trim_blocks=True, lstrip_blocks=True, keep_trailing_newline=True
        )
        self.namespace = None
        self.package_name = None
        self.package_root = None
        self._use_docker = None
        self._skip_npm_install = False
        self._protocol_version = "2.0.0"
        self._build_command = None
        self._lib_path = None
        self._is_init_phase = False

    def _init_from_project(self, project):
        self.namespace = tuple(s.lower() for s in project.type_info)
        self.package_name = "-".join(self.namespace)
        # Check config file for (legacy) 'useDocker' and use_docker settings
        self._use_docker = project.settings.get("useDocker") or project.settings.get(
            "use_docker"
        )
        self.package_root = project.root / "src"
        self._build_command = project.settings.get("buildCommand", None)
        self._lib_path = SUPPORT_LIB_VERSION

    def _init_settings(self, project):
        LOG.debug("Writing settings")
        if project.settings.get("use_docker") is None:
            self._use_docker = input_with_validation(
                "Use docker for platform-independent packaging (y/N)?\n",
                validate_no,
                "This recommend if your handler has native or otherwise \n"
                "non-cross-platform dependencies.",
            )
        else:
            self._use_docker = project.settings.get("use_docker")

        if project.settings.get("skip_npm_install") is None:
            self._skip_npm_install = False
        else:
            self._skip_npm_install = project.settings.get("skip_npm_install")

        project.settings["use_docker"] = self._use_docker
        project.settings["skip_npm_install"] = self._skip_npm_install
        project.settings["protocolVersion"] = self._protocol_version

    def init(self, project: Project):
        LOG.debug("Init started")

        self._init_from_project(project)
        self._init_settings(project)

        self._is_init_phase = True

        project.runtime = self.RUNTIME
        project.entrypoint = self.ENTRY_POINT
        project.test_entrypoint = self.TEST_ENTRY_POINT

        def _render_template(path, **kwargs):
            LOG.debug("Writing '%s'", path)
            template = self.env.get_template(path.name)
            contents = template.render(**kwargs)
            project.safewrite(path, contents)

        def _copy_resource(path, resource_name=None):
            LOG.debug("Writing '%s'", path)
            if not resource_name:
                resource_name = path.name
            contents = resource_stream(__name__, f"data/{resource_name}").read()
            project.safewrite(path, contents)

        assert self.package_root is not None

        # handler Typescript package
        handler_package_path = self.package_root
        LOG.debug("Making folder '%s'", handler_package_path)
        handler_package_path.mkdir(parents=True, exist_ok=True)
        _render_template(
            handler_package_path / "handlers.ts",
            lib_name=SUPPORT_LIB_NAME,
            type_name=project.type_name,
        )
        # models.ts produced by generate

        # project support files
        _copy_resource(project.root / ".gitignore", "typescript.gitignore")
        _copy_resource(project.root / ".npmrc")
        sam_tests_folder = project.root / "sam-tests"
        sam_tests_folder.mkdir(exist_ok=True)
        _copy_resource(sam_tests_folder / "create.json")
        _copy_resource(project.root / "tsconfig.json")
        _render_template(
            project.root / "package.json",
            name=project.hypenated_name,
            description=f"AWS custom resource provider named {project.type_name}.",
            lib_name=SUPPORT_LIB_NAME,
            lib_path=self._lib_path,
        )
        _render_template(
            project.root / "README.md",
            type_name=project.type_name,
            schema_path=project.schema_path,
            project_path=self.package_name,
            executable=EXECUTABLE,
            lib_name=SUPPORT_LIB_NAME,
        )
        self._render_sam_template(project)

        # install npm dependencies
        if self._skip_npm_install is False:
            LOG.warning("Installing npm dependencies. This may take a few minutes...")
            run_tool_cmd("npm", ["install", "--include=optional"])
        else:
            LOG.warning("Skipping npm install. You will need to run it manually.")

        LOG.debug("Init complete")

    def generate(self, project):
        LOG.debug("Generate started")

        self._init_from_project(project)
        assert self.package_root is not None

        # run generation cli for models.ts
        if self._is_init_phase and self._skip_npm_install:
            LOG.warning(
                "Generate step skipped. You will need to run it manually after running npm install."
            )
        else:
            run_tool_cmd("npm", ["run", "generate"])

        LOG.debug("Generate complete")

    def _render_sam_template(self, project):
        # CloudFormation/SAM template for handler lambda
        function_properties = {
            "Handler": project.entrypoint,
            "Runtime": project.runtime,
            "CodeUri": self.CODE_URI,
        }

        function_metadata = {
            "BuildMethod": "esbuild",
            "BuildProperties": {
                "Format": "esm",
                "Target": "es2022",
                "Sourcemap": "true",
                "EntryPoints": ["src/handlers.ts"],
                "External": ["@aws-sdk/*"],
            },
        }
        sam_template = yaml.dump(
            {
                "AWSTemplateFormatVersion": "2010-09-09",
                "Transform": "AWS::Serverless-2016-10-31",
                "Description": f"AWS SAM template for the {project.type_name} resource type",
                "Resources": {
                    f"{MAIN_HANDLER_FUNCTION}": {
                        "Type": "AWS::Serverless::Function",
                        "Properties": {
                            **function_properties,
                        },
                        "Metadata": function_metadata,
                    },
                    "TestEndpoint": {
                        "Type": "AWS::Serverless::Function",
                        "Properties": {
                            **function_properties,
                            "Handler": project.test_entrypoint,
                        },
                        "Metadata": function_metadata,
                    },
                },
            }
        )
        project.safewrite(project.root / "template.yml", sam_template)

    def _pre_package(self, build_path):
        # Caller should own/delete this, not us.
        # pylint: disable=consider-using-with
        f = TemporaryFile("w+b")

        with ZipFile(f, mode="w", strict_timestamps=False) as zip_file:
            self._recursive_relative_write(build_path, build_path, zip_file)
        f.seek(0)

        return f

    @staticmethod
    def _recursive_relative_write(src_path, base_path, zip_file):
        for path in src_path.rglob("*"):
            if path.is_file():
                relative = path.relative_to(base_path)
                zip_file.write(path.resolve(), str(relative))

    def package(self, project, zip_file):
        LOG.debug("Package started")

        self._init_from_project(project)

        handler_package_path = self.package_root
        build_path = project.root / "build"

        self._remove_build_artifacts(build_path)
        self._build(project.root)

        inner_zip = self._pre_package(build_path / MAIN_HANDLER_FUNCTION)
        zip_file.writestr("ResourceProvider.zip", inner_zip.read())
        self._recursive_relative_write(handler_package_path, project.root, zip_file)

        LOG.debug("Package complete")

    @staticmethod
    def _remove_build_artifacts(deps_path):
        try:
            shutil.rmtree(deps_path)
        except FileNotFoundError:
            LOG.debug("'%s' not found, skipping removal", deps_path, exc_info=True)

    def _build(self, base_path: str):
        LOG.debug("Dependencies build started from '%s'", base_path)

        # TODO: We should use the build logic from SAM CLI library, instead:
        # https://github.com/awslabs/aws-sam-cli/blob/master/samcli/lib/build/app_builder.py
        sam_command = [
            "build",
            "--build-dir",
            os.path.join(base_path, "build"),
        ]
        if LOG.isEnabledFor(logging.DEBUG):
            sam_command.append("--debug")
        if self._use_docker:
            sam_command.append("--use-container")
        sam_command.append(MAIN_HANDLER_FUNCTION)

        LOG.warning("Starting build")
        try:
            LOG.debug("Running np ci --include=optional")
            run_tool_cmd("npm", ["ci", "--include=optional"], cwd=base_path)

            LOG.debug("Running sam build: sam %s", " ".join(sam_command))
            run_tool_cmd("sam", sam_command, cwd=base_path)
        except (FileNotFoundError, CalledProcessError, InternalError) as e:
            raise DownstreamError("local build failed") from e

        LOG.debug("Dependencies build finished")
