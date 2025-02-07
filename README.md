# HappyRef for Obsidian

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Description 
This is a quick and easy citation tool intended to generate literature notes by generating notes from the digital object identifier ([DOI](https://en.wikipedia.org/wiki/Digital_object_identifier)) code using the [CrossRef API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/).

## Table of Contents

- [Installation](#installation)
	- [Manual Installation](#manual-installation)
	- [Installation via BRAT (Beta Reviewers Auto-updater Tool)](#installation-via-brat-beta-reviewers-auto-updater-tool)
- [Usage](#usage)
	
## Installation

### Manual Installation

1. Download the latest release from Releases.
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
- Either click on the Smiley icon or access the command palette (Ctrl+P) and start typing, then select "HappyRef Get Citation from CrossRef" to generate a new literature note.  The system will prompt for a DOI, from which it will pull data into YAML frontmatter and attempt to construct a citation and pull the article's abstract.
- Data is in the frontmatter, so should be accessible via Dataview and other plugins.

### Example workflow
- You've seen an article you want to capture, we're going to use this one https://link.springer.com/article/10.1007/s42979-024-02876-4 as an example.
- Copy and paste the DOI from the page, in this case: https://doi.org/10.58594/rtest.v4i2.113
- Click on the icon or use Ctrl+P and type Happy Ref... and into the popup type in https://doi.org/10.58594/rtest.v4i2.113
- The new page will show the output
  ![image](https://github.com/user-attachments/assets/b1b33233-89dc-4082-9c34-3479e2db4996)




## Additional features
- Changed your mind about the citation style?  Go to the command palette and select Change Citation Style
- Works with either the https or plain version (https://doi.org/10.58594/rtest.v4i2.113 or 10.58594/rtest.v4i2.113) of the DOI.
- Want a different default style? Go to settings and select your option there
- Want files created somewhere different? Go to settings and select your folder
- Want a different file name schema?  In settings you can choose the article title, the author or the author (year)

