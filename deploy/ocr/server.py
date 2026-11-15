#!/usr/bin/env python3
# 体测报告 OCR 服务（自建，不依赖云服务）
#
# 接口：POST /ocr   body: {"image": "<base64>", "mime": "image/jpeg"}
#      返回: {"text": "多行文字", "lines": [{"text": "...", "score": 0.98}], "engine": "rapidocr"}
#
# 报告是「深底浅字」，而 OCR 模型多在「浅底深字」上训练，
# 所以这里会先试原图，效果不够好时再反色重试，取置信度更高的结果。
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
from rapidocr_onnxruntime import RapidOCR

ENGINE = RapidOCR()
MAX_SIDE = 2200  # 太大的图先缩一下，兼顾速度与精度


def decode_image(raw: bytes):
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def upscale_if_needed(img):
    h, w = img.shape[:2]
    side = max(h, w)
    if side > MAX_SIDE:
        scale = MAX_SIDE / side
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    elif side < 900:
        # 分辨率太低时放大，小字号更容易识别
        scale = 900 / side
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    return img


def run_ocr(img):
    """返回 [(text, score, box)]"""
    result, _ = ENGINE(img)
    out = []
    for item in result or []:
        # rapidocr 返回 [box, text, score]
        try:
            box, text, score = item[0], item[1], float(item[2])
        except Exception:
            continue
        if text:
            out.append((str(text), score, box))
    return out


def quality_pairs(pairs):
    """粗评估：识别到的字符数 × 平均置信度"""
    if not pairs:
        return 0.0
    chars = sum(len(t) for t, _, _ in pairs)
    avg = sum(s for _, s, _ in pairs) / len(pairs)
    return chars * avg


def read_order(pairs):
    """按行归并、再按行内从左到右排序，尽量还原阅读顺序"""
    rows = []
    for text, score, box in pairs:
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        cy = sum(ys) / len(ys)
        cx = min(xs)
        placed = False
        for row in rows:
            if abs(row["cy"] - cy) <= 18:
                row["items"].append((cx, text, score))
                row["cy"] = (row["cy"] + cy) / 2
                placed = True
                break
        if not placed:
            rows.append({"cy": cy, "items": [(cx, text, score)]})
    rows.sort(key=lambda r: r["cy"])
    lines = []
    for row in rows:
        row["items"].sort(key=lambda it: it[0])
        text = "".join(it[1] for it in row["items"])
        score = sum(it[2] for it in row["items"]) / len(row["items"])
        lines.append({"text": text, "score": round(score, 4)})
    return lines


def recognize(raw_bytes: bytes):
    img = decode_image(raw_bytes)
    if img is None:
        return None, "不是有效的图片"

    img = upscale_if_needed(img)
    pairs = run_ocr(img)
    best = pairs
    best_quality = quality_pairs(pairs)

    # 深底浅字：反色后往往识别更稳，效果更好就用它
    inverted = cv2.bitwise_not(img)
    pairs_inv = run_ocr(inverted)
    quality_inv = quality_pairs(pairs_inv)
    if quality_inv > best_quality:
        best, best_quality = pairs_inv, quality_inv

    if not best:
        return None, "没识别到文字"

    lines = read_order(best)
    text = "\n".join(l["text"] for l in lines)
    # 同时返回每个词的方框，服务端用它做「数值↔部位」的空间匹配
    items = []
    for t_, s_, box_ in best:
        xs = [p[0] for p in box_]
        ys = [p[1] for p in box_]
        items.append({
            "text": t_,
            "score": round(s_, 4),
            "x": round(min(xs), 1),
            "y": round(min(ys), 1),
            "w": round(max(xs) - min(xs), 1),
            "h": round(max(ys) - min(ys), 1),
        })
    items.sort(key=lambda it: (it["y"], it["x"]))
    return {"text": text, "lines": lines, "items": items, "engine": "rapidocr"}, None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True, "engine": "rapidocr"})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ocr":
            return self._send(404, {"error": "not found"})
        try:
            length = int(self.headers.get("content-length") or 0)
            if length <= 0 or length > 16 * 1024 * 1024:
                return self._send(400, {"error": "图片为空或过大"})
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            b64 = (payload.get("image") or "").strip()
            if not b64:
                return self._send(400, {"error": "缺少 image"})
            # 兼容 data:image/...;base64, 前缀
            if b64.startswith("data:"):
                b64 = b64.split(",", 1)[-1]
            raw = base64.b64decode(b64)
            data, err = recognize(raw)
            if err:
                return self._send(200, {"text": "", "lines": [], "error": err})
            self._send(200, data)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("ocr error: %r\n" % (e,))
            self._send(500, {"error": "识别失败：%s" % e})


if __name__ == "__main__":
    print("ocr service listening on 8000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
