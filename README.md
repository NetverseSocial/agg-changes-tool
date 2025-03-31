
# Aggregate Changes Tool | agg-chages

## Description
A utility script for aggregating individual `CHANGES-<ver>.md` files into a single, chronologically sorted `ALL_CHANGES--<startVer>-to--<endVer>.md` file. It supports merging updates into existing aggregate files or building fresh from source files.

> **Use Case: Maintaining Context for AI Assistants**
>
> If you're using an AI assistant (LLM) for development, you know they can lose track of project history between sessions. A helpful pattern is to have the AI log its changes to individual files like `CHANGES-1.5.90.md`.
>
> `agg-changes` makes this workflow viable by combining all those small files into one big `ALL_CHANGES--*.md` file. You can then easily feed this complete history back to the AI at the start of a new session, giving it the context it needs to understand the project's evolution and continue effectively.

## Installation

This utility is part of the `mcp-terminal-server` project. After cloning the main project repository and running `npm install`, the `agg-changes` command should be available in your environment (you might need to use `npx agg-changes` or ensure `node_modules/.bin` is in your PATH).

Alternatively, you can run it directly using `node ./path/to/agg-changes.js [options]`.

## Usage

```bash
agg-changes [options]
# or
npx agg-changes [options]
# or
node ./agg-changes.js [options]
```

## Modes of Operation

1.  **Merge/Update Mode (Default):**
    *   Finds the latest existing `ALL_CHANGES--*.md` file in the target directory (`-d`).
    *   Parses its content.
    *   Scans the target directory for individual `CHANGES-*.md` files.
    *   Adds new versions from individual files and updates existing versions found in the base file.
    *   **Crucially, entries from the base aggregate file for which no corresponding individual `CHANGES-*.md` file is found are preserved.**
    *   Filters the result based on `--sv` / `--ev` if provided.
    *   Writes the final sorted content to a new `ALL_CHANGES--<min>-to--<max>.md` file, named according to the actual minimum and maximum versions included in the output. This **overwrites** any existing file with the *exact same output filename*.

2.  **Build-from-Files Mode (`-b` / `--build-from-files`):**
    *   Ignores *all* existing `ALL_CHANGES--*.md` files.
    *   Builds the content *only* from the individual `CHANGES-*.md` files found in the target directory.
    *   Filters the result based on `--sv` / `--ev` if provided.
    *   Writes the final sorted content to `ALL_CHANGES--<min>-to--<max>.md`.
    *   **If a file with the exact target name already exists, it appends `-copy-#`** (e.g., `ALL_CHANGES--1.0.0-to--1.5.0-copy-1.md`) to avoid overwriting.

## Options

*   `-h, --help`: Show the help message.
*   `--version`: Show the version number of the *parent package* (`mcp-terminal-server`), **not** the version range of the aggregated files.
*   `-d <path>, --directory <path>`: Specify the directory where individual `CHANGES-*.md` files are located AND where the output `ALL_CHANGES--*.md` file will be written. (Default: `./CHANGES`)
*   `--sv <version>, --start-version <version>`: Filter the output to include only versions greater than or equal to `<version>`.
*   `--ev <version>, --end-version <version>`: Filter the output to include only versions less than or equal to `<version>`.
*   `-b, --build-from-files`: Activate "Build-from-Files" mode (see above).
*   `--dr, --dry-run`: Perform all steps except writing the output file. Shows a summary of what would be done.

## File Naming Conventions

*   **Input (Individual):** Files must be named `CHANGES-<ver>.md` (e.g., `CHANGES-1.5.90.md`, `CHANGES-2.0.0-beta.1.md`) and placed in the directory specified by `-d`. The `<ver>` part should be compatible with standard semantic versioning for correct sorting.
*   **Output (Aggregated):** The script generates filenames like `ALL_CHANGES--<startVer>-to--<endVer>.md`, where `<startVer>` and `<endVer>` are the actual lowest and highest version numbers included in that specific output file after any filtering. This file is written to the directory specified by `-d`.

## Examples

```bash
# Update latest aggregate in ./CHANGES/ with any new individual files
agg-changes

# Update latest aggregate in a specific directory
agg-changes -d /path/to/my/changes

# Build a new aggregate from scratch using only files in ./CHANGES/
agg-changes -b

# Build a new aggregate for a specific version range (e.g., v1.x)
agg-changes -b --sv 1.0.0 --ev 1.999.999

# Update the latest aggregate, but only include v2.0.0 onwards
agg-changes --sv 2.0.0

# See what would happen without writing the file
agg-changes --dr
```

## Testing

A test suite is available. Run it from the project root directory:

```bash
node test-agg-changes.js
```

## License

Refer to the main `LICENSE.md` file for the project.
