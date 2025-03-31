#!/usr/bin/env node

// --- ADD DEBUG ---
// console.log(">>> Raw process.argv:", JSON.stringify(process.argv));
// ---------------

import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import semver from 'semver';

// --- Constants ---
const SOURCE_DIR_DEFAULT = './CHANGES'; // Default input/output dir for CHANGES files
const INDIVIDUAL_FILE_PREFIX = 'CHANGES-';
const INDIVIDUAL_FILE_SUFFIX = '.md';
const AGGREGATED_FILE_PREFIX = 'ALL_CHANGES--';
const AGGREGATED_FILE_SEPARATOR = '-to--';
const AGGREGATED_FILE_SUFFIX = '.md';
// Output directory for aggregated file now defaults to the source dir
const FILE_ENCODING = 'utf-8';
const HEADER_TEMPLATE = '# CHANGES-{ver}.md'; // {ver} will be replaced
const ENTRY_SEPARATOR = '\n---\n'; // Separator between entries in aggregated file

// --- Argument Parsing ---
const argsToParse = hideBin(process.argv); // Get args after node/script path
// --- ADD DEBUG ---
//console.log(">>> Args passed to yargs:", JSON.stringify(argsToParse));
// ---------------
const argv = yargs(argsToParse) // Pass the prepared args
    .usage('Usage: $0 [options]')
    .option('d', {
        alias: 'directory',
        describe: `Directory for individual and aggregated CHANGES files (input/output)`, // Clarified description
        type: 'string',
        default: SOURCE_DIR_DEFAULT,
    })
    .option('sv', {
        alias: 'start-version',
        describe: 'Minimum version (inclusive) to include in the output',
        type: 'string',
    })
    .option('ev', {
        alias: 'end-version',
        describe: 'Maximum version (inclusive) to include in the output',
        type: 'string',
    })
    .option('b', {
        alias: 'build-from-files',
        describe: 'Ignore existing aggregated files and build fresh only from individual files found',
        type: 'boolean',
        default: false,
    })
    .option('dr', {
        alias: 'dry-run',
        describe: 'Show what would be done without writing any files',
        type: 'boolean',
        default: false,
    })
    .help('h')
    .alias('h', 'help')
    .strict() // Report errors for unknown options
    .wrap(yargs().terminalWidth()) // Adjust help message width
    .argv;

// --- Helper Functions ---

/**
 * Finds the path to the latest aggregated changes file in the specified directory. // Updated doc
 * @param {string} dir - The directory to search.
 * @returns {Promise<string|null>} Path to the latest file or null if none found.
 */
async function findLatestAggregatedFile(dir) {
    let latestFile = null;
    let latestVersion = null;

    try {
        const files = await fs.readdir(dir);
        const aggFiles = files.filter(f =>
            f.startsWith(AGGREGATED_FILE_PREFIX) && f.endsWith(AGGREGATED_FILE_SUFFIX)
        );

        for (const file of aggFiles) {
            // --- Use a Stricter Regex for the End Version ---
            // This regex ensures the end version part only contains typical version characters
            // (digits, dots, hyphens for pre-releases, letters for pre-releases/build)
            // It will NOT match if '-BACKUP-' or '-copy-' is part of the version string.
            const match = file.match(new RegExp(
                `^${AGGREGATED_FILE_PREFIX}(.+)${AGGREGATED_FILE_SEPARATOR}([0-9a-zA-Z.-]+)${AGGREGATED_FILE_SUFFIX}$`
            ));
            // --- End of Regex Change ---

            if (match && match[2]) { // Now only matches files with valid-looking end versions
                const endVersionStr = match[2];
                // Coercion might still be useful if the version is slightly non-standard but valid chars
                const currentSemVer = semver.coerce(endVersionStr);
                if (currentSemVer) {
                     if (!latestVersion || semver.gt(currentSemVer, latestVersion)) {
                        latestVersion = currentSemVer;
                        latestFile = path.join(dir, file);
                    } else if (semver.eq(currentSemVer, latestVersion)) {
                        // Handle cases where versions are equal (e.g., 1.0.0 and 1.0.0-beta)
                        // Prefer the release version over pre-release if coerced versions match.
                        // A simple heuristic: shorter original string is likely the release version.
                        const existingEndVersionStr = latestFile ? latestFile.match(new RegExp(`${AGGREGATED_FILE_SEPARATOR}([0-9a-zA-Z.-]+)${AGGREGATED_FILE_SUFFIX}$`))[1] : '';
                        if (endVersionStr.length < existingEndVersionStr.length) {
                             latestVersion = currentSemVer; // Keep existing latestVersion object
                             latestFile = path.join(dir, file); // Update to the shorter-named file
                        }
                        // Add more sophisticated tie-breaking if needed (e.g., check semver.prerelease)
                    }
                } else {
                     console.warn(`[WARN] Could not coerce end version from potential aggregated file: ${file}`);
                }
            }
            // Files like *-BACKUP-*.md or *-copy-*.md will simply not match the stricter regex
        }
    } catch (err) {
        if (err.code === 'ENOENT') {
             console.log(`[INFO] Directory ${dir} not found while searching for base aggregated file.`);
        } else {
            console.error(`[ERROR] Failed to read directory ${dir} while searching for base aggregated file:`, err);
        }
    }
    return latestFile;
}

