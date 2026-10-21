"""Zain support pipeline backend."""
import os
import sys

# Some Windows machines (Smart App Control / WDAC) block SQLAlchemy's unsigned Cython
# extensions. SQLAlchemy has a pure-Python fallback; use it on Windows.
if sys.platform == "win32":
    os.environ.setdefault("DISABLE_SQLALCHEMY_CEXT_RUNTIME", "1")
