# HappyRef for Obsidian

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Description 
This is a quick and easy citation tool intended to generate literature notes by generating notes from the digital object identifier (DOI) code using the CrossRef API.

## Table of Contents

- [Installation](#installation)
	- [Manual Installation](#manual-installation)
	- [Installation via BRAT (Beta Reviewers Auto-updater Tool)](#installation-via-brat-beta-reviewers-auto-updater-tool)
- [Usage](#usage)
	
## Installation

### Manual Installation

1. Download the latest release from [Releases](https://github.com/[Your GitHub Username]/[Your Plugin Repo Name]/releases).
2. Extract the `HappyRef` folder from the zip file to your Obsidian vault's plugins folder: `<your-vault>/.obsidian/plugins/`.
	* **Note**: On some machines, the `.obsidian` folder may be hidden by default. Enable hidden folders to locate it.
3. Reload Obsidian.
4. Go to `Settings` -> `Community plugins` and enable `HappyRef`.

### Installation via BRAT (Beta Reviewers Auto-updater Tool)

If you want to stay up-to-date with the latest beta releases, you can use BRAT:

1. Install the BRAT plugin in Obsidian (if you haven't already).
2. Go to `Settings` -> `BRAT` and add `[Your GitHub Username]/[Your Plugin Repo Name]` under "Beta Plugin List".
3. Check for updates in BRAT.
4. Once the plugin is listed, enable `HappyRef` in the Community plugins settings.

## Usage
- Install as above
- Either click on the Smiley icon or access the command palette (Ctrl+P) and type "HappyRef" to generate a new literature note.  The system will prompt for a DOI, from which it will pull data into YAML frontmatter and attempt to construct a citation and pull the article's abstract.

## Additional features
- Changed your mind about the citation style?  Go to the command palette and select Change 
- Want a different default style? Go to settings and select your option there
- Want files created somewhere different

