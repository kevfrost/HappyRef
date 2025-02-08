import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, DropdownComponent, Editor, MarkdownView, TFolder } from 'obsidian';
import * as yaml from 'js-yaml'; // Corrected import statement

interface HappyRefSettings {
	defaultFolder: string;
	citationStyle: CitationStyle;
	fileNameStyle: FileNameStyle; // Added fileNameStyle setting
}

type CitationStyle = 'Harvard' | 'Vancouver' | 'None' | 'APA' | 'Chicago' | 'AMA' | 'AP' | 'Canadian' | 'Oxford'; // ADDED 'Oxford'
type FileNameStyle = 'Title' | 'Author' | 'Author (Year)'; // Renamed "Author (Date)" to "Author (Year)"

const DEFAULT_SETTINGS: HappyRefSettings = {
	defaultFolder: '',
	citationStyle: 'Harvard',
	fileNameStyle: 'Title' // Default fileNameStyle is Title
}

// Define interface for Author object based on Crossref API response
interface Author {
	given?: string; // Given name is optional
	family?: string; // Family name is optional
}

interface CitationMetadata {
	[key: string]: any; // Index signature to allow string indexing - FIX for TS7053
	title?: string[];
	author?: Author[];
	'container-title'?: string[];
	publisher?: string;
	issued?: { 'date-parts': number[][] };
	DOI?: string;
	ISBN?: string[];
	type?: string;
	URL?: string;
	abstract?: any;
	volume?: string;
	page?: string;
	issue?: string;
	'date-accessed'?: string; // To store date accessed in metadata
}