/**
 * Parses an aggregated file into a map of version strings to content blocks.
 * @param {string} filePath - Path to the aggregated file.
 * @returns {Promise<Map<string, string>>} Map of version to content.
 */
async function parseAggregatedFile(filePath) { // No change needed here
    const versionMap = new Map();
    if (!filePath) return versionMap;

    try {
        const content = await fs.readFile(filePath, FILE_ENCODING);
        // Split carefully, handling potential variations in line endings around separator
        const entries = content.split(new RegExp(`\\s*${ENTRY_SEPARATOR.trim()}\\s*`, 'g'));

        let currentVersion = null;
        let currentContentList = []; // Collect lines for current version

        for (const entry of entries) {
            if (!entry.trim()) continue; // Skip empty parts

            const headerMatch = entry.match(/^\s*#\s*CHANGES-(.+)\.md\s*/); // Find header
             if (headerMatch && headerMatch[1]) {
                 // If we were tracking a previous version, save it
                 if (currentVersion) {
                     versionMap.set(currentVersion, currentContentList.join('\n').trim());
                 }
                 // Start tracking the new version
                 currentVersion = headerMatch[1].trim();
                 // Get content *after* the header line
                 currentContentList = [entry.substring(headerMatch[0].length).trimStart()];
             } else if (currentVersion) {
                 // If it's not a new header, append to the current content list
                 currentContentList.push(entry);
             }
             // Ignore content before the first header
        }
        // Save the last entry
        if (currentVersion) {
            versionMap.set(currentVersion, currentContentList.join('\n').trim());
        }

    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`[INFO] Base aggregated file ${filePath} not found, starting fresh.`);
        } else {
            console.error(`[ERROR] Failed to read or parse base aggregated file ${filePath}:`, err);
        }
        // Return empty map on error or if file not found
        return new Map();
    }
    return versionMap;
}


/**
 * Finds individual CHANGES-<ver>.md files in a directory.
 * @param {string} dir - The directory to search.
 * @returns {Promise<string[]>} Array of full paths to matching files.
 */
async function findIndividualFiles(dir) { // No change needed here
    try {
        const files = await fs.readdir(dir);
        return files
            .filter(f => f.startsWith(INDIVIDUAL_FILE_PREFIX) && f.endsWith(INDIVIDUAL_FILE_SUFFIX))
            .map(f => path.join(dir, f));
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`[ERROR] Source directory not found: ${dir}`);
        } else {
            console.error(`[ERROR] Failed to read source directory ${dir}:`, err);
        }
        return []; // Return empty array on error
    }
}

/**
 * Extracts the version string from an individual changes filename.
 * @param {string} filename - The filename (e.g., CHANGES-1.2.3.md).
 * @returns {string|null} The version string or null if not matched.
 */
