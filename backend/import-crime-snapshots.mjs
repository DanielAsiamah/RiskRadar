import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TARGET_ROOT = path.join(process.cwd(), 'backend', 'data', 'police');
const MONTH_PATTERN = /\b(\d{4}-\d{2})\b/;

function normalizeMonth(month) {
  const value = String(month || '').trim();
  return /^\d{4}-\d{2}$/.test(value) ? value : '';
}

function usage() {
  console.log(`Usage:
  node backend/import-crime-snapshots.mjs --source <folder> [--target <folder>] [--clean]

Examples:
  node backend/import-crime-snapshots.mjs --source C:\\crime-downloads\\2026-05
  node backend/import-crime-snapshots.mjs --source C:\\crime-downloads --target C:\\crime-data-uk --clean`);
}

function parseArguments(argv) {
  const options = {
    source: String(process.env.RISKRADAR_IMPORT_SOURCE || '').trim(),
    target: String(process.env.CRIME_DATA_ROOT || process.env.RISKRADAR_IMPORT_TARGET || DEFAULT_TARGET_ROOT).trim(),
    clean: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--source') {
      options.source = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (argument === '--target') {
      options.target = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (argument === '--clean') {
      options.clean = true;
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
  }

  return options;
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function walkFiles(rootDirectory) {
  const discovered = [];
  const stack = [rootDirectory];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }

      if (entry.isFile()) {
        discovered.push(nextPath);
      }
    }
  }

  return discovered;
}

function findStreetCsvFiles(sourceRoot) {
  return walkFiles(sourceRoot)
    .filter((filePath) => /\.csv$/i.test(filePath))
    .map((filePath) => {
      const monthMatch = filePath.match(MONTH_PATTERN);
      const month = normalizeMonth(monthMatch?.[1] || '');
      return {
        filePath,
        fileName: path.basename(filePath),
        month,
      };
    })
    .filter((entry) => entry.month && /street/i.test(entry.fileName));
}

function cleanTargetDirectory(targetRoot) {
  if (!fs.existsSync(targetRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(targetRoot, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') {
      continue;
    }

    fs.rmSync(path.join(targetRoot, entry.name), { recursive: true, force: true });
  }
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-');
}

function buildManifest(entries, targetRoot) {
  const importedAt = new Date().toISOString();
  const byMonth = new Map();

  for (const entry of entries) {
    const monthEntries = byMonth.get(entry.month) || [];
    monthEntries.push({
      sourceFile: entry.sourceFile,
      importedFile: entry.importedFile,
      byteSize: entry.byteSize,
    });
    byMonth.set(entry.month, monthEntries);
  }

  return {
    importedAt,
    targetRoot,
    monthCount: byMonth.size,
    fileCount: entries.length,
    months: [...byMonth.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([month, files]) => ({
        month,
        fileCount: files.length,
        files,
      })),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    usage();
    return;
  }

  if (!options.source) {
    usage();
    throw new Error('A source folder is required. Pass --source <folder>.');
  }

  const sourceRoot = path.resolve(options.source);
  const targetRoot = path.resolve(options.target || DEFAULT_TARGET_ROOT);

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Source folder does not exist: ${sourceRoot}`);
  }

  const discoveredFiles = findStreetCsvFiles(sourceRoot);
  if (!discoveredFiles.length) {
    throw new Error(`No street-level crime CSV files with YYYY-MM in the path were found under ${sourceRoot}.`);
  }

  ensureDirectory(targetRoot);

  if (options.clean) {
    cleanTargetDirectory(targetRoot);
  }

  const imported = [];

  for (const file of discoveredFiles) {
    const monthDirectory = path.join(targetRoot, file.month);
    ensureDirectory(monthDirectory);

    const targetFileName = sanitizeFileName(file.fileName);
    const targetFilePath = path.join(monthDirectory, targetFileName);
    fs.copyFileSync(file.filePath, targetFilePath);

    imported.push({
      month: file.month,
      sourceFile: file.filePath,
      importedFile: targetFilePath,
      byteSize: fs.statSync(targetFilePath).size,
    });
  }

  const manifest = buildManifest(imported, targetRoot);
  const manifestPath = path.join(targetRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceRoot,
        targetRoot,
        clean: options.clean,
        importedFiles: imported.length,
        months: manifest.months.map((month) => ({
          month: month.month,
          fileCount: month.fileCount,
        })),
        manifestPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message || String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
