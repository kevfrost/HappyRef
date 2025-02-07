import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, DropdownComponent } from 'obsidian';

interface HappyRefSettings {
	defaultFolder: string;
	citationStyle: CitationStyle; // Added citationStyle setting
}

type CitationStyle = 'Harvard' | 'Vancouver' | 'None'; // Define citation style options

const DEFAULT_SETTINGS: HappyRefSettings = {
	defaultFolder: '',
	citationStyle: 'Harvard' // Default citation style is Harvard
}

// Define interface for Author object based on Crossref API response
interface Author {
	given?: string; // Given name is optional
	family?: string; // Family name is optional
}


export default class HappyRef extends Plugin { // Class name changed to HappyRef
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
							const createdFile = await this.createNote(data.message); // Modified to return TFile
							if (createdFile) {
								await this.app.workspace.openLinkText(createdFile.path, '', false); // Open the created file
							}
							console.log(data.message);
							new Notice(`Successfully created and opened note for DOI: ${doi}`); // Updated notice
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

		this.addCommand({
			id: 'fetch-crossref-isbn',
			name: 'Fetch from Crossref by ISBN',
			callback: () => {
				new ISBNModal(this.app, this.settings, async (isbn) => {
					try {
						const data = await this.fetchCrossrefDataByISBN(isbn);
						if (data && data.message) {
							const createdFile = await this.createNote(data.message); // Modified to return TFile
							if (createdFile) {
								await this.app.workspace.openLinkText(createdFile.path, '', false); // Open the created file
							}
							console.log(data.message);
							new Notice(`Successfully created and opened note for ISBN: ${isbn}`); // Updated notice
						} else {
							new Notice(`Failed to fetch data or invalid ISBN: ${isbn}`);
						}
					} catch (error) {
						console.error("Error fetching or creating note:", error);
						new Notice(`Error fetching data: ${error.message}`);
					}
				}).open();
			}
		});


		this.addRibbonIcon('sticker', 'Fetch Crossref DOI', () => { // Added ribbon button for DOI
			new DOIModal(this.app, this.settings, async (doi) => { // Same modal call as in command
				try {
					const data = await this.fetchCrossrefData(doi);
					if (data && data.message) {
						const createdFile = await this.createNote(data.message); // Modified to return TFile
						if (createdFile) {
							await this.app.workspace.openLinkText(createdFile.path, '', false); // Open the created file
						}
						console.log(data.message);
						new Notice(`Successfully created and opened note for DOI: ${doi}`); // Updated notice
					} else {
						new Notice(`Failed to fetch data or invalid DOI: ${doi}`);
					}
				} catch (error) {
					console.error("Error fetching or creating note:", error);
					new Notice(`Error fetching data: ${error.message}`);
				}
			}).open();
		});