function extractVersion(filename) { // No change needed here
    const baseName = path.basename(filename);
    const match = baseName.match(new RegExp(`^${INDIVIDUAL_FILE_PREFIX}(.+)${INDIVIDUAL_FILE_SUFFIX}$`));
    return match ? match[1] : null;
}

/**
 * Checks if a filename needs the -copy-# suffix and finds the next available one within the target directory. // Updated doc
 * @param {string} dir - The target directory where the file will be written. // Added param
 * @param {string} baseFilename - The desired base filename (e.g., ALL_CHANGES--1-to-2.md).
 * @returns {Promise<string>} The unique filename (basename only) to use. // Returns basename
 */
async function findUniqueFilename(dir, baseFilename) { // Added dir param
    let counter = 1;
    let targetBasename = baseFilename;
    const ext = AGGREGATED_FILE_SUFFIX;
    const base = baseFilename.slice(0, -ext.length);

    while (true) {
        const targetPath = path.join(dir, targetBasename); // Check within target dir
        try {
            await fs.access(targetPath, fs.constants.F_OK);
            // File exists, try next copy number
            targetBasename = `${base}-copy-${counter}${ext}`;
            counter++;
        } catch (err) {
            if (err.code === 'ENOENT') {
                // File does not exist, this is our unique name
                return targetBasename; // Return the basename
            } else {
                // Other error accessing file
                console.error(`[ERROR] Could not check existence of ${targetPath}:`, err);
                // Fallback to base name, hoping for the best or letting writeFile fail
                return baseFilename;
            }
        }
    }
}

