#!/usr/bin/env python3
"""书境奇游 本地服务器：静态文件 + /mimo/* 反向代理到 mimo-voice-hub。

用法：python3 tools/serve.py [端口]   （默认 8321）
说明：/mimo/ 前缀的请求会被转发到 http://127.0.0.1:5006/（mimo-voice-hub），
     使浏览器同源访问 TTS 接口，避免 CORS 问题。
"""
import http.server
import json
import sys
import urllib.request
from urllib.error import URLError, HTTPError

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
MIMO_BASE = "http://127.0.0.1:5006"

EXTRA_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".md": "text/plain; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        t = super().guess_type(path)
        if not t:
            import os
            ext = os.path.splitext(path)[1].lower()
            return EXTRA_TYPES.get(ext, "application/octet-stream")
        if path.endswith(".md"):
            return EXTRA_TYPES[".md"]
        return t

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _proxy(self, method):
        target = MIMO_BASE + self.path[len("/mimo"):]
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(target, data=body, method=method)
        for h in ("Content-Type", "Accept"):
            if self.headers.get(h):
                req.add_header(h, self.headers[h])
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                payload = resp.read()
                self.send_response(resp.status)
                ctype = resp.headers.get("Content-Type", "application/json")
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except HTTPError as e:
            payload = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except URLError as e:
            payload = json.dumps({"error": f"mimo-voice-hub 不可达: {e}"}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def do_GET(self):
        if self.path.startswith("/mimo/"):
            return self._proxy("GET")
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/mimo/"):
            return self._proxy("POST")
        self.send_error(405)

    def log_message(self, fmt, *args):
        pass  # 静音访问日志


if __name__ == "__main__":
    print(f"书境奇游服务: http://127.0.0.1:{PORT}/  （TTS 代理: /mimo/ -> {MIMO_BASE}）")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
