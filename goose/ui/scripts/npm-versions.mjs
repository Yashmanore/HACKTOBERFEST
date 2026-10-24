import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const uiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(uiDirectory, "..");
const wrapperPath = resolve(uiDirectory, "mayhem-acp/package.json");
const binaryPlatforms = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-x64",
];
const binaryPackages = binaryPlatforms.map(
  (platform) => `@aaif/mayhem-binary-${platform}`,
);
const packagePaths = [
  resolve(uiDirectory, "mayhem-acp-client/package.json"),
  wrapperPath,
  ...binaryPlatforms.map((platform) =>
    resolve(uiDirectory, `mayhem-binary/mayhem-binary-${platform}/package.json`),
  ),
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readCargoVersion() {
  const cargoToml = readFileSync(resolve(repositoryRoot, "Cargo.toml"), "utf8");
  const workspacePackage = cargoToml.match(
    /\[workspace\.package\]([\s\S]*?)(?:\n\[|$)/,
  )?.[1];
  const version = workspacePackage?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

  if (!version) {
    throw new Error("Could not read workspace.package.version from Cargo.toml");
  }

  return version;
}

function setVersions(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid version: ${version}`);
  }

  for (const path of packagePaths) {
    const manifest = readJson(path);
    manifest.version = version;
    writeJson(path, manifest);
  }

  console.log(`Updated Mayhem npm packages to ${version}`);
}

function checkVersions() {
  const expectedVersion = readCargoVersion();
  const errors = [];
  const desktop = readJson(resolve(uiDirectory, "desktop/package.json"));

  if (desktop.version !== expectedVersion) {
    errors.push(
      `mayhem-app is ${desktop.version}; expected ${expectedVersion} from Cargo.toml`,
    );
  }

  for (const path of packagePaths) {
    const manifest = readJson(path);
    if (manifest.version !== expectedVersion) {
      errors.push(
        `${manifest.name} is ${manifest.version}; expected ${expectedVersion}`,
      );
    }
  }

  const wrapper = readJson(wrapperPath);
  for (const packageName of binaryPackages) {
    const expectedSpecifier = "workspace:*";
    const actualSpecifier = wrapper.optionalDependencies?.[packageName];
    if (actualSpecifier !== expectedSpecifier) {
      errors.push(
        `${packageName} uses ${actualSpecifier ?? "no specifier"}; expected ${expectedSpecifier}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Mayhem version alignment failed:\n- ${errors.join("\n- ")}`,
    );
  }

  console.log(`Mayhem versions are aligned at ${expectedVersion}`);
  return expectedVersion;
}

function checkReleaseVersion(version) {
  const expectedVersion = checkVersions();
  if (version !== expectedVersion) {
    throw new Error(
      `Release is ${version}; expected ${expectedVersion} from Cargo.toml`,
    );
  }

  console.log(`Mayhem versions match release ${version}`);
}

function checkPackedWrapper(path) {
  const expectedVersion = readCargoVersion();
  const wrapper = readJson(resolve(path));
  const errors = [];

  for (const packageName of binaryPackages) {
    const actualSpecifier = wrapper.optionalDependencies?.[packageName];
    if (actualSpecifier !== expectedVersion) {
      errors.push(
        `${packageName} uses ${actualSpecifier ?? "no specifier"}; expected ${expectedVersion}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Packed Mayhem wrapper version check failed:\n- ${errors.join("\n- ")}`,
    );
  }

  console.log(`Packed Mayhem wrapper uses binary version ${expectedVersion}`);
}

const [command, argument] = process.argv.slice(2);

try {
  if (command === "set" && argument) {
    setVersions(argument);
  } else if (command === "check" && !argument) {
    checkVersions();
  } else if (command === "check-release" && argument) {
    checkReleaseVersion(argument);
  } else if (command === "check-packed-wrapper" && argument) {
    checkPackedWrapper(argument);
  } else {
    throw new Error(
      "Usage: node ui/scripts/npm-versions.mjs <set VERSION|check|check-release VERSION|check-packed-wrapper PATH>",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
