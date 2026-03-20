#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * eBPF Bloom Filter Ad-Blocker (XDP)
 * ----------------------------------
 * Bloom filters are probabilistic data structures that are:
 * 1. Ultra-fast: Constant time lookup O(1).
 * 2. Space-efficient: Can store millions of IPs in a few MBs.
 * 
 * Perfect for massive ad-blocking lists (e.g., 100k+ IPs).
 */

// Define the Bloom Filter Map
// This map only stores a "presence" bit for the keys.
struct {
    __uint(type, BPF_MAP_TYPE_BLOOM_FILTER);
    __uint(max_entries, 100000); // Can store 100k IPs with very low false positive rate
    __type(value, __u32);        // The key to check (IPv4)
} bloom_filter SEC(".maps");

// Backup Hash Map for verified blocks (to avoid false positives)
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1000);
    __type(key, __u32);
    __type(value, __u32);
} confirmed_blocks SEC(".maps");

SEC("xdp")
int xdp_bloom_adblock(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (eth->h_proto != bpf_htons(ETH_P_IP)) return XDP_PASS;

    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end) return XDP_PASS;

    __u32 src_ip = iph->saddr;

    // 1. Quick Check (The Bloom Filter)
    // If it returns -ENOENT (error), the IP is DEFINITELY NOT in the list.
    int err = bpf_map_peek_elem(&bloom_filter, &src_ip);
    if (err == 0) {
        // 2. Verified Check (The Hash Map)
        // Bloom filters have a small chance of "false positives".
        // We check a second smaller map to be 100% sure.
        __u32 *confirmed = bpf_map_lookup_elem(&confirmed_blocks, &src_ip);
        if (confirmed) {
            // bpf_printk("Bloom Filter Blocked confirmed IP: %pI4\n", &src_ip);
            return XDP_DROP;
        }
    }

    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
