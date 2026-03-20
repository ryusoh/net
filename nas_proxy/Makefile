CC = gcc
CFLAGS = -O3 -Wall -fPIC
LDFLAGS = -lcurl
TARGET = tile_storage
TUNNEL_TARGET = stealth_tunnel
SHM_TARGET = shared_memory
NEON_TARGET = neon_adblock
SPOOFER_TARGET = connectivity_spoofer
TEST_TARGET = tests
SCRAPER_TARGET = proxy_scraper
BLOCKER_TARGET = userspace_blocker
LIB_TARGET = libtilestorage.so

all: $(TARGET) $(LIB_TARGET) $(TUNNEL_TARGET) $(SHM_TARGET) $(NEON_TARGET) $(SPOOFER_TARGET) $(SCRAPER_TARGET) $(BLOCKER_TARGET)

$(BLOCKER_TARGET): userspace_blocker.c
	$(CC) $(CFLAGS) -o $(BLOCKER_TARGET) userspace_blocker.c -lpcap

$(TEST_TARGET): tests.c tile_storage.c tile_fetcher.c stealth_tunnel.c connectivity_spoofer.c shared_memory.c neon_adblock.c
	$(CC) $(CFLAGS) -DTEST_MAIN -o $(TEST_TARGET) tests.c tile_storage.c tile_fetcher.c stealth_tunnel.c connectivity_spoofer.c shared_memory.c neon_adblock.c $(LDFLAGS)

test: $(TEST_TARGET)
	@./$(TEST_TARGET)

$(SPOOFER_TARGET): connectivity_spoofer.c
	$(CC) $(CFLAGS) -o $(SPOOFER_TARGET) connectivity_spoofer.c

$(TUNNEL_TARGET): stealth_tunnel.c
	$(CC) $(CFLAGS) -o $(TUNNEL_TARGET) stealth_tunnel.c

$(SHM_TARGET): shared_memory.c
	$(CC) $(CFLAGS) -o $(SHM_TARGET) shared_memory.c

$(NEON_TARGET): neon_adblock.c
	$(CC) $(CFLAGS) -o $(NEON_TARGET) neon_adblock.c

$(LIB_TARGET): tile_storage.c tile_fetcher.c
	$(CC) $(CFLAGS) -shared -o $(LIB_TARGET) tile_storage.c tile_fetcher.c $(LDFLAGS)

clean:
	rm -f $(TARGET) $(LIB_TARGET) $(TUNNEL_TARGET) $(SHM_TARGET) $(NEON_TARGET) tile_storage.bin

.PHONY: all clean
