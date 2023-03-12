import logging
from importlib.resources import files
import json

__package_json__ = json.loads(
    files("rpdk.typescript").joinpath("package.json").read_text()
)

__version__ = __package_json__["version"].replace("-", "")

logging.getLogger(__name__).addHandler(logging.NullHandler())
