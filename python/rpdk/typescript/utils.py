import logging
import subprocess
import shutil
from typing import Optional

from rpdk.core.exceptions import InternalError

LOG = logging.getLogger(__name__)


def run_tool_cmd(tool_name: str, args: list[str], cwd: Optional[str] = None):
    tool = shutil.which(tool_name)
    if tool is None:
        raise InternalError(
            (
                f"Failed to file {tool_name}. "
                f"Ensure {tool_name} is installed and available in your path"
            )
        )
    try:
        LOG.debug("Running %s %s", tool_name, " ".join(args))
        output = subprocess.check_output(
            [tool, *args], text=True, cwd=cwd, stderr=subprocess.STDOUT
        )
        LOG.info(output)
    except subprocess.CalledProcessError as err:
        LOG.error(err.output)
        raise InternalError(f"Failed to run {tool_name}") from err
