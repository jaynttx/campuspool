MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def sniff_image(data: bytes) -> str | None:
    """Decides the type from the file's own bytes, never from the name or declared type."""
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if len(data) > 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None
