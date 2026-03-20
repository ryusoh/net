#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * High-Performance XDP Forwarder
 * ------------------------------
 * This program performs "Direct Server Return" style redirection.
 * It intercepts packets at the hardware driver level, swaps the 
 * source/destination MAC and IP addresses, and sends them back 
 * out the same interface instantly.
 */

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);   // Target IP
    __type(value, __u32); // Redirect IP
} forward_map SEC(".maps");

SEC("xdp")
int xdp_forward_func(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;

    if (eth->h_proto != bpf_htons(ETH_P_IP)) return XDP_PASS;

    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end) return XDP_PASS;

    __u32 dest_ip = iph->daddr;
    __u32 *new_dest = bpf_map_lookup_elem(&forward_map, &dest_ip);

    if (new_dest) {
        // 1. Swap MAC Addresses (Simplified Layer 2 Forwarding)
        __u8 tmp_mac[ETH_ALEN];
        __builtin_memcpy(tmp_mac, eth->h_dest, ETH_ALEN);
        __builtin_memcpy(eth->h_dest, eth->h_source, ETH_ALEN);
        __builtin_memcpy(eth->h_source, tmp_mac, ETH_ALEN);

        // 2. Update Destination IP
        iph->daddr = *new_dest;

        // 3. Recalculate Checksum (Simplified for demonstration)
        // In production, we'd use bpf_csum_diff
        iph->check = 0; 

        // 4. XDP_TX: Send the packet back out the same interface
        // This is much faster than routing through the Linux stack
        return XDP_TX;
    }

    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
