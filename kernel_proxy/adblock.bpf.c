#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * eBPF Ad-Blocker (XDP)
 * ---------------------
 * This program runs in the kernel at the earliest possible point (XDP).
 * It drops packets from specific "blacklisted" IP addresses.
 */

// A map to store blocked IP addresses.
// We can update this map from user-space without re-compiling the kernel code.
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);   // IPv4 Address
    __type(value, __u32); // Counter (how many times blocked)
} blocklist_map SEC(".maps");

SEC("xdp")
int xdp_adblock(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    // 1. Parse Ethernet Header
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;

    // 2. Only look at IPv4 traffic
    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return XDP_PASS;

    // 3. Parse IP Header
    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end)
        return XDP_PASS;

    // 4. Extract Source IP
    __u32 src_ip = iph->saddr;

    // 5. Check if the IP is in our blocklist map
    __u32 *count = bpf_map_lookup_elem(&blocklist_map, &src_ip);
    if (count) {
        // Increment the block counter (using atomic helper)
        __sync_fetch_and_add(count, 1);

        // DROP the packet! It never reaches the NAS network stack.
        // bpf_printk("Blocked packet from: %pI4\n", &src_ip); // Debugging
        return XDP_DROP;
    }

    // Let all other traffic pass
    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
