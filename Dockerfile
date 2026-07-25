FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

EXPOSE 5000

ENV PYTHONUNBUFFERED=1
ENV USE_POSTGRES=true

CMD ["python", "app.py"]