		this.addRibbonIcon('blocks', 'Fetch Crossref ISBN', () => { // Added ribbon button for ISBN - using 'blocks' icon (you can choose a different one)
			new ISBNModal(this.app, this.settings, async (isbn) => { // Same modal call as in command, but with ISBNModal
				try {
					const data = await this.fetchCrossrefDataByISBN(isbn);
					if (data && data.message) {
						const createdFile = await this.createNote(data.message); // Modified to return TFile
						if (createdFile) {
							await this.app.workspace.openLinkText(createdFile.path, '', false); // Open the created file
						}
						console.log(data.message);
						new Notice(`Successfully created and opened note for ISBN: ${isbn}`); // Updated notice
					} else {
						new Notice(`Failed to fetch data or invalid ISBN: ${isbn}`);
					}
				} catch (error) {
					console.error("Error fetching or creating note:", error);
					new Notice(`Error fetching data: ${error.message}`);
				}
			}).open();
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


	async createNote(message: any): Promise<TFile | null> { // Modified return type to Promise<TFile | null>
		let title = message.title?.[0] || "Untitled";
		// Sanitize title to be filename-friendly, replace invalid characters with spaces and trim
		const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, ' ').trim();
		let filename = sanitizedTitle || "Crossref Note";

		const folderPath = this.settings.defaultFolder;
		let filePath = filename + ".md";

		if (folderPath) {
			filePath = folderPath.replace(/\/+$/, '') + '/' + filename + ".md"; // Ensure no trailing slash and then add one
		}

		let file = this.app.vault.getAbstractFileByPath(filePath);

		// --- Debugging line: ---
		console.log("TFile:", TFile);
		// --- End debugging line ---

		let suffix = 1;
		while (file instanceof TFile) {
			filename = `${sanitizedTitle} (${suffix})`;
			filePath = folderPath ? folderPath.replace(/\/+$/, '') + '/' + filename + ".md" : filename + ".md";
			file = this.app.vault.getAbstractFileByPath(filePath);
			suffix++;
		}

		// --- Add authors to properties ---
		let authors: string[] = [];
		if (message.author) {
			// Explicitly cast message.author to Author[]
			const authorsArray: Author[] = message.author as Author[];
			authors = authorsArray.map((author: Author) => `${author.given} ${author.family}`); // используем интерфейс Author
		}

		// --- YAML Frontmatter Content ---
		let content = `---\ntags: [CreatedBy/HappyRef]\n`; // Changed tag to HappyRef
		if (authors.length > 0) {
			content += `authors: ${JSON.stringify(authors)}\n`; // Use JSON.stringify to format array in YAML
		}
		if (message['container-title'] && message['container-title'][0]) { // Journal/Container Title
			content += `Journal: ${message['container-title'][0]}\n`;
		}
		if (message['volume']) { // Volume
			content += `Volume: ${message['volume']}\n`;
		}
		if (message['page']) { // Page
			content += `Page: ${message['page']}\n`;
		}
		if (message['issue']) { // Issue - Corrected from 'Issue' to 'issue'
			content += `Issue: ${message['issue']}\n`; // Corrected from 'Issue' to 'issue'
		}
		if (message.issued && message.issued['date-parts'] && message.issued['date-parts'][0]) { // Publication Date
			const dateParts = message.issued['date-parts'][0];
			const year = dateParts[0];
			const month = dateParts[1];
			const day = dateParts[2];
			let dateString = `${year}`;
			if (month) dateString += `-${String(month).padStart(2, '0')}`;
			if (day) dateString += `-${String(day).padStart(2, '0')}`;
			content += `Publication_Date: ${dateString}\n`; // Changed to Publication_Date for property name convention
		}
		if (message.DOI) { // DOI
			content += `DOI: ${message.DOI}\n`;
		}
		if (message.type) { // Type
			content += `Type: ${message.type}\n`;
		}
		if (message.URL) { // URL
			content += `URL: ${message.URL}\n`;
		}
		if (message.ISBN) { // ISBN - Add ISBN to properties
			content += `ISBN: ${message.ISBN[0]}\n`; // Assuming ISBN is an array, take the first one
		}
		// --- Get and Format Current Date for "Accessed" ---
		const currentDate = new Date();
		const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
		const day = currentDate.getDate().toString().padStart(2,"0");
		const yearAccessed = currentDate.getFullYear();
		const accessedDate = `${yearAccessed}-${month}-${day}`; // Format: "Month Day, Year"
		content += `Date Accessed: ${accessedDate}\n`;

		content += `---\n\n`; // Closing --- for YAML frontmatter
		// --- End YAML Frontmatter Content ---


		content += `# ${title}\n\n`;

		// --- Citation Formatting ---
		const citationStyle = this.settings.citationStyle;
		let citationText = '';

		if (citationStyle === 'Harvard') {
			citationText = this.formatHarvardCitation(message);
		} else if (citationStyle === 'Vancouver') {
			citationText = this.formatVancouverCitation(message);
		}

		if (citationText) {
			content += `## Citation\n${citationText}\n\n---\n\n`; // Add citation section if citationText is not empty
		}
		// --- End Citation Formatting ---

		/*

			   if (message.author) {
				  // Explicitly cast message.author to Author[]
				  const authorsArray: Author[] = message.author as Author[];
				  content += `**Authors:** ${authorsArray.map((author: Author) => `${author.given} ${author.family}`).join(', ')}\n\n`; // используем интерфейс Author
			   }

			   if (message['container-title']) {
				  content += `**Source:** ${message['container-title'].join(', ')}\n\n`;
			   } else if (message.publisher) {
				  content += `**Publisher:** ${message.publisher}\n\n`;
			   }

			   if (message.issued && message.issued['date-parts'] && message.issued['date-parts'][0]) {
				  const dateParts = message.issued['date-parts'][0];
				  const year = dateParts[0];
				  const month = dateParts[1];
				  const day = dateParts[2];
				  let dateString = `${year}`;
				  if (month) dateString += `-${String(month).padStart(2, '0')}`;
				  if (day) dateString += `-${String(day).padStart(2, '0')}`;

				  content += `**Publication Date:** ${dateString}\n\n`;
			   }

			   if (message.DOI) {
				  content += `**DOI:** [${message.DOI}](https://doi.org/${message.DOI})\n\n`;
			   }
			   if (message.URL) {
				  content += `**URL:** ${message.URL}\n\n`;
			   }
		*/
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


		const createdTFile = await this.app.vault.create(filePath, content); // Store the TFile object
		return createdTFile; // Return the TFile object
	}

	// --- Citation Formatting Functions ---

	formatHarvardCitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate Harvard citation due to missing data.";
		}

