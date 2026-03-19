# Makefile for compiling eBPF programs
CLANG ?= clang
LLVM_STRIP ?= llvm-strip
BPF_OBJ = hello.bpf.o

# Search paths for headers
INCLUDES := -I/usr/include -I/usr/include/x86_64-linux-gnu

# Clang flags for BPF target
CFLAGS := -g -O2 -target bpf -D__TARGET_ARCH_x86 $(INCLUDES)

all: $(BPF_OBJ)

$(BPF_OBJ): %.o: %.c
	$(CLANG) $(CFLAGS) -c $< -o $@
	$(LLVM_STRIP) -g $@

clean:
	rm -f $(BPF_OBJ)

.PHONY: all clean
