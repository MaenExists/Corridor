import os


def local_api(path):
    """The review and refresh commands can reach only the chosen loopback port."""
    port = os.environ.get("CORRIDOR_API_PORT", "8787")
    if not port.isascii() or not port.isdecimal() or not 1024 <= int(port) <= 65535:
        raise ValueError("CORRIDOR_API_PORT must be a local port number between 1024 and 65535")
    return f"http://127.0.0.1:{int(port)}{path}"
