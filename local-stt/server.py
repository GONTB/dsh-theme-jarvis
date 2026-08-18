#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dsh-theme-jarvis 本地离线语音识别服务（复用 vocotype-cli 的 FunASR 引擎）。

引擎：vocotype-cli（https://github.com/233stone/vocotype-cli）的 FunASRServer，
      模型常驻内存：paraformer-large ONNX（ASR）+ FSMN VAD + CT-Transformer 标点，
      纯 CPU 推理、100% 离线，首次运行自动下载约 500MB 模型（modelscope 缓存）。

接口（仅绑定 127.0.0.1）：
  GET  /health       -> {"ok": true, "initialized": bool}
  POST /transcribe   -> 请求体为原始 WAV 字节（16k 单声道 16bit PCM，
                        application/octet-stream），返回 {"ok": true, "text": "..."}

运行方式（Windows / macOS / Linux）：
  1. 克隆并安装 vocotype-cli：
       git clone https://github.com/233stone/vocotype-cli.git
       cd vocotype-cli
       uv venv --python 3.12 && source .venv/Scripts/activate  # Windows: .venv\\Scripts\\activate
       uv pip install -r requirements.txt
  2. 启动本服务（把本脚本复制到 vocotype-cli 目录下，或设 PYTHONPATH 指向它）：
       python <本脚本路径>/server.py            # 默认端口 8010
       或  VOCO_PORT=8011 python server.py      # 换端口
  3. 回 DSH 设置 → JARVIS 控制台 → 本地识别配置：保存地址 → 「检测服务」→
     识别后端选「本地离线」。录音只在本机转写，绝不上传。
"""

import argparse
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# 推理环境（必须在导入深度学习库之前设置）
os.environ.setdefault("OMP_NUM_THREADS", "8")
os.environ.setdefault("FUNASR_DEVICE", "cpu")

# 让「python server.py」在 vocotype-cli 目录下运行时能 import app.*
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

try:
    from app.funasr_server import FunASRServer
except ImportError as exc:  # pragma: no cover
    print(
        json.dumps(
            {
                "ok": False,
                "error": (
                    f"无法导入 vocotype-cli 的 FunASRServer: {exc}。"
                    "请先 `git clone https://github.com/233stone/vocotype-cli`，"
                    "在其目录 `uv pip install -r requirements.txt`，"
                    "并把本脚本放到该目录下运行（或设 PYTHONPATH 指向 vocotype-cli）。"
                ),
            },
            ensure_ascii=False,
        ),
        file=sys.stderr,
    )
    sys.exit(1)

MAX_BODY_BYTES = 20 * 1024 * 1024  # 与 host 侧 4MB 上限的宽余


class Handler(BaseHTTPRequestHandler):
    server_version = "dsh-theme-jarvis-local-stt/1.0"

    def log_message(self, fmt, *args):  # 静默访问日志
        return

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") != "/health":
            self._json(404, {"ok": False, "error": "not found"})
            return
        self._json(200, {"ok": True, "initialized": server.initialized})

    def do_POST(self):
        if self.path.rstrip("/") != "/transcribe":
            self._json(404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(400, {"ok": False, "error": "missing or oversized audio body"})
            return
        audio = self.rfile.read(length)
        if not audio:
            self._json(400, {"ok": False, "error": "empty audio"})
            return

        tmp = None
        try:
            fd, tmp = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            with open(tmp, "wb") as fh:
                fh.write(audio)
            result = server.transcribe_audio(tmp)
            if result.get("success"):
                self._json(200, {"ok": True, "text": result.get("text", "")})
            else:
                self._json(500, {"ok": False, "error": result.get("error", "transcribe failed")})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"ok": False, "error": str(exc)})
        finally:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass


def main():
    parser = argparse.ArgumentParser(description="dsh-theme-jarvis 本地离线语音识别服务")
    parser.add_argument("--port", type=int, default=int(os.environ.get("VOCO_PORT", "8010")))
    parser.add_argument("--no-auto-init", action="store_true", help="启动时不自动加载模型（等首个请求时再加载）")
    args = parser.parse_args()

    global server
    server = FunASRServer()

    if not args.no_auto_init:
        threading.Thread(target=server.initialize, daemon=True).start()

    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(
        json.dumps(
            {
                "ok": True,
                "message": f"本地离线语音识别服务已启动: http://127.0.0.1:{args.port}（模型后台加载中，/health 可查状态）",
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("正在退出…", flush=True)
        httpd.shutdown()


if __name__ == "__main__":
    main()
