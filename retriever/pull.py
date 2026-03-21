#!/usr/bin/env python3
import sys
import os
import shutil
import json
import glob

def get_chrome_extension_path(extension_id, profile="Default"):
    home = os.path.expanduser("~")
    base_path = os.path.join(home, "Library/Application Support/Google/Chrome", profile, "Extensions", extension_id)
    return base_path

def pull_extension(extension_id):
    src_base = get_chrome_extension_path(extension_id)
    
    if not os.path.exists(src_base):
        # Try finding it in other profiles if Default fails
        home = os.path.expanduser("~")
        profiles = glob.glob(os.path.join(home, "Library/Application Support/Google/Chrome/Profile *"))
        found = False
        for p in profiles:
            src_base = os.path.join(p, "Extensions", extension_id)
            if os.path.exists(src_base):
                found = True
                break
        if not found:
            print(f"Error: Extension {extension_id} not found in Chrome Extensions directory.")
            return

    # Extensions are stored in versioned subdirectories. Get the latest one.
    versions = [d for d in os.listdir(src_base) if os.path.isdir(os.path.join(src_base, d)) and not d.startswith('Temp')]
    if not versions:
        print(f"Error: No version subdirectories found for {extension_id}.")
        return
    
    latest_version = sorted(versions)[-1]
    src_path = os.path.join(src_base, latest_version)
    
    # Target directory: use camelCased extension name
    # Get the name of the extension if possible
    manifest_path = os.path.join(src_path, "manifest.json")
    target_name = extension_id
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, 'r') as f:
                manifest = json.load(f)
                name = manifest.get('name', extension_id)
                # Remove common prefixes/suffixes and punctuation
                name = name.replace(':', '').replace('-', ' ')
                # Convert to camelCase: "My Extension Name" -> "myExtensionName"
                words = name.split()
                if len(words) > 1:
                    target_name = words[0].lower() + ''.join(word.capitalize() for word in words[1:])
                else:
                    target_name = name.lower()
                # Keep only alphanumeric
                target_name = "".join([c for c in target_name if c.isalnum()])
        except:
            pass

    # Ensure we are running from project root or retriever/
    cwd = os.getcwd()
    if os.path.basename(cwd) == 'retriever':
        # Running from retriever/, put in parent directory
        parent_dir = os.path.dirname(cwd)
        target_dir = os.path.abspath(os.path.join(parent_dir, target_name))
    else:
        # Running from anywhere else, put in current directory
        target_dir = os.path.abspath(os.path.join(cwd, target_name))

    print(f"Pulling {extension_id} (version {latest_version}) into {target_dir}...")
    
    if os.path.exists(target_dir):
        print(f"Warning: Target directory {target_dir} already exists. Overwriting...")
        shutil.rmtree(target_dir)
    
    try:
        shutil.copytree(src_path, target_dir)
        
        # Auto-remove _metadata folder
        metadata_dir = os.path.join(target_dir, "_metadata")
        if os.path.exists(metadata_dir):
            print(f"Removing obsolete {metadata_dir}...")
            shutil.rmtree(metadata_dir)
            
        print("Success.")
    except Exception as e:
        print(f"Failed to copy: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: pull <extension_id>")
        sys.exit(1)
    
    pull_extension(sys.argv[1])
