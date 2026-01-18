# Dockerfile for Storybook Learning Backend
FROM node:20-slim

# Install Python and dependencies for face_id.py (optional, needed only if FACE_ID_ENABLED=true)
# Install build dependencies for opencv-python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for face recognition (optional feature)
# If this fails, you can remove this line and FaceID will just be disabled
RUN pip3 install --no-cache-dir --default-timeout=100 opencv-python-headless insightface numpy || echo "Warning: FaceID Python dependencies failed to install. FaceID will be disabled."

# Set working directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY server/package*.json ./

# Install Node.js dependencies
# Using npm install with --legacy-peer-deps to handle TensorFlow version conflicts
# Note: Installing @tensorflow/tfjs-node for identity guard (optional feature)
RUN npm install --only=production --legacy-peer-deps && npm cache clean --force

# Copy application code (excluding node_modules and package files already copied)
COPY server/ ./

# Copy Seedream workflow template(s) from repo root
COPY api_bytedance_seedream4* ./

# Copy tools directory (needed for face_id.py)
# REPO_ROOT in face-id/index.mjs resolves to /app, so tools should be at /app/tools/
COPY tools/ ./tools/

# Create directory for jobs (generated content)
RUN mkdir -p /app/jobs && chmod 755 /app/jobs

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the application
CMD ["node", "index.js"]

