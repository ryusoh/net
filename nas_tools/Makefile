CC      ?= gcc
CFLAGS  ?= -O3 -Wall -Wextra
LDFLAGS  = -lpthread

TARGETS = lan_scanner

all: $(TARGETS)

lan_scanner: lan_scanner.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f $(TARGETS)

.PHONY: all clean