// --- Main Logic ---
async function main() {
    // We correctly resolve the path here using path.resolve() on the parsed argv.directory
    const targetDir = path.resolve(argv.directory); // Use resolved absolute path for target directory
    console.log(`[INFO] Target directory (Input/Output): ${targetDir}`);
    console.log('[INFO] Starting changes aggregation...');

     // Ensure target directory exists before writing
     try {
        await fs.mkdir(targetDir, { recursive: true });
    } catch (err) {
        console.error(`[ERROR] Could not create target directory ${targetDir}:`, err);
        process.exit(1);
    }


    if (argv.dryRun) {
        console.log('[INFO] Dry Run Mode: No files will be written.');
    }

    let versionMap = new Map();

    // 1. Determine base map (unless -b is specified)
    if (!argv.buildFromFiles) {
        const latestAggFile = await findLatestAggregatedFile(targetDir); // Search in targetDir
        if (latestAggFile) {
            console.log(`[INFO] Using base aggregated file: ${latestAggFile}`);
            versionMap = await parseAggregatedFile(latestAggFile);
            console.log(`[INFO] Parsed ${versionMap.size} entries from base file.`);
        } else {
            console.log('[INFO] No existing aggregated file found in target directory.');
        }
    } else {
        console.log('[INFO] Build-from-files mode (-b): Ignoring existing aggregated files.');
    }

    // 2. Scan directory for individual files
    const individualFiles = await findIndividualFiles(targetDir); // Scan targetDir
    if (individualFiles.length === 0 && versionMap.size === 0) {
        console.log(`[INFO] No individual files found in ${targetDir} and no base map loaded. Nothing to do.`);
        return;
    }
    console.log(`[INFO] Found ${individualFiles.length} individual files in ${targetDir}.`);


    // 3. Update map with individual file contents
    let readCount = 0;
    for (const file of individualFiles) {
        const version = extractVersion(file);
        if (!version) {
            console.warn(`[WARN] Could not extract version from: ${file}`);
            continue;
        }
        try {
            const content = await fs.readFile(file, FILE_ENCODING);
            versionMap.set(version, content.trim());
            readCount++;
        } catch (err) {
            console.error(`[ERROR] Failed to read individual file ${file}:`, err);
        }
    }
    console.log(`[INFO] Read and updated/added ${readCount} entries from individual files.`);
    console.log(`[INFO] Total entries in map before filtering: ${versionMap.size}`);

    // 4. Filter map based on --sv / --ev
    let filteredMap = versionMap;
    let rangeString = '';
    if (argv.startVersion) rangeString += `>=${argv.startVersion} `;
    if (argv.endVersion) rangeString += `<=${argv.endVersion}`;
    rangeString = rangeString.trim();

    if (rangeString) {
        console.log(`[INFO] Filtering versions by range: "${rangeString}"`);
        filteredMap = new Map();
        for (const [version, content] of versionMap.entries()) {
            const sv = semver.coerce(version); // Allow flexible version strings
            if (sv && semver.satisfies(sv, rangeString, { includePrerelease: true })) {
                filteredMap.set(version, content);
            }
        }
        console.log(`[INFO] Entries remaining after filtering: ${filteredMap.size}`);
    }

    // 5. Check if map is empty
    if (filteredMap.size === 0) {
        console.log('[INFO] No versions remaining after filtering (or none found initially). No output file will be generated.');
        return;
    }

    // 6. Sort versions
    const sortedVersions = Array.from(filteredMap.keys()).sort((a, b) => {
        // Use coerce to handle potentially non-standard versions for comparison
        const svA = semver.coerce(a);
        const svB = semver.coerce(b);
        if (svA && svB) return semver.compare(svA, svB);
        if (svA && !svB) return -1; // Treat valid semver as less than invalid
        if (!svA && svB) return 1;  // Treat invalid semver as greater than valid
        // Fallback basic string compare if coerce fails on both
        return a.localeCompare(b);
    });

    // 7. Determine final range and generate output content
    const finalMinVer = sortedVersions[0];
    const finalMaxVer = sortedVersions[sortedVersions.length - 1];
    let outputContent = '';

    for (let i = 0; i < sortedVersions.length; i++) {
        const version = sortedVersions[i];
        const content = filteredMap.get(version);
        const header = HEADER_TEMPLATE.replace('{ver}', version);
        outputContent += `${header}\n\n${content}`;
        if (i < sortedVersions.length - 1) {
            outputContent += ENTRY_SEPARATOR;
        }
    }

    // 8. Determine output filename (basename only first)
    const baseOutputBasename = `${AGGREGATED_FILE_PREFIX}${finalMinVer}${AGGREGATED_FILE_SEPARATOR}${finalMaxVer}${AGGREGATED_FILE_SUFFIX}`;

    let targetBasename = baseOutputBasename;
    if (argv.buildFromFiles) {
        // Check for existing file only in -b mode to add -copy-#
        targetBasename = await findUniqueFilename(targetDir, baseOutputBasename); // Pass targetDir
    }

    // 9. Construct final target path
    const targetFilename = path.join(targetDir, targetBasename); // Use targetDir

    // 10. Write output (or show dry run info)
    console.log('--- Aggregation Summary ---');
    console.log(`Source/Output Directory: ${targetDir}`); // Unified directory
    console.log(`Build Mode: ${argv.buildFromFiles ? 'Build From Files (-b)' : 'Merge/Update (Default)'}`);
    if (rangeString) console.log(`Version Filter: ${rangeString}`);
    console.log(`Versions Included: ${sortedVersions.length} (Range: ${finalMinVer} to ${finalMaxVer})`);
    console.log(`Output File: ${targetFilename}`); // Show final resolved path
    console.log('--------------------------');


    if (argv.dryRun) {
        console.log('[INFO] Dry Run complete. No file written.');
    } else {
        try {
            // Ensure target directory exists again just before writing (in case it was deleted)
            await fs.mkdir(targetDir, { recursive: true });
            await fs.writeFile(targetFilename, outputContent, { encoding: FILE_ENCODING });
            console.log(`[SUCCESS] Successfully wrote aggregated changes to ${targetFilename}`);
        } catch (err) {
            console.error(`[ERROR] Failed to write output file ${targetFilename}:`, err);
        }
    }
}

// --- Execute Main ---
main().catch(err => {
    process.exit(1); // Exit with error code on fatal error
    console.error("[FATAL] An unexpected error occurred:", err); // Log after exit code set
});