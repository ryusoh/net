# Docker-based eBPF Development Environment for macOS (Darwin)
FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install essential build and eBPF tools
RUN apt update && apt install -y \
    build-essential \
    clang \
    llvm \
    libelf-dev \
    libbpf-dev \
    m4 \
    pkg-config \
    iproute2 \
    tcpdump \
    linux-tools-generic \
    linux-headers-generic \
    ca-certificates \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Fix bpftool path (varies by kernel version in Ubuntu)
RUN ln -s /usr/lib/linux-tools/*/bpftool /usr/local/bin/bpftool || true

WORKDIR /app

# The kernel headers from the host are required for compilation.
# On Docker for Mac, the container runs in a Linux VM.
CMD ["/bin/bash"]
