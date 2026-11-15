# 自建 OCR 服务：RapidOCR（PP-OCR 模型 + onnxruntime，纯 CPU）
# 只在小程序「体测报告识别」里用来把报告图转成文字，不对外暴露端口。
FROM python:3.11-slim

WORKDIR /app

# opencv 运行需要 libGL / libglib（slim 镜像里没有）
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      rapidocr-onnxruntime==1.3.24 \
      numpy==1.26.4

COPY server.py /app/server.py

# 预热一次：首次启动会加载模型，避免第一次请求等太久
RUN python -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()" || true

EXPOSE 8000
CMD ["python", "-u", "/app/server.py"]
