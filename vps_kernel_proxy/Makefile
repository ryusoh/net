# Makefile for compiling eBPF programs
CLANG ?= clang
LLVM_STRIP ?= llvm-strip
BPF_OBJ = hello.bpf.o adblock.bpf.o redirect.bpf.o reputation.bpf.o dns_filter.bpf.o sni_filter.bpf.o bloom_filter.bpf.o xdp_forwarder.bpf.o ebpf_snat.bpf.o container_pcap.bpf.o ptr_resolver.bpf.o

# Search paths for headers
INCLUDES := -I/usr/include -I/usr/include/x86_64-linux-gnu -I/usr/include/$(shell uname -m)-linux-gnu

# Automatically detect architecture for eBPF target
ARCH := $(shell uname -m | sed 's/x86_64/x86/' | sed 's/aarch64/arm64/')

# Clang flags for BPF target
CFLAGS := -g -O2 -target bpf -D__TARGET_ARCH_$(ARCH) $(INCLUDES)

all: $(BPF_OBJ)

$(BPF_OBJ): %.o: %.c
	$(CLANG) $(CFLAGS) -c $< -o $@
	$(LLVM_STRIP) -g $@

test: all
	python3 test_ebpf.py

clean:
	rm -f $(BPF_OBJ)

.PHONY: all clean
