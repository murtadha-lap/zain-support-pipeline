"""Logging with Iraqi phone-number masking (PII never reaches server logs)."""
import logging
import re

_DIG = "[0-9٠-٩۰-۹]"
_PHONE_RE = re.compile(
    rf"(?:(?:\+|00)\s?(?:964|٩٦٤)[\s-]?{_DIG}{{3}}[\s-]?{_DIG}{{3}}[\s-]?{_DIG}{{4}})"
    rf"|(?<!{_DIG})(?:0|٠|۰)(?:7|٧|۷){_DIG}{{2}}[\s-]?{_DIG}{{3}}[\s-]?{_DIG}{{4}}(?!{_DIG})"
)


def mask_pii(text: str) -> str:
    """Replace Iraqi mobile numbers (07xxxxxxxxx, +964 7xx..., Arabic-Indic digits too) with a mask."""
    if not text:
        return text
    return _PHONE_RE.sub("[PHONE]", text)


class PIIMaskingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:  # pragma: no cover
            return True
        record.msg = mask_pii(msg)
        record.args = ()
        return True


_configured = False


def setup_logging(level: str = "INFO") -> None:
    global _configured
    if _configured:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler.addFilter(PIIMaskingFilter())
    log = logging.getLogger("zsp")
    log.setLevel(level)
    log.addHandler(handler)
    log.propagate = False
    _configured = True


def get_logger(name: str = "zsp") -> logging.Logger:
    logger = logging.getLogger(name if name.startswith("zsp") else f"zsp.{name}")
    return logger
