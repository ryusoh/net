# [Exploration] eBPF-based Kernel-Level Network Acceleration and Security

This document tracks exploratory research into moving network modification and security logic from the browser (Manifest V3) to the Linux kernel (eBPF).

## Core Use Cases

### 1. Kernel-Level Ad Blocking (XDP)

- **Mechanism:** Attach to `XDP_DRV` or `XDP_SKB` hooks.
- **Goal:** Drop packets from known ad-tracking ASNs/IPs at the Express Data Path (XDP).
- **Benefit:** Near-zero CPU overhead; blocks ads system-wide before they reach the browser's memory.

### 2. Transparent Header Injection (TC)

- **Mechanism:** Use Traffic Control (TC) egress hooks on the `clsact` qdisc.
- **Goal:** Physically rewrite TCP segments to inject `X-Forwarded-For`, `X-Real-IP`, and `True-Client-IP` headers.
- **Benefit:** Makes IP spoofing invisible to Layer 7 (Application) WAF detection. Bypasses browser-level fingerprinting by modifying the data at the network stack level.

### 3. Socket-Level Benchmarking

- **Mechanism:** Monitor `tcp_connect` and `tcp_v4_do_rcv` via `kprobes`.
- **Goal:** Calculate exact TTFB (Time to First Byte) at the socket level for proxy nodes.
- **Benefit:** High-precision telemetry for choosing the fastest exit nodes in the proxy pool.

## Local Development via Docker (macOS/Darwin)

While eBPF doesn't run natively on macOS, you can develop and compile programs using the Linux VM that Docker for Mac runs in the background.

### 1. Build the Development Environment

```bash
cd kernel_proxy
docker build -t ebpf-dev .
```

### 2. Compile eBPF Code

```bash
# Run the container and mount the source code
docker run --rm -v $(pwd):/app ebpf-dev make
```

This will produce `hello.bpf.o`, an ELF file containing the BPF bytecode.

### 3. Verification (Inside Docker)

To actually _run_ the program, you need to grant the container elevated privileges:

```bash
docker run --rm --privileged -v $(pwd):/app -it ebpf-dev /bin/bash
# Inside the container:
# Attach to the loopback interface for testing
ip link set dev lo xdp obj hello.bpf.o
# View kernel logs
cat /sys/kernel/debug/tracing/trace_pipe
```

## Infrastructure Setup: Linux VPS (Exit Node)

To host eBPF programs, you need a Linux instance with kernel 5.15+ (Ubuntu 22.04 LTS or newer recommended).

### 1. Provisioning (Alibaba / Tencent Cloud)

- **Region:** Beijing, Shanghai, or Shenzhen (for native Chinese IP reputation).
- **Instance Type:** "Lightweight Application Server" (Burstrable instances are fine for eBPF).
- **OS:** Ubuntu 22.04 LTS (Jammy Jellyfish) or 24.04 LTS.

### 2. Base Preparation

Once logged in via SSH, run the following to prepare the environment:

```bash
# Update kernel and install headers
sudo apt update && sudo apt upgrade -y
sudo apt install -y linux-headers-$(uname -r) build-essential clang llvm libelf-dev libcap-dev gcc-multilib m4
```

### 3. Verify eBPF Compatibility

```bash
# Ensure BPF filesystem is mounted
mount | grep bpf
# Check if your kernel supports BTF (essential for modern eBPF)
ls /sys/kernel/btf/vmlinux
```

## Implementation Roadmap

- **Environment:** Requires a Linux-based exit node (e.g., Method 3B Alibaba Cloud VPS).
- **Language:** C (for BPF programs) and Go (using `cilium/ebpf` for the user-space loader).
- **Phasing:**
  - [ ] Phase 1: Prototype XDP-based IP blacklisting.
  - [ ] Phase 2: Implement TC-based header manipulation for specific target domains (`*.tianditu.gov.cn`).
  - [ ] Phase 3: Integrate with existing extension via a local control socket.

## Platform Constraints

- eBPF is not natively supported on macOS (`darwin`).
- This architecture targets the **Physical Exit Node** rather than the local development machine.
