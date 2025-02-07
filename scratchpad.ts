import {Plugin, 
  App,
  FuzzySuggestModal,
  TFolder,
  Modal,
  Vault,
  MarkdownView,
  TFile,
} from 'obsidian';

enum NewFileLocation {
  CurrentPane = 'current-pane',
  NewPane = 'new-pane',
  NewTab = 'new-tab',
}
class CreateNoteModal extends Modal {
  mode: NewFileLocation;
  folder: TFolder;
  newDirectoryPath: string;
  inputEl: HTMLInputElement;
  instructionsEl: HTMLElement;
  inputListener: EventListener;

  constructor(app: App, mode: NewFileLocation) {
    super(app);

    this.mode = mode;

    // create input
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Type filename for new note';
    this.inputEl.className = 'prompt-input';

    // create instructions
    const instructions = [
      {
        command: '↵',
        purpose: 'to create note (default: Untitled)',
      },
      {
        command: 'esc',
        purpose: 'to dismiss creation',
      },
    ] as Instruction[];
    this.instructionsEl = document.createElement('div');
    this.instructionsEl.addClass('prompt-instructions');
    const children = instructions.map((x) => {
      const child = document.createElement('div');
      child.addClass('prompt-instruction');

      const command = document.createElement('span');
      command.addClass('prompt-instruction-command');
      command.innerText = x.command;
      child.appendChild(command);

      const purpose = document.createElement('span');
      purpose.innerText = x.purpose;
      child.appendChild(purpose);

      return child;
    });
    for (const child of children) {
      this.instructionsEl.appendChild(child);
    }

    // make modal
    this.modalEl.className = 'prompt';
    this.modalEl.innerHTML = '';
    this.modalEl.appendChild(this.inputEl);
    this.modalEl.appendChild(this.instructionsEl);

    this.inputListener = this.listenInput.bind(this);
  }

  setFolder(folder: TFolder, newDirectoryPath: string) {
    this.folder = folder;
    this.newDirectoryPath = newDirectoryPath;
  }

  listenInput(evt: KeyboardEvent) {
    if (evt.key === 'Enter') {
      // prevent enter after note creation
      evt.preventDefault();
      // Do work
      this.createNewNote(this.inputEl.value);
      this.close();
    }
  }

  onOpen() {
    this.inputEl.focus();
    this.inputEl.addEventListener('keydown', this.inputListener);
  }

  onClose() {
    this.inputEl.removeEventListener('keydown', this.inputListener);
  }

  /**
   * Creates a directory (recursive) if it does not already exist.
   * This is a helper function that includes a workaround for a bug in the
   * Obsidian mobile app.
   */
  private async createDirectory(dir: string): Promise<void> {
    const { vault } = this.app;
    const { adapter } = vault;
    const root = vault.getRoot().path;
    const directoryPath = path.join(this.folder.path, dir);
    const directoryExists = await adapter.exists(directoryPath);
    // ===============================================================
    // -> Desktop App
    // ===============================================================
    
    // ===============================================================
    // -> Mobile App (IOS)
    // ===============================================================
    // This is a workaround for a bug in the mobile app:
    // To get the file explorer view to update correctly, we have to create
    // each directory in the path one at time.

    // Split the path into an array of sub paths
    // Note: `normalizePath` converts path separators to '/' on all platforms
    // @example '/one/two/three/' ==> ['one', 'one/two', 'one/two/three']
    // @example 'one\two\three' ==> ['one', 'one/two', 'one/two/three']
    const subPaths: string[] = normalizePath(directoryPath)
      .split('/')
      .filter((part) => part.trim() !== '')
      .map((_, index, arr) => arr.slice(0, index + 1).join('/'));

    // Create each directory if it does not exist
    for (const subPath of subPaths) {
      const directoryExists = await adapter.exists(path.join(root, subPath));
      if (!directoryExists) {
        await adapter.mkdir(path.join(root, subPath));
      }
    }
  }