export default class HappyRef extends Plugin {
	settings: HappyRefSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'fetch-crossref-doi',
			name: 'Fetch from Crossref by DOI',
			callback: () => {
				new DOIModal(this.app, this.settings, async (doi) => {
					try {

						const data = await this.fetchCrossrefData(doi);
						if (data && data.message) {
							const createdFile = await this.createNote(data.message);
							if (createdFile) {
								await this.app.workspace.openLinkText(createdFile.path, '', false);
							}
							console.log(data.message);
							new Notice(`Successfully created and opened note`);
						} else {
							new Notice(`Failed to fetch data or invalid DOI: ${doi}`);
						}
					} catch (error) {
						console.error("Error fetching or creating note:", error);
						new Notice(`Error fetching data: ${error.message}`);
					}
				}).open();
			}
		});


		this.addRibbonIcon('sticker', 'Fetch Crossref DOI', () => {
			new DOIModal(this.app, this.settings, async (doi) => {
				try {
					const data = await this.fetchCrossrefData(doi);
					if (data && data.message) {
						const createdFile = await this.createNote(data.message);
						if (createdFile) {
							await this.app.workspace.openLinkText(createdFile.path, '', false);
						}
						console.log(data.message);
						new Notice(`Successfully created and opened note`);
					} else {
						new Notice(`Failed to fetch data or invalid DOI: ${doi}`);
					}
				} catch (error) {
					console.error("Error fetching or creating note:", error);
					new Notice(`Error fetching data: ${error.message}`);
				}
			}).open();
		});

		this.addCommand({
			id: 'change-citation-style',
			name: 'Change Citation Style',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const currentFile = view.file;
				if (!currentFile) {
					new Notice('No active file.');
					return;
				}
				new CitationStyleModal(this.app, this, async (newStyle) => { // Pass `this` (plugin instance) here!
					try {
						await this.changeCitationStyle(currentFile, newStyle);
						new Notice(`Citation style updated to ${newStyle}.`);
					} catch (error) {
						console.error('Error changing citation style:', error);
						new Notice(`Failed to change citation style: ${error.message}`);
					}
				}).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new CrossrefSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async fetchCrossrefData(doi: string): Promise<any> {
		const apiUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
		const response = await fetch(apiUrl);

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error(`DOI not found: ${doi}`);
			} else {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
		}
		return await response.json();
	}

	async fetchCrossrefDataByISBN(isbn: string): Promise<any> {
		// Using Crossref API to search by ISBN. Ref: https://api.crossref.org/works?filter=isbn:<ISBN>
		const apiUrl = `https://api.crossref.org/works?filter=isbn:${encodeURIComponent(isbn)}`; // Construct URL for ISBN query
		const response = await fetch(apiUrl);

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error(`ISBN not found: ${isbn}`);
			} else {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
		}
		const jsonResponse = await response.json();
		if (jsonResponse.message && jsonResponse.message.items && jsonResponse.message.items.length > 0) {
			return { message: jsonResponse.message.items[0] }; // Return the first item from the items array, as ISBN should be unique
		} else {
			return { message: null }; // No items found for the ISBN
		}
	}


	async createNote(message: any): Promise<TFile | null> {
		let baseFilename = "Crossref Note"; // Default fallback filename
		const fileNameStyle = this.settings.fileNameStyle;

		if (fileNameStyle === 'Title') {
			let title = message.title?.[0] || "Untitled";
			baseFilename = title.replace(/[/\\?%*:|"<>]/g, ' ').trim() || "Crossref Note";
		} else if (fileNameStyle === 'Author') {
			if (message.author && message.author.length > 0) {
				const firstAuthor = message.author[0] as Author;
				baseFilename = `${firstAuthor.family || 'UnknownAuthor'}`.replace(/[/\\?%*:|"<>]/g, ' ').trim() || "Crossref Note";
			} else {
				baseFilename = "Untitled"; // Fallback if no author
			}
		} else if (fileNameStyle === 'Author (Year)') { // Modified logic for "Author (Year)"
			console.log("fileNameStyle is Author (Year)"); // Debug: Check if this block is reached
			if (message.author && message.author.length > 0) { // Check for author first, year check moved inside
				console.log("Author data found"); // Debug: Author found
				const firstAuthor = message.author[0] as Author;
				let year: number | undefined;

				// Prioritize year from message.issued, then published-print, published-online, created
				if (message.issued && message.issued['date-parts'] && message.issued['date-parts'][0] && message.issued['date-parts'][0][0]) {
					year = message.issued['date-parts'][0][0];
					console.log("Year found in issued"); // Debug: Year found in issued
				} else if (message['published-print'] && message['published-print']['date-parts'] && message['published-print']['date-parts'][0] && message['published-print']['date-parts'][0][0]) {
					year = message['published-print']['date-parts'][0][0];
					console.log("Year found in published-print"); // Debug: Year found in published-print
				} else if (message['published-online'] && message['published-online']['date-parts'] && message['published-online']['date-parts'][0] && message['published-online']['date-parts'][0][0]) {
					year = message['published-online']['date-parts'][0][0];
					console.log("Year found in published-online"); // Debug: Year found in published-online
				} else if (message.created && message.created['date-parts'] && message.created['date-parts'][0] && message.created['date-parts'][0][0]) {
					year = message.created['date-parts'][0][0];
					console.log("Year found in created"); // Debug: Year found in created
				}

				if (year) {
					let authorString = `${firstAuthor.family || 'UnknownAuthor'}`;
					if (message.author.length > 1) { // Check for multiple authors
						authorString += " et al"; // Add "et al" if more than one author
					}
					baseFilename = `${authorString} (${year})`.replace(/[/\\?%*:|"<>]/g, ' ').trim();
					console.log("baseFilename (Author Year):", baseFilename); // Debug: Check baseFilename value
				} else {
					console.log("No year found in issued, published-print, published-online, or created"); // Debug: No year found anywhere
					baseFilename = "Untitled"; // Fallback if no year found
					console.log("baseFilename (Untitled):", baseFilename); // Debug: Check baseFilename value
				}


			} else {
				console.log("Author data missing"); // Debug: Author data missing
				baseFilename = "Untitled"; // Fallback if no author
				console.log("baseFilename (Untitled):", baseFilename); // Debug: Check baseFilename value
			}
		}


		let filename = baseFilename;
		let folderPath = this.settings.defaultFolder; // Get folder path from settings
		let filePath = filename + ".md";

		if (folderPath) {
			folderPath = folderPath.replace(/\/+$/, ''); // Trim trailing slashes
			// Check if folder exists, create if not
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				try {
					await this.app.vault.createFolder(folderPath);
					new Notice(`Folder "${folderPath}" created.`);
				} catch (e) {
					console.error("Error creating folder:", e);
					new Notice(`Failed to create folder "${folderPath}". Check console for details.`);
					folderPath = ""; // Fallback to root if folder creation fails
				}
			}
			filePath = folderPath + '/' + filename + ".md";
		}

		let file = this.app.vault.getAbstractFileByPath(filePath);

		let suffix = 1;
		while (file instanceof TFile) {
			filename = `${baseFilename} (${suffix})`;
			filePath = folderPath ? folderPath.replace(/\/+$/, '') + '/' + filename + ".md" : filename + ".md";
			file = this.app.vault.getAbstractFileByPath(filePath);
			suffix++;
		}

		// --- Add authors to properties ---
		let authors: string[] = [];
		if (message.author) {
			const authorsArray: Author[] = message.author as Author[];
			authors = authorsArray.map((author: Author) => `${author.given} ${author.family}`);
		}

		// --- YAML Frontmatter Content ---
		let content = `---\ntags: [CreatedBy/HappyRef]\n`;
		if (authors.length > 0) {
			content += `authors: ${JSON.stringify(authors)}\n`;
		}
		if (message['container-title'] && message['container-title'][0]) {
			content += `Journal: ${message['container-title'][0]}\n`;
		}
		if (message['volume']) {
			content += `Volume: ${message['volume']}\n`;
		}
		if (message['page']) {
			content += `Page: ${message['page']}\n`;
		}
		if (message['issue']) {
			content += `Issue: ${message['issue']}\n`;
		}
		if (message.issued && message.issued['date-parts'] && message.issued['date-parts'][0]) {
			const dateParts = message.issued['date-parts'][0];
			const year = dateParts[0];
			const month = dateParts[1];
			const day = dateParts[2];
			let dateString = `${year}`;
			if (month) dateString += `-${String(month).padStart(2, '0')}`;
			if (day) dateString += `-${String(day).padStart(2, '0')}`;
			content += `Publication_Date: ${dateString}\n`;
		}
		if (message.DOI) {
			content += `DOI: ${message.DOI}\n`;
		}
		if (message.type) {
			content += `Type: ${message.type}\n`;
		}
		if (message.URL) {
			content += `URL: ${message.URL}\n`;
		}
		if (message.ISBN) {
			content += `ISBN: ${message.ISBN[0]}\n`;
		}
		// --- Get and Format Current Date for "Accessed" ---
		const currentDate = new Date();
		const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
		const day = currentDate.getDate().toString().padStart(2, "0");
		const yearAccessed = currentDate.getFullYear();
		const accessedDate = `${yearAccessed}-${month}-${day}`;
		content += `Date Accessed: ${accessedDate}\n`;

		content += `---\n\n`;
		// --- End YAML Frontmatter Content ---


		content += `# ${message.title?.[0] || "Untitled"}\n\n`;

		// --- Citation Formatting ---
		const citationStyle = this.settings.citationStyle;
		let citationText = '';

		if (citationStyle === 'Harvard') {
			citationText = this.formatHarvardCitation(message);
		} else if (citationStyle === 'Vancouver') {
			citationText = this.formatVancouverCitation(message);
		} else if (citationStyle === 'APA') {
			citationText = this.formatAPACitation(message);
		} else if (citationStyle === 'Chicago') {
			citationText = this.formatChicagoCitation(message);
		} else if (citationStyle === 'AMA') {
			citationText = this.formatAMACitation(message);
		} else if (citationStyle === 'AP') {
			citationText = this.formatAPCitation(message);
		} else if (citationStyle === 'Canadian') {
			citationText = this.formatCanadianCitation(message);
		} else if (citationStyle === 'Oxford') { // ADDED Oxford style
			citationText = this.formatOxfordReferenceCitation(message);
		} else if (citationStyle === 'None') {
			citationText = ''; // or you could set it to a default like DOI or URL if available
		}

		if (citationText) {
			content += `## Citation\n${citationText}\n\n---\n\n`;
		}
		// --- End Citation Formatting ---


		content += `## Abstract\n`;
		if (message.abstract) {
			message.abstract = message.abstract.replaceAll("<jats:title>Abstract</jats:title>");

			message.abstract = message.abstract.replaceAll("<jats:sec>", "");
			message.abstract = message.abstract.replaceAll("</jats:sec>", "");
			message.abstract = message.abstract.replaceAll("<jats:title>", "### ");
			message.abstract = message.abstract.replaceAll("</jats:title>", "");

			message.abstract = message.abstract.replaceAll("<jats:p>", "");
			message.abstract = message.abstract.replaceAll("</jats:p>", "");
			message.abstract = message.abstract.replaceAll("<\t", "");
			message.abstract = message.abstract.replaceAll("<\n\n", "\n");
			message.abstract = message.abstract.replaceAll("  ", "");

			content += `${message.abstract}\n`;
		}
		else {
			content += `*There is no abstract in this citation's metadata*\n`;
		}


		const createdTFile = await this.app.vault.create(filePath, content);
		return createdTFile;
	}


	async updateYAMLFrontmatter(file: TFile, metadata: CitationMetadata): Promise<void> {
		// 1. Read file content
		let fileContent = await this.app.vault.read(file);
		// 2. Regex to find frontmatter
		const frontmatterRegex = /^---([\s\S]*?)---/;
		let frontmatterMatch = fileContent.match(frontmatterRegex);
		let contentBody = fileContent;

		// 3. Generate new YAML frontmatter string from metadata
		let newFrontmatterString = `---\ntags: [CreatedBy/HappyRef]\n`;
		if (metadata.author && metadata.author.length > 0) {
			const authors = (metadata.author as Author[]).map(author => `${author.given} ${author.family}`);
			newFrontmatterString += `authors: ${JSON.stringify(authors)}\n`;
		}
		if (metadata['container-title'] && metadata['container-title'][0]) {
			newFrontmatterString += `Journal: ${metadata['container-title'][0]}\n`;
		}
		if (metadata['volume']) {
			newFrontmatterString += `Volume: ${metadata['volume']}\n`;
		}
		if (metadata['page']) {
			newFrontmatterString += `Page: ${metadata['page']}\n`;
		}
		if (metadata['issue']) {
			newFrontmatterString += `Issue: ${metadata['issue']}\n`;
		}
		if (metadata.issued && metadata.issued['date-parts'] && metadata.issued['date-parts'][0]) {
			const dateParts = metadata.issued['date-parts'][0];
			const year = dateParts[0];
			const month = dateParts[1];
			const day = dateParts[2];
			let dateString = `${year}`;
			if (month) dateString += `-${String(month).padStart(2, '0')}`;
			if (day) dateString += `-${String(day).padStart(2, '0')}`;
			newFrontmatterString += `Publication_Date: ${dateString}\n`;
		}
		if (metadata.DOI) {
			newFrontmatterString += `DOI: ${metadata.DOI}\n`;
		}
		if (metadata.type) {
			newFrontmatterString += `Type: ${metadata.type}\n`;
		}
		if (metadata.URL) {
			newFrontmatterString += `URL: ${metadata.URL}\n`;
		}
		if (metadata.ISBN && metadata.ISBN[0]) {
			newFrontmatterString += `ISBN: ${metadata.ISBN[0]}\n`;
		}
		if (metadata['date-accessed']) {
			newFrontmatterString += `Date Accessed: ${metadata['date-accessed']}\n`;
		} else {
			const currentDate = new Date();
			const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
			const day = currentDate.getDate().toString().padStart(2, "0");
			const yearAccessed = currentDate.getFullYear();
			const accessedDate = `${yearAccessed}-${month}-${day}`;
			newFrontmatterString += `Date Accessed: ${accessedDate}\n`;
		}

		newFrontmatterString += `---`;


		if (frontmatterMatch) {
			// Replace existing frontmatter
			await this.app.vault.modify(file, fileContent.replace(frontmatterMatch[0], newFrontmatterString));
		} else {
			// If no frontmatter (unlikely, but handle case), prepend it.
			await this.app.vault.modify(file, newFrontmatterString + "\n" + contentBody);
		}
	}


	async changeCitationStyle(file: TFile, newStyle: CitationStyle): Promise<void> {
		if (!file) {
			throw new Error("No file provided to change citation style.");
		}

		let fileContent = await this.app.vault.read(file);
		const frontmatterRegex = /^---([\s\S]*?)---/;
		let frontmatterMatch = fileContent.match(frontmatterRegex);
		let frontmatter: any = {};
		let contentBody = fileContent;

		if (frontmatterMatch) {
			frontmatter = yaml.load(frontmatterMatch[1]) as CitationMetadata || {};
			contentBody = fileContent.substring(frontmatterMatch[0].length);
		} else {
			throw new Error("No YAML frontmatter found in the note to update citation style.");
		}


		let citationMetadata: CitationMetadata = frontmatter;

		// 2. Check for essential metadata (author, issued, title, container-title)
		const requiredMetadata = ['author', 'issued', 'title', 'container-title'];
		let metadataComplete = true;
		for (const field of requiredMetadata) {
			if (!citationMetadata[field]) {
				metadataComplete = false;
				break;
			}
		}

		if (!metadataComplete) {
			// 3. Metadata is missing - re-fetch using DOI
			const doi = citationMetadata.DOI;
			if (doi) {
				try {
					const newData = await this.fetchCrossrefData(doi);
					if (newData && newData.message) {
						// 4. Update citationMetadata with fetched data
						citationMetadata = newData.message;
						// Get and Format Current Date for "Accessed" and add to metadata
						const currentDate = new Date();
						const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
						const day = currentDate.getDate().toString().padStart(2, "0");
						const yearAccessed = currentDate.getFullYear();
						const accessedDate = `${yearAccessed}-${month}-${day}`;
						citationMetadata['date-accessed'] = accessedDate;

						// 5. Update YAML frontmatter in the file with updated citationMetadata
						await this.updateYAMLFrontmatter(file, citationMetadata);
						new Notice(`Re-fetched citation data from Crossref.`);
					} else {
						throw new Error("Failed to re-fetch data from Crossref for DOI: " + doi);
					}
				} catch (fetchError) {
					console.error("Error re-fetching data:", fetchError);
					throw new Error("Error re-fetching citation data: " + fetchError.message);
				}
			} else {
				throw new Error("Missing DOI in note metadata. Cannot re-fetch citation data.");
			}
		}


		// 6. Format citation using new style (as before)
		let citationText = '';
		if (newStyle === 'Harvard') {
			citationText = this.formatHarvardCitation(citationMetadata);
		} else if (newStyle === 'Vancouver') {
			citationText = this.formatVancouverCitation(citationMetadata);
		} else if (newStyle === 'APA') {
			citationText = this.formatAPACitation(citationMetadata);
		} else if (newStyle === 'Chicago') {
			citationText = this.formatChicagoCitation(citationMetadata);
		} else if (newStyle === 'AMA') {
			citationText = this.formatAMACitation(citationMetadata);
		} else if (newStyle === 'AP') {
			citationText = this.formatAPCitation(citationMetadata);
		} else if (newStyle === 'Canadian') {
			citationText = this.formatCanadianCitation(citationMetadata);
		} else if (newStyle === 'Oxford') { // ADDED Oxford style
			citationText = this.formatOxfordReferenceCitation(citationMetadata);
		} else if (newStyle === 'None') {
			citationText = ''; // or you could set it to a default like DOI or URL if available
		}


		const citationSectionRegex = /(## Citation\n)([\s\S]*?)(\n---)/;

		const newCitationSection = `## Citation\n${citationText}\n\n---`;
		let updatedContent = '';

		if (contentBody.match(citationSectionRegex)) {
			updatedContent = contentBody.replace(citationSectionRegex, `$1${citationText}\n\n---`);

		} else {
			// If "## Citation" section is not found (shouldn't happen if note was created by plugin), append it.
			updatedContent = contentBody + `\n## Citation\n${citationText}\n\n---`;
		}


		await this.app.vault.modify(file, frontmatterMatch ? `---\n${frontmatterMatch[1]}---\n${updatedContent}` : contentBody + '\n' + newCitationSection);


	}


	// --- Citation Formatting Functions ---

	formatHarvardCitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate Harvard citation due to missing data.";
		}

		// Explicitly cast message.author to Author[]
		const authorsArray: Author[] = message.author as Author[];
		const authors = authorsArray.map((author: Author) => `${author.family}, ${author.given?.[0]}.`).join(', ');
		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate Harvard citation due to missing year data.";
		const title = message.title[0];
		const journal = message['container-title'][0];
		const doi = message.DOI;
		const accessedDate = message['date-accessed'];

		return `${authors} (${year}) ${title}. *${journal}*. Available at: [https://doi.org/${doi}] (Accessed: ${accessedDate}).`;
	}

	formatVancouverCitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate Vancouver citation due to missing data.";
		}

		// Explicitly cast message.author to Author[]
		const authorsArray: Author[] = message.author as Author[];
		const authors = authorsArray.map((author: Author, index: number, array: any[]) => {
			let authorStr = `${author.family} ${author.given?.[0]}`;
			if (array.length > 3 && index === 2) {
				authorStr += ', et al';
				return authorStr;
			}
			if (array.length <= 3 || index < 3) {
				authorStr += '.';
				return authorStr;
			}
			return "";

		}).filter(author => author !== ', et al' && author !== "").join(' ');

		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate Vancouver citation due to missing year data.";
		const title = message.title[0];
		const journal = message['container-title'][0];
		const doi = message.DOI;


		return `${authors} ${title}. ${journal}. ${year}; Available from: [https://doi.org/${doi}].`;
	}

	formatAPACitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate APA citation due to missing data.";
		}

		// Author formatting - APA style
		const authorsArray: Author[] = message.author as Author[];
		let authors = '';
		if (authorsArray.length === 1) {
			authors = `${authorsArray[0].family}, ${authorsArray[0].given?.[0]}.`;
		} else if (authorsArray.length === 2) {
			authors = `${authorsArray[0].family}, ${authorsArray[0].given?.[0]}. & ${authorsArray[1].family}, ${authorsArray[1].given?.[0]}.`;
		} else if (authorsArray.length > 2 && authorsArray.length <= 20) {
			authors = authorsArray.map((author: Author, index) => {
				let authorString = `${author.family}, ${author.given?.[0]}.`;
				if (index === authorsArray.length - 1) {
					authorString = `& ${authorString}`;
				}
				return authorString;
			}).join(', ');
		} else if (authorsArray.length > 20) {
			authors = authorsArray.slice(0, 19).map((author: Author) => `${author.family}, ${author.given?.[0]}.`).join(', ') + ', ..., ' + `${authorsArray[authorsArray.length - 1].family}, ${authorsArray[authorsArray.length - 1].given?.[0]}.`; // For 20+ authors, list first 19, ellipsis, and last author
		}

		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate APA citation due to missing year data.";

		const title = message.title[0];
		const journal = message['container-title'][0];
		const volume = message.volume;
		const issue = message.issue;
		const pages = message.page;
		const doi = message.DOI;
		const url = message.URL;


		let citation = `${authors} (${year}). ${title}. *${journal}*,`;

		if (volume) {
			citation += ` *${volume}*`;
		}

		if (issue) {
			citation += `(${issue})`;
		}


		if (pages) {
			citation += `, ${pages}`;
		}


		if (doi) {
			citation += `. ${doi}`;
		} else if (url) {
			citation += `. Retrieved from ${url}`;
		}


		return citation;
	}


	formatChicagoCitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate Chicago citation due to missing data.";
		}

		// Author formatting - Chicago style (Notes and Bibliography)
		const authorsArray: Author[] = message.author as Author[];
		let authors = '';
		if (authorsArray.length === 1) {
			authors = `${authorsArray[0].given} ${authorsArray[0].family}`;
		} else if (authorsArray.length === 2) {
			authors = `${authorsArray[0].given} ${authorsArray[0].family} and ${authorsArray[1].given} ${authorsArray[1].family}`;
		} else if (authorsArray.length === 3) {
			authors = `${authorsArray[0].given} ${authorsArray[0].family}, ${authorsArray[1].given} ${authorsArray[1].family}, and ${authorsArray[2].given} ${authorsArray[2].family}`;
		}
		else if (authorsArray.length > 3) {
			authors = `${authorsArray[0].given} ${authorsArray[0].family} et al.`; // First author et al. for 4+ authors
		}


		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate Chicago citation due to missing year data.";

		const title = `"${message.title[0]}"`;
		const journal = `*${message['container-title'][0]}*`;
		const volume = message.volume;
		const issue = message.issue;
		const pages = message.page;
		const doi = message.DOI;
		const url = message.URL;


		let citation = `${authors}, ${title}, ${journal}`;

		if (volume && issue && pages) {
			citation += ` ${volume}, no. ${issue} (${year}): ${pages}.`;
		}
		else if (volume && year) { // If no issue or pages but volume and year available
			citation += ` ${volume} (${year}).`;
		} else if (year) {
			citation += ` (${year}).`; // (Year). - if only year is available after Journal Title
		}


		if (doi) {
			citation += ` https://doi.org/${doi}.`;
		} else if (url) {
			citation += ` ${url}.`;
		}


		return citation;
	}

	formatAMACitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate AMA citation due to missing data.";
		}
		// Author formatting - AMA style
		const authorsArray: Author[] = message.author as Author[];
		let authors = '';
		if (authorsArray.length >= 1) {
			authors = authorsArray.map((author: Author) => {
				let authorStr = `${author.family}`;
				if (author.given) {
					// Get initials if given name exists
					const givenNames = author.given.split(' ');
					for (const namePart of givenNames) {
						authorStr += ` ${namePart.charAt(0)}.`;
					}
				}
				return authorStr;
			}).join(', ');
		}


		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate AMA citation due to missing year data.";

		const title = message.title[0];
		const journal = message['container-title'][0];
		const volume = message.volume;
		const issue = message.issue;
		const pages = message.page;
		const doi = message.DOI;
		const url = message.URL;


		let citation = `${authors}. ${title}. *${journal}*.`;

		if (year) {
			citation += ` ${year};`;
		}
		if (volume) {
			citation += `${volume}`;
		}
		if (issue) {
			citation += `(${issue})`;
		}
		if (pages) {
			citation += `:${pages}.`;
		} else {
			citation += ".";
		}


		if (doi) {
			citation += ` doi:${doi}`;
		} else if (url) {
			citation += ` Available at: ${url}. Accessed ${message['date-accessed']}`;
		}


		return citation;
	}


	formatAPCitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate AP citation due to missing data.";
		}

		// Explicitly cast message.author to Author[]
		const authorsArray: Author[] = message.author as Author[];
		const authors = authorsArray.map((author: Author) => `${author.family}, ${author.given?.[0]}.`).join(', ');

		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate AP citation due to missing year data.";

		const title = message.title[0];
		const journal = message['container-title'][0];
		const doi = message.DOI;
		const volume = message.volume;
		const issue = message.issue;
		const pages = message.page;
		const url = message.URL; //AP style sometimes uses URL for online sources

		let citation = `${authors} (${year}). ${title}. _${journal}_`; //Journal title in italics in AP

		if (volume) {
			citation += `, ${volume}`;
		}
		if (issue) {
			citation += `(${issue})`;
		}
		if (pages) {
			citation += `, ${pages}.`;
		} else {
			citation += "."; //Period if no pages
		}


		if (doi) {
			citation += ` doi: ${doi}`;
		} else if (url) {
			citation += ` Retrieved from ${url}`; // Add URL if no DOI
		}

		return citation;
	}

	formatCanadianCitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate Canadian citation due to missing data.";
		}

		// Author formatting - Canadian style
		const authorsArray: Author[] = message.author as Author[];
		let authors = '';
		if (authorsArray.length === 1) {
			authors = `${authorsArray[0].given} ${authorsArray[0].family}`; // Given Name Family Name
		} else {
			authors = authorsArray.map((author: Author) => `${author.given} ${author.family}`).join(', and '); //Use 'and' for multiple authors
		}

		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate Canadian citation due to missing year data.";
		const title = message.title[0];
		const journal = message['container-title'][0];
		const volume = message.volume;
		const issue = message.issue;
		const pages = message.page;
		const doi = message.DOI;
		const accessedDate = message['date-accessed'];
		const url = message.URL;


		let citation = `${authors}. ${year}. ${title}. _${journal}_`; // Journal in italics

		if (volume) {
			citation += `, ${volume}`;
		}
		if (issue) {
			citation += `(${issue})`;
		}
		if (pages) {
			citation += `, ${pages}.`;
		} else {
			citation += "."; // Period if no pages
		}

		if (doi) {
			citation += `. doi: ${doi} [Accessed ${accessedDate}].`; // Add Accessed date for DOI if available
		} else if (url) {
			citation += `. [Online]. Available: ${url} [Accessed ${accessedDate}].`; // Format for online availability, include accessed date
		} else {
			citation += ` [Accessed ${accessedDate}].`; // If no DOI or URL, but still accessed online generally
		}


		return citation;
	}

	formatOxfordReferenceCitation(message: any): string { // ADDED Oxford style function
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate Oxford Reference citation due to missing data.";
		}

		// Author formatting - Oxford Reference style (similar to Chicago, full given name, family name)
		const authorsArray: Author[] = message.author as Author[];
		let authors = '';
		if (authorsArray.length === 1) {
			authors = `${authorsArray[0].given} ${authorsArray[0].family},`; // Single author
		} else {
			authors = authorsArray.map((author: Author, index) => {
				let authorString = `${author.given} ${author.family}`;
				if (index < authorsArray.length - 1) {
					authorString += ','; // Comma after each author except the last
				}
				return authorString;
			}).join(' and '); // "and" before the last author for multiple authors
		}

		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate Oxford Reference citation due to missing year data.";

		const title = `‘${message.title[0]}’,`; // Title in single quotes
		const journal = `*${message['container-title'][0]}*`; // Journal title italicized
		const volume = message.volume;
		const issue = message.issue;
		const pages = message.page;
		const doi = message.DOI;
		const url = message.URL;

		let citation = `${authors} ${title} ${journal},`; // Author, 'Title', *Journal*,

		if (volume) {
			citation += ` vol. ${volume}`;
		}
		if (issue) {
			citation += `, no. ${issue}`;
		}
		if (year) {
			citation += ` (${year})`; // Year in parentheses
		}
		if (pages) {
			citation += `, pp. ${pages}`; // pp. for pages
		}

		citation += '.'; // Period at the end of main elements

		if (doi) {
			citation += ` doi: ${doi}`;
		} else if (url) {
			citation += ` Available at: ${url} (Accessed ${message['date-accessed']})`; // Accessed date for URLs
		}


		return citation;
	}


	// --- End Citation Formatting Functions ---
}


