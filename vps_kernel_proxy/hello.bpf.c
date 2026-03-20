#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

SEC("xdp")
int hello_xdp(struct xdp_md *ctx) {
    bpf_printk("Hello from the Kernel! Packet received.\n");
    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
