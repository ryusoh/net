CC      ?= gcc
CFLAGS  ?= -O3 -Wall -Wextra
LDFLAGS  = -lpthread

TARGETS = lan_scanner wol netmon speedtest

all: $(TARGETS)

lan_scanner: lan_scanner.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

wol: wol.c
	$(CC) $(CFLAGS) -o $@ $<

netmon: netmon.c
	$(CC) $(CFLAGS) -o $@ $< -lm

speedtest: speedtest.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f $(TARGETS)

.PHONY: all clean