class DOIModal extends Modal {
	doi: string;
	settings: HappyRefSettings;
	onSubmit: (doi: string) => void;

	constructor(app: App, settings: HappyRefSettings, onSubmit: (doi: string) => void) {
		super(app);
		this.settings = settings;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'Enter DOI' });

		new Setting(contentEl)
			.setName('DOI')
			.addText((text) => text.onChange(value => {
				this.doi = value
			}));


		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Submit')
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.doi);
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class CitationStyleModal extends Modal {
	newStyle: CitationStyle;
	onSubmit: (newStyle: CitationStyle) => void;
	plugin: HappyRef; // Add plugin property

	constructor(app: App, plugin: HappyRef, onSubmit: (newStyle: CitationStyle) => void) { // Modify constructor to accept plugin
		super(app);
		this.onSubmit = onSubmit;
		this.plugin = plugin; // Store the plugin instance
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Change Citation Style' });

		new Setting(contentEl)
			.setName('Select Citation Style')
			.addDropdown(async (dropdown: DropdownComponent) => {
				const citationStyles: CitationStyle[] = ['Harvard', 'Vancouver', 'APA', 'Chicago', 'AMA', 'AP', 'Canadian', 'Oxford', 'None']; // ADDED 'Oxford' to dropdown
				citationStyles.forEach(style => {
					dropdown.addOption(style, style);
				});
				dropdown.setValue(this.plugin.settings.citationStyle); // Now `this.plugin` is valid!
				dropdown.onChange(async (value: CitationStyle) => {
					this.newStyle = value;
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Change Style')
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.newStyle);
				}));

	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class CrossrefSettingTab extends PluginSettingTab {
	plugin: HappyRef;

	constructor(app: App, plugin: HappyRef) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'HappyRef Settings' });

		new Setting(containerEl)
			.setName('Default Citation Style')
			.setDesc('Choose the default citation style for notes.')
			.addDropdown(async (dropdown) => {
				const citationStyles: CitationStyle[] = ['Harvard', 'Vancouver', 'APA', 'Chicago', 'AMA', 'AP', 'Canadian', 'Oxford', 'None']; // ADDED 'Oxford' to dropdown
				citationStyles.forEach(style => {
					dropdown.addOption(style, style);
				});
				dropdown.setValue(this.plugin.settings.citationStyle);
				dropdown.onChange(async (value: CitationStyle) => {
					this.plugin.settings.citationStyle = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Filename Style')
			.setDesc('Choose the style for the filename of the created notes.')
			.addDropdown(async (dropdown) => {
				const filenameStyles: FileNameStyle[] = ['Title', 'Author', 'Author (Year)']; // Corrected array of FileNameStyle
				filenameStyles.forEach(style => {
					dropdown.addOption(style, style);
				});
				dropdown.setValue(this.plugin.settings.fileNameStyle);
				dropdown.onChange(async (value: FileNameStyle) => {
					this.plugin.settings.fileNameStyle = value;
					await this.plugin.saveSettings();
				});
			});


		new Setting(containerEl)
			.setName('Default Folder')
			.setDesc('Enter the folder path where notes will be created. Leave empty for root.')
			.addText(text => text
				.setPlaceholder('e.g., CrossrefNotes')
				.setValue(this.plugin.settings.defaultFolder)
				.onChange(async (value) => {
					// Folder creation logic starts here
					if (value) {
						const folder = this.app.vault.getAbstractFileByPath(value);
						if (!folder) {
							try {
								await this.app.vault.createFolder(value);
								new Notice(`Folder "${value}" created.`);
							} catch (e) {
								console.error("Error creating folder:", e);
								new Notice(`Failed to create folder "${value}". Check console for details.`);
							}
						}
					}
					this.plugin.settings.defaultFolder = value;
					await this.plugin.saveSettings();
				}));
	}
}
