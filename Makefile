# Usage: make pull ID=<extension_id>
.PHONY: pull precommit precommit-fix fmt fmt-check lint lint-fix install-dev test tm-repair

tm-repair:
	@./bin/tm-repair

pull:
	@./retriever/pull $(ID)

install-dev:
	@npm install

precommit: fmt-check lint test

precommit-fix: fmt lint-fix test

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
