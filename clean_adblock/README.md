# Bypass: AdBlock Detector

A Manifest V3 Chrome extension designed to bypass "AdBlock detected" popups and restore website functionality without using any copyrighted source code from existing solutions.

## Features

- **Smart Detection**: Recursively scans the DOM (including Shadow DOM) for elements matching adblock detection patterns.
- **Scroll Restoration**: Automatically restores page scrolling if it's disabled by a detection overlay.
- **Execution Modes**:
  - **Universal**: Runs on all websites by default.
  - **Selective**: Only runs on sites you explicitly add to the "Blacklist".
- **JS Blocking**: Dynamically block JavaScript on specific domains using `declarativeNetRequest`.
- **Element Picker**: Manually select and permanently hide any annoying element on a page.
- **Whitelist Support**: Completely disable the extension on trusted sites.

## Installation

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `net/clean_adblock` directory.

## Usage

- **Global Toggle**: Use the switch in the popup to enable or disable the extension.
- **Manual Scan**: If a popup isn't hidden automatically, click "Scan Current Page".
- **Element Picker**: Click "Element Picker" to select an element on the page to hide permanently.
- **Site Management**: Use the "Whitelist", "Blacklist", and "Block JS" buttons to manage how the extension behaves on the current site.

## Technical Details

- **Manifest V3**: Uses modern Chrome extension standards.
- **Privacy First**: All settings and site lists are stored locally on your device or synced via Chrome Storage. No data is sent to external servers.
- **Performance**: Optimized DOM scanning using `TreeWalker` and throttled `MutationObserver`.