  /**
   * Handles creating the new note
   * A new markdown file will be created at the given file path (`input`)
   * in the specified parent folder (`this.folder`)
   */
  async createNewNote(input: string): Promise<void> {
    const { vault } = this.app;
    const { adapter } = vault;
    const prependDirInput = path.join(this.newDirectoryPath, input);
    const { dir, name } = path.parse(prependDirInput);
    const directoryPath = path.join(this.folder.path, dir);
    const filePath = path.join(directoryPath, `${name}.md`);

    try {
      const fileExists = await adapter.exists(filePath);
      if (fileExists) {
        // If the file already exists, respond with error
        throw new Error(`${filePath} already exists`);
      }
      if (dir !== '') {
        // If `input` includes a directory part, create it
        await this.createDirectory(dir);
      }
      const File = await vault.create(filePath, 'This is what should happen');
      // Create the file and open it in the active leaf
      let leaf = this.app.workspace.getLeaf(false);
      if (this.mode === NewFileLocation.NewPane) {
        leaf = this.app.workspace.splitLeafOrActive();
      } else if (this.mode === NewFileLocation.NewTab) {
        leaf = this.app.workspace.getLeaf(true);
      } else if (!leaf) {
        // default for active pane
        leaf = this.app.workspace.getLeaf(true);
      }
      await leaf.openFile(File);
    } catch (error) {
      new Notice(error.toString());
    }
  }
}


import { normalizePath } from 'obsidian';

interface ParsedPath {
  /** The full directory path such as '/home/user/dir' or 'folder/sub' */
  dir: string;
  /** The file name without extension */
  name: string;
}

export const path = {
  /**
   * Parses the file path into a directory and file name.
   * If the path string does not include a file name, it will default to
   * 'Untitled'.
   *
   * @example
   * parse('/one/two/file name')
   * // ==> { dir: '/one/two', name: 'file name' }
   *
   * parse('\\one\\two\\file name')
   * // ==> { dir: '/one/two', name: 'file name' }
   *
   * parse('')
   * // ==> { dir: '', name: 'Untitled' }
   *
   * parse('/one/two/')
   * // ==> { dir: '/one/two/', name: 'Untitled' }
   */
  parse(pathString: string): ParsedPath {
    const regex = /(?<dir>([^/\\]+[/\\])*)(?<name>[^/\\]*$)/;
    const match = String(pathString).match(regex);
    const { dir, name } = match && match.groups;
    return { dir, name: name || 'Untitled' };
  },

  /**
   * Joins multiple strings into a path using Obsidian's preferred format.
   * The resulting path is normalized with Obsidian's `normalizePath` func.
   * - Converts path separators to '/' on all platforms
   * - Removes duplicate separators
   * - Removes trailing slash
   */
  join(...strings: string[]): string {
    const parts = strings.map((s) => String(s).trim()).filter((s) => s != null);
    return normalizePath(parts.join('/'));
  },
};

const EMPTY_TEXT = 'No folder found. Press esc to dismiss.';
const PLACEHOLDER_TEXT = 'Type folder name to fuzzy find.';
const instructions = [
  { command: '↑↓', purpose: 'to navigate' },
  { command: 'Tab ↹', purpose: 'to autocomplete folder' },
  { command: '↵', purpose: 'to choose folder' },
  { command: 'esc', purpose: 'to dismiss' },
];

class ChooseFolderModal extends FuzzySuggestModal<TFolder> {
  mode: NewFileLocation;
  folders: TFolder[];
  chooseFolder: HTMLDivElement;
  suggestionEmpty: HTMLDivElement;
  noSuggestion: boolean;
  newDirectoryPath: string;
  createNoteModal: CreateNoteModal;
  inputListener: EventListener;

  constructor(app: App, mode: NewFileLocation) {
    super(app);
    this.mode = mode;
    this.init();
  }

