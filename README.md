# Still

Still is a quiet Markdown editor for the Mac. Your notes stay as files in folders you choose. One note is open at a time, it is shown as rendered prose, and it is saved as you write, without a save badge or a status flash.

## Install

On a Mac, this installs the latest release and opens it:

```sh
curl -fsSL https://raw.githubusercontent.com/megazear7/still/main/scripts/install-mac.sh | sh
```

The script picks the Apple silicon or Intel build, copies `Still.app` to `/Applications` (or `~/Applications` if that folder is not writable), and opens it.

You can also download a disk image or zip from the [releases page](https://github.com/megazear7/still/releases). Apple silicon builds are named `arm64`. Intel builds are named `x64`.

Still is signed just enough to run. It is not notarized. If macOS says it cannot be opened after a browser download, right-click Still and choose Open the first time. The install script clears that quarantine flag for you.

The first time you open a folder on the Desktop or in Documents, macOS asks whether Still may read it. Allow that, or the notes in that folder stay blank.

## Writing

Add a folder with **File → Add Folder** (⌘O). Still remembers the folders you add, the one that was expanded, and the note that was open.

The sidebar has two modes:

- **Files** (⌘1) is the folder tree. Drag a note or folder to move it. Right-click for a new note, a new folder, rename, duplicate, reveal in Finder, or delete. Deleting asks you to confirm. Removing a root folder only takes it out of the sidebar.
- **Contents** (⌘2) is the shape of the open note: headings, and the paragraphs under them. Short lines that follow one another are gathered into one entry. A longer line stays on its own. Hover a paragraph to read a short preview. Click an entry and that passage is brought into view with a brief flash.

**Find** (⌘F) sits at the top right. It can search every file in your folders, or only the open note. In the open note, matches are highlighted. The menu shows where you are (`3 of 16`) and lists that match plus the next ones, up to ten. Enter steps through them. The × in the field clears the search.

New notes are **File → New Note** (⌘N).

## Develop

```sh
npm install
npm test
npm run dev
```

`npm run app` builds a local `Still.app`. `npm run dist` builds Apple silicon and Intel disk images and zips in `release/`.
