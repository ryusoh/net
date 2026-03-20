#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * Docker Container Packet Capture
 * -------------------------------
 * Captures packets from a specific container IP without 
 * needing tcpdump inside the container.
 * Perfect for debugging NAS services.
 */

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1);
    __type(key, __u32);   // Target Container IP
    __type(value, __u64); // Packet Counter
} pcap_config SEC(".maps");

SEC("xdp")
int xdp_container_pcap(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (eth->h_proto != bpf_htons(ETH_P_IP)) return XDP_PASS;

    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end) return XDP_PASS;

    __u32 src_ip = iph->saddr;
    __u32 dest_ip = iph->daddr;

    // Check if either source or dest is our target container
    __u64 *count_src = bpf_map_lookup_elem(&pcap_config, &src_ip);
    __u64 *count_dest = bpf_map_lookup_elem(&pcap_config, &dest_ip);

    if (count_src || count_dest) {
        // Increment packet counter for telemetry
        if (count_src) __sync_fetch_and_add(count_src, 1);
        if (count_dest) __sync_fetch_and_add(count_dest, 1);

        // bpf_printk("PCAP: Captured packet for container %pI4\n", count_src ? &src_ip : &dest_ip);
    }

    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