		// Explicitly cast message.author to Author[]
		const authorsArray: Author[] = message.author as Author[];
		const authors = authorsArray.map((author: Author) => `${author.family}, ${author.given?.[0]}.`).join(', '); // используем интерфейс Author and optional chaining
		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate Harvard citation due to missing year data."; // Added year check
		const title = message.title[0];
		const journal = message['container-title'][0];
		const doi = message.DOI;

		// --- Get and Format Current Date for "Accessed" ---
		const currentDate = new Date();
		const month = currentDate.toLocaleString('default', { month: 'long' }); // Get full month name (e.g., "October")
		const day = currentDate.getDate();
		const yearAccessed = currentDate.getFullYear();
		const accessedDate = `${month} ${day}, ${yearAccessed}`; // Format: "Month Day, Year"

		return `${authors} (${year}) ${title}. *${journal}*. Available at: [https://doi.org/${doi}] (Accessed: ${accessedDate}).`;
	}

	formatVancouverCitation(message: any): string {
		if (!message.author || !message.issued || !message.title || !message['container-title']) {
			return "Could not generate Vancouver citation due to missing data.";
		}

		// Explicitly cast message.author to Author[]
		const authorsArray: Author[] = message.author as Author[];
		const authors = authorsArray.map((author: Author, index: number, array: any[]) => { // используем интерфейс Author
			let authorStr = `${author.family} ${author.given?.[0]}`; // optional chaining
			if (array.length > 3 && index === 2) {
				authorStr += ', et al';
				return authorStr; // Return "et al." after 3rd author in Vancouver if more than 3
			}
			if (array.length <=3 || index < 3)
			{
				authorStr += '.';
				return authorStr;
			}
			return ""; // Don't include authors after the 3rd for Vancouver if more than 3 are present.

		}).filter(author => author !== ', et al' && author !== "").join(' '); // Filter out empty authors and et al. if it's after 3rd.

		const year = message.issued['date-parts'][0][0];
		if (!year) return "Could not generate Vancouver citation due to missing year data."; // Added year check
		const title = message.title[0];
		const journal = message['container-title'][0];
		const doi = message.DOI;


		return `${authors} ${title}. ${journal}. ${year}; Available from: [https://doi.org/${doi}].`; // Vancouver style in example doesn't include accessed date.
	}


}

class DOIModal extends Modal {
	doi: string;
	onSubmit: (doi: string) => void;
	settings: HappyRefSettings; // Changed to HappyRefSettings

