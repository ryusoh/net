# Usage: make pull ID=<extension_id>
.PHONY: pull precommit precommit-fix fmt fmt-check lint lint-fix install-dev test tm-repair

tm-repair:
	@./bin/tm-repair

pull:
	@./retriever/pull $(ID)

install-dev:
	@npm install

precommit: fmt-check lint test test-ebpf test-nas

precommit-fix: fmt lint-fix test test-ebpf test-nas

fmt:
	@npm run fmt

fmt-check:
	@npm run fmt:check

lint:
	@npm run lint

lint-fix:
	@npm run lint:fix

test:
	@npm test

test-ebpf:
	@echo "Running eBPF Kernel Tests (via Docker)..."
	@docker run --rm -v $(shell pwd):/app ebpf-builder make -C vps_kernel_proxy test

test-nas:
	@echo "Running C-based NAS Tool Tests..."
	@make -C nas_proxy test

build-nas-tools:
	@echo "Building C-based NAS tools..."
	@make -C nas_proxy all
	@echo "Building NAS Build Accelerators..."
	@gcc -O3 bin/ctx_cleaner.c -o bin/ctx_cleaner
	@gcc -O3 bin/ram_disk_accelerator.c -o bin/ram_disk_accelerator
	@gcc -O3 bin/parallel_pkg_pull.c -o bin/parallel_pkg_pull -lcurl
	@gcc -O3 bin/ccache_manager.c -o bin/ccache_manager
	@gcc -O3 bin/pkg_warrior.c -o bin/pkg_warrior -lcurl
	@gcc -O3 bin/fs_overdrive.c -o bin/fs_overdrive
	@gcc -O3 bin/dist_build_client.c -o bin/dist_build_client