  init() {
    const folders = new Set() as Set<TFolder>;
    const sortedFolders = [] as TFolder[];
    const leaf = this.app.workspace.getLeaf(false);
    if (
      leaf &&
      leaf.view instanceof MarkdownView &&
      leaf.view.file instanceof TFile &&
      leaf.view.file.parent instanceof TFolder
    ) {
      // pre-select current folder
      folders.add(leaf.view.file.parent);
      sortedFolders.push(leaf.view.file.parent);
    }
    Vault.recurseChildren(this.app.vault.getRoot(), (file) => {
      if (file instanceof TFolder && !folders.has(file)) {
        folders.add(file);
        sortedFolders.push(file);
      }
    });
    this.folders = sortedFolders;
    this.emptyStateText = EMPTY_TEXT;
    this.setPlaceholder(PLACEHOLDER_TEXT);
    this.setInstructions(instructions);
    this.initChooseFolderItem();
    this.createNoteModal = new CreateNoteModal(this.app, this.mode);

    this.inputListener = this.listenInput.bind(this);
  }

  getItems(): TFolder[] {
    return this.folders;
  }

  getItemText(item: TFolder): string {
    this.noSuggestion = false;
    return item.path;
  }

  onNoSuggestion() {
    this.noSuggestion = true;
    this.newDirectoryPath = this.inputEl.value;
    this.resultContainerEl.childNodes.forEach((c) =>
      c.parentNode.removeChild(c)
    );
    this.chooseFolder.innerText = this.inputEl.value;
    this.itemInstructionMessage(
      this.chooseFolder,
      'Press ↵ or append / to create folder.'
    );
    this.resultContainerEl.appendChild(this.chooseFolder);
    this.resultContainerEl.appendChild(this.suggestionEmpty);
  }

  shouldCreateFolder(evt: MouseEvent | KeyboardEvent): boolean {
    if (this.newDirectoryPath.endsWith('/')) {
      return true;
    }
    if (evt instanceof KeyboardEvent && evt.key == 'Enter') {
      return true;
    }
    return false;
  }

  findCurrentSelect(): HTMLElement {
    return document.querySelector('.suggestion-item.is-selected');
  }

  listenInput(evt: KeyboardEvent) {
    if (evt.key === 'Tab') {
      this.inputEl.value = this.findCurrentSelect()?.innerText;
      // Disable tab selections on input
      evt.preventDefault();
    } else if (
      (evt.ctrlKey || evt.metaKey) &&
      (evt.key === 'k' || evt.key === 'p')
    ) {
      // Ctrl/cmd+k and ctrl/cmd+p mapped to up arrow
      const upArrowEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      this.inputEl.dispatchEvent(upArrowEvent);
    } else if (
      (evt.ctrlKey || evt.metaKey) &&
      (evt.key === 'j' || evt.key === 'n')
    ) {
      // Ctrl/cmd+j and ctrl/cmd+n mapped to down arrow
      const downArrowEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      this.inputEl.dispatchEvent(downArrowEvent);
    }
  }

  onOpen() {
    super.onOpen();
    this.inputEl.addEventListener('keydown', this.inputListener);
  }

  onClose() {
    this.inputEl.removeEventListener('keydown', this.inputListener);
    super.onClose();
  }

  onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent): void {
    if (this.noSuggestion) {
      if (!this.shouldCreateFolder(evt)) {
        return;
      }
      this.createNoteModal.setFolder(
        this.app.vault.getRoot(),
        this.newDirectoryPath
      );
    } else {
      this.createNoteModal.setFolder(item, '');
    }
    this.createNoteModal.open();
  }

  initChooseFolderItem() {
    this.chooseFolder = document.createElement('div');
    this.chooseFolder.addClasses(['suggestion-item', 'is-selected']);
    this.suggestionEmpty = document.createElement('div');
    this.suggestionEmpty.addClass('suggestion-empty');
    this.suggestionEmpty.innerText = EMPTY_TEXT;
  }

  itemInstructionMessage(resultEl: HTMLElement, message: string) {
    const el = document.createElement('kbd');
    el.addClass('suggestion-hotkey');
    el.innerText = message;
    resultEl.appendChild(el);
  }
}

