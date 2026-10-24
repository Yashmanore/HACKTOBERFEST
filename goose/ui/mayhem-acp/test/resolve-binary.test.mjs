import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { isAbsolute, join, relative, resolve } from "node:path";

import * as publicApi from "../dist/index.js";
import { resolveMayhemBinaryForRuntime } from "../dist/resolve-binary.js";

const supportedPlatforms = [
  ["darwin", "arm64", "@aaif/mayhem-binary-darwin-arm64", "mayhem"],
  ["darwin", "x64", "@aaif/mayhem-binary-darwin-x64", "mayhem"],
  ["linux", "arm64", "@aaif/mayhem-binary-linux-arm64", "mayhem"],
  ["linux", "x64", "@aaif/mayhem-binary-linux-x64", "mayhem"],
  ["win32", "x64", "@aaif/mayhem-binary-win32-x64", "mayhem.exe"],
];

function setMayhemBinary(t, value) {
  const original = process.env.MAYHEM_BINARY;
  process.env.MAYHEM_BINARY = value;
  t.after(() => {
    if (original === undefined) {
      delete process.env.MAYHEM_BINARY;
    } else {
      process.env.MAYHEM_BINARY = original;
    }
  });
}

for (const [
  platform,
  arch,
  packageName,
  executableName,
] of supportedPlatforms) {
  test(`resolves ${platform}-${arch}`, () => {
    let resolvedSpecifier;
    let checkedPath;
    const fixturePackageRoot = join("/fixtures", packageName);

    const result = resolveMayhemBinaryForRuntime(platform, arch, {
      resolvePackageJson(specifier) {
        resolvedSpecifier = specifier;
        return join(fixturePackageRoot, "package.json");
      },
      isFile(path) {
        checkedPath = path;
        return true;
      },
    });

    assert.equal(resolvedSpecifier, `${packageName}/package.json`);
    assert.equal(result, resolve(fixturePackageRoot, "bin", executableName));
    assert.equal(checkedPath, result);
    assert.equal(isAbsolute(result), true);
  });
}

test("exports only the public resolver from the package root", () => {
  assert.deepEqual(Object.keys(publicApi), ["resolveMayhemBinary"]);
});

test("uses MAYHEM_BINARY as an explicit override", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mayhem-acp-override-"));
  const binaryPath = join(directory, "mayhem");
  writeFileSync(binaryPath, "");
  setMayhemBinary(t, relative(process.cwd(), binaryPath));

  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  assert.equal(publicApi.resolveMayhemBinary(), binaryPath);
});

test("rejects an invalid MAYHEM_BINARY override", (t) => {
  setMayhemBinary(t, "missing-mayhem-binary");

  assert.throws(
    () => publicApi.resolveMayhemBinary(),
    /MAYHEM_BINARY does not point to a file/,
  );
});

test("reports unsupported platform and architecture combinations", () => {
  assert.throws(
    () =>
      resolveMayhemBinaryForRuntime("freebsd", "x64", {
        resolvePackageJson() {
          throw new Error("should not resolve a package");
        },
        isFile() {
          return false;
        },
      }),
    /No Mayhem npm binary is available for freebsd-x64/,
  );
});

test("reports a missing optional platform package", () => {
  assert.throws(
    () =>
      resolveMayhemBinaryForRuntime("linux", "x64", {
        resolvePackageJson() {
          throw new Error("module not found");
        },
        isFile() {
          return false;
        },
      }),
    /Mayhem binary package @aaif\/mayhem-binary-linux-x64 is not installed/,
  );
});

test("reports a missing executable in an installed platform package", () => {
  assert.throws(
    () =>
      resolveMayhemBinaryForRuntime("darwin", "arm64", {
        resolvePackageJson() {
          return join(
            "/fixtures",
            "@aaif/mayhem-binary-darwin-arm64/package.json",
          );
        },
        isFile() {
          return false;
        },
      }),
    /Mayhem executable from @aaif\/mayhem-binary-darwin-arm64 was not found/,
  );
});