	constructor(app: App, settings: HappyRefSettings, onSubmit: (doi: string) => void) { // Changed to HappyRefSettings
		super(app);
		this.onSubmit = onSubmit;
		this.settings = settings;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Enter DOI" });

		const inputEl = contentEl.createEl("input", { type: "text", placeholder: "e.g., 10.1038/nature18617" });
		inputEl.style.width = "100%";

		// Add input event listener to remove spaces and doi.org prefix
		inputEl.addEventListener('input', () => {
			inputEl.value = inputEl.value.replace(/\s/g, ''); // Remove spaces
			const doiOrgPrefix = 'https://doi.org/';
			if (inputEl.value.startsWith(doiOrgPrefix)) {
				inputEl.value = inputEl.value.substring(doiOrgPrefix.length); // Remove doi.org prefix
			}
		});

		const submitButton = contentEl.createEl("button", { text: "Fetch Data" });
		submitButton.classList.add("mod-cta"); // Add Obsidian's primary button class

		submitButton.addEventListener("click", () => {
			const doiValue = inputEl.value.trim();
			if (doiValue) {
				this.doi = doiValue;
				this.close();
				this.onSubmit(this.doi);
			} else {
				new Notice("DOI cannot be empty.");
			}
		});

		contentEl.addEventListener("keydown", (event) => {
			if (event.key === 'Enter') {
				submitButton.click();
			}
		});

		// Focus on input when modal opens
		inputEl.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ISBNModal extends Modal {
	isbn: string;
	onSubmit: (isbn: string) => void;
	settings: HappyRefSettings; // Changed to HappyRefSettings

	constructor(app: App, settings: HappyRefSettings, onSubmit: (isbn: string) => void) { // Changed to HappyRefSettings
		super(app);
		this.onSubmit = onSubmit;
		this.settings = settings;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Enter ISBN" });

		const inputEl = contentEl.createEl("input", { type: "text", placeholder: "e.g., 978-0321765723" });
		inputEl.style.width = "100%";

		// Add input event listener to remove spaces and common ISBN prefixes
		inputEl.addEventListener('input', () => {
			inputEl.value = inputEl.value.replace(/\s/g, ''); // Remove spaces
			inputEl.value = inputEl.value.replace(/^ISBN[:-]?/i, ''); // Remove ISBN prefix (case-insensitive, with optional colon or hyphen)
		});

		const submitButton = contentEl.createEl("button", { text: "Fetch Data" });
		submitButton.classList.add("mod-cta"); // Add Obsidian's primary button class

		submitButton.addEventListener("click", () => {
			const isbnValue = inputEl.value.trim();
			if (isbnValue) {
				this.isbn = isbnValue;
				this.close();
				this.onSubmit(this.isbn);
			} else {
				new Notice("ISBN cannot be empty.");
			}
		});

		contentEl.addEventListener("keydown", (event) => {
			if (event.key === 'Enter') {
				submitButton.click();
			}
		});

		// Focus on input when modal opens
		inputEl.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}


class CrossrefSettingTab extends PluginSettingTab { // Class name remains CrossrefSettingTab (as settings tab is still conceptually about Crossref)
	plugin: HappyRef; // Plugin type changed to HappyRef

	constructor(app: App, plugin: HappyRef) { // Plugin type changed to HappyRef
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Crossref Plugin Settings' }); // Settings tab title remains Crossref Plugin Settings for clarity

		new Setting(containerEl)
			.setName('Default Folder')
			.setDesc('Enter the folder path where notes will be created. Leave empty for root.')
			.addText(text => text
				.setPlaceholder('e.g., CrossrefNotes')
				.setValue(this.plugin.settings.defaultFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl) // Added Citation Style Dropdown Setting
			.setName('Citation Style')
			.setDesc('Choose the citation style for the generated notes.')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOptions({
						'Harvard': 'Harvard',
						'Vancouver': 'Vancouver',
						'None': 'None'
					})
					.setValue(this.plugin.settings.citationStyle)
					.onChange(async (value: CitationStyle) => {
						this.plugin.settings.citationStyle = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