export default class AdvancedNewFilePlugin extends Plugin {
  async onload() {
    console.log('loading plugin');

    this.addCommand({
      id: 'advanced-new-file',
      name: 'Create note in the current pane',
      callback: () => {
        new ChooseFolderModal(this.app, NewFileLocation.CurrentPane).open();
      },
    });

    this.addCommand({
      id: 'advanced-new-file-new-pane',
      name: 'Create note in a new pane',
      callback: () => {
        new ChooseFolderModal(this.app, NewFileLocation.NewPane).open();
      },
    });

    this.addCommand({
      id: 'advanced-new-file-new-tab',
      name: 'Create note in a new tab',
      callback: () => {
        new ChooseFolderModal(this.app, NewFileLocation.NewTab).open();
      },
    });
  }

  onunload() {
    console.log('unloading plugin');
  }
}


/* import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { CrossrefClient, QueryWorksParams } from "@jamesgopsill/crossref-client"


interface HappyRefSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: HappyRefSettings = {
	mySetting: 'default'
}

export default class HappyRef extends Plugin {
	settings: HappyRefSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			const client = new CrossrefClient()
// Test for crossref API - should create notice, working.
			const search: QueryWorksParams = {
					queryAuthor: "Richard Feynman",
					}
			const r = await client.works(search)
			if (r.ok && r.status == 200) new Notice(r.status)
// Remember to rename these classes and interfaces!
			// new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

// Stolen from https://github.com/mProjectsCode/obsidian-media-db-plugin/blob/master/src/main.ts#L301
	async function createNoteFromDOI(): Promise<void> {
		try {
			console.debug('MDB | creating new note');

			options.openNote = this.settings.openNoteInNewTab;

			const fileContent = await this.generateMediaDbNoteContents(mediaTypeModel, options);

			if (!options.folder) {
				options.folder = await this.mediaTypeManager.getFolder(mediaTypeModel, this.app);
			}

			const targetFile = await this.createNote(this.mediaTypeManager.getFileName(mediaTypeModel), fileContent, options);

			if (this.settings.enableTemplaterIntegration) {
				await useTemplaterPluginInFile(this.app, targetFile);
			}
		} catch (e) {
			console.warn(e);
			new Notice(`${e}`);
		}
	}

// From https://blog.logrocket.com/writing-constructor-typescript/
async function  DemoClassTest (
   constructor(x : string, y:string);
   constructor(x : number);
   constructor(x : number, y:string, z:string);
   constructor(...myarray: any[]) {

    if (myarray.length === 2) {
		const client = new CrossrefClient()

		const search: QueryWorksParams = {
			queryAuthor: "Richard Feynman",
			}
			const r = await client.works(search)
			if (r.ok && r.status == 200) console.log(r.content)
)
/* 

//      console.log('two argument constructor called here !!');
      return;
    }
    if (myarray.length === 3) {
      console.log('three argument constructor called here !!');
      return;
    }
    if (myarray.length === 1) {
        console.log('one argument constructor called here !!');
        return;
      }
  } */
//}


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
let suffix = 1;
while (file instanceof TFile) {
	filename = `${sanitizedTitle} (${suffix})`;
	filePath = folderPath ? folderPath.replace(/\/+$/, '') + '/' + filename + ".md" : filename + ".md";
	file = this.app.vault.getAbstractFileByPath(filePath);
	suffix++;
}


let content = `---\ntags: [crossref]\n---\n`;
content += `# ${title}\n\n`;

if (message.author) {
	content += `**Authors:** ${message.author.map((author: any) => `${author.given} ${author.family}`).join(', ')}\n\n`;
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

if (message.abstract) {
	content += `## Abstract\n${message.abstract}\n`;
}


await this.app.vault.create(filePath, content);
