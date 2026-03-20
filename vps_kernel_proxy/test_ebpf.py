#!/usr/bin/env python3
import unittest
import subprocess
import os

"""
eBPF Test Suite
---------------
Validates that our kernel programs compile correctly and 
contain the expected data structures (maps).
"""

class TestEBPFPrograms(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Run make to ensure everything is compiled before testing
        subprocess.run(["make", "clean"], capture_output=True)
        cls.make_result = subprocess.run(["make"], capture_output=True, text=True)

    def test_compilation_success(self):
        """Verify that all programs compiled without errors."""
        self.assertEqual(self.make_result.returncode, 0, f"Compilation failed:\n{self.make_result.stderr}")
        
        expected_files = [
            "hello.bpf.o", "adblock.bpf.o", "redirect.bpf.o", "reputation.bpf.o", 
            "dns_filter.bpf.o", "sni_filter.bpf.o", "bloom_filter.bpf.o", 
            "xdp_forwarder.bpf.o", "ebpf_snat.bpf.o", "container_pcap.bpf.o", "ptr_resolver.bpf.o"
        ]
        for f in expected_files:
            self.assertTrue(os.path.exists(f), f"Expected binary {f} was not generated.")

    def test_snat_maps(self):
        """Verify that the SNAT filter has its map."""
        output = subprocess.check_output("bpftool btf dump file ebpf_snat.bpf.o", shell=True).decode()
        self.assertIn("snat_map", output, "Map 'snat_map' missing from ebpf_snat.bpf.o BTF")

    def test_xdp_forwarder_maps(self):
        """Verify that the XDP forwarder has its redirect map."""
        output = subprocess.check_output("bpftool btf dump file xdp_forwarder.bpf.o", shell=True).decode()
        self.assertIn("forward_map", output, "Map 'forward_map' missing from xdp_forwarder.bpf.o BTF")

    def test_bloom_filter_maps(self):
        """Verify that the Bloom filter has its specialized map."""
        output = subprocess.check_output("bpftool btf dump file bloom_filter.bpf.o", shell=True).decode()
        self.assertIn("bloom_filter", output, "Map 'bloom_filter' missing from bloom_filter.bpf.o BTF")
        self.assertIn("confirmed_blocks", output, "Map 'confirmed_blocks' missing from bloom_filter.bpf.o BTF")

    def test_sni_filter_maps(self):
        """Verify that the SNI filter has its blacklist map."""
        output = subprocess.check_output("bpftool btf dump file sni_filter.bpf.o", shell=True).decode()
        self.assertIn("sni_blacklist", output, "Map 'sni_blacklist' missing from sni_filter.bpf.o BTF")

    def test_adblock_maps(self):
        """Verify that the adblock program has its blocklist map."""
        # Use bpftool btf dump to see the map names in the BTF data
        output = subprocess.check_output("bpftool btf dump file adblock.bpf.o", shell=True).decode()
        self.assertIn("blocklist_map", output, "Map 'blocklist_map' missing from adblock.bpf.o BTF")

    def test_dns_filter_maps(self):
        """Verify that the dns_filter program has its hits map."""
        output = subprocess.check_output("bpftool btf dump file dns_filter.bpf.o", shell=True).decode()
        self.assertIn("dns_hits", output, "Map 'dns_hits' missing from dns_filter.bpf.o BTF")

    def test_reputation_maps(self):
        """Verify that the reputation monitor has both heat-map and watchlist."""
        output = subprocess.check_output("bpftool btf dump file reputation.bpf.o", shell=True).decode()
        self.assertIn("stats_map", output, "Map 'stats_map' missing from reputation.bpf.o BTF")
        self.assertIn("watchlist_map", output, "Map 'watchlist_map' missing from reputation.bpf.o BTF")

    def test_verifiability(self):
        """
        Runs a 'dry-run' verification using bpftool. 
        Note: This requires a Linux environment with BTF support.
        """
        expected_files = [
            "hello.bpf.o", "adblock.bpf.o", "redirect.bpf.o", "reputation.bpf.o", 
            "dns_filter.bpf.o", "sni_filter.bpf.o", "bloom_filter.bpf.o", 
            "xdp_forwarder.bpf.o", "ebpf_snat.bpf.o", "container_pcap.bpf.o", "ptr_resolver.bpf.o"
        ]
        # We try to dump the BTF (kernel type info) - if this works, the ELF is valid.
        for f in expected_files:
            res = subprocess.run(["bpftool", "btf", "dump", "file", f], capture_output=True)
            self.assertEqual(res.returncode, 0, f"BTF verification failed for {f}: {res.stderr.decode()}")

if __name__ == "__main__":
    unittest.main()
