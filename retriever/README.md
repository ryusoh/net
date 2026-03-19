# Extension Retriever

A tool to pull the source code of installed Chrome extensions from your local machine into this repository for analysis or modification.

## How to Use

1. **Find the Extension ID**:
   - Open Chrome and go to `chrome://extensions/`.
   - Enable **Developer mode** (top right).
   - Find the extension you want and copy its **ID** (a long string of random letters like `bffmkleioghafggghlaeemdgjpmbppii`).

2. **Pull the Code**:
   From the `net/` directory, run:
   ```bash
   make pull ID=your_extension_id
   ```
   _Example:_
   ```bash
   make pull ID=bffmkleioghafggghlaeemdgjpmbppii
   ```

## How it Works

- The script searches the standard Google Chrome extension directories on macOS (`~/Library/Application Support/Google/Chrome/`).
- It automatically selects the latest version available.
- It reads the extension's `manifest.json` to determine a human-readable name for the resulting folder.
- The code is copied into a new subdirectory under `net/`.
- The `_metadata` folder (which contains internal Chrome signatures unnecessary for unpacked use) is automatically removed.

## Prerequisites

- macOS (configured for default Chrome paths).
- Python 3.
