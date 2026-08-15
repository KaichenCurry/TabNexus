#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.log("Skipping the Codex installer: this release asset is built on macOS.");
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = packageJson.version;
const outputDirectory = resolve(root, "artifacts", "release");
const output = resolve(outputDirectory, `TabNexus-Codex-Setup-v${version}.dmg`);
const checksumOutput = `${output}.sha256`;
const stagingDirectory = await mkdtemp(join(tmpdir(), "tabnexus-codex-installer-"));
const appDirectory = resolve(stagingDirectory, "TabNexus Codex Setup.app");
const contentsDirectory = resolve(appDirectory, "Contents");
const resourcesDirectory = resolve(contentsDirectory, "Resources");
const macOSDirectory = resolve(contentsDirectory, "MacOS");
const iconsetDirectory = resolve(stagingDirectory, "TabNexus.iconset");
const executable = resolve(macOSDirectory, "TabNexusCodexSetup");
const armExecutable = resolve(stagingDirectory, "TabNexusCodexSetup-arm64");
const intelExecutable = resolve(stagingDirectory, "TabNexusCodexSetup-x86_64");
const volumeDirectory = resolve(stagingDirectory, "volume");
const volumeApp = resolve(volumeDirectory, "TabNexus Codex Setup.app");

async function run(command, args, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) resolvePromise({ code, stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

function plist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
  <key>CFBundleDisplayName</key><string>TabNexus Codex Setup</string>
  <key>CFBundleExecutable</key><string>TabNexusCodexSetup</string>
  <key>CFBundleIconFile</key><string>TabNexus</string>
  <key>CFBundleIdentifier</key><string>com.kaichencurry.tabnexus.codex-setup</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>TabNexus Codex Setup</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
}

async function createIcon() {
  const source = resolve(root, "extension", "public", "icons", "icon128.png");
  await mkdir(iconsetDirectory, { recursive: true });
  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"]
  ];
  for (const [size, filename] of sizes) {
    await run("sips", ["-z", String(size), String(size), source, "--out", resolve(iconsetDirectory, filename)]);
  }
  await run("iconutil", ["-c", "icns", iconsetDirectory, "-o", resolve(resourcesDirectory, "TabNexus.icns")]);
}

try {
  await mkdir(macOSDirectory, { recursive: true });
  await mkdir(resourcesDirectory, { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(contentsDirectory, "Info.plist"), plist());
  await createIcon();
  const swiftSource = resolve(root, "installer", "macos", "TabNexusCodexInstaller.swift");
  for (const [target, destination] of [
    ["arm64-apple-macos13.0", armExecutable],
    ["x86_64-apple-macos13.0", intelExecutable]
  ]) {
    await run("xcrun", [
      "swiftc",
      "-O",
      "-target",
      target,
      "-framework",
      "AppKit",
      swiftSource,
      "-o",
      destination
    ]);
  }
  await run("lipo", ["-create", armExecutable, intelExecutable, "-output", executable]);

  const signingIdentity = process.env.TABNEXUS_CODESIGN_IDENTITY?.trim();
  if (signingIdentity) {
    await run("codesign", ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", signingIdentity, appDirectory]);
  } else {
    await run("codesign", ["--force", "--deep", "--sign", "-", appDirectory]);
    console.warn("Built with ad-hoc signing. Set TABNEXUS_CODESIGN_IDENTITY for a public release.");
  }

  await mkdir(volumeDirectory, { recursive: true });
  await run("ditto", [appDirectory, volumeApp]);
  await rm(output, { force: true });
  await run("hdiutil", [
    "create",
    "-volname",
    "TabNexus Codex Setup",
    "-srcfolder",
    volumeDirectory,
    "-ov",
    "-format",
    "UDZO",
    output
  ]);

  const notaryProfile = process.env.TABNEXUS_NOTARY_PROFILE?.trim();
  if (notaryProfile) {
    await run("xcrun", ["notarytool", "submit", output, "--keychain-profile", notaryProfile, "--wait"]);
    await run("xcrun", ["stapler", "staple", output]);
  }

  const checksum = (await run("shasum", ["-a", "256", output])).stdout.trim();
  await writeFile(checksumOutput, `${checksum}\n`);
  console.log(`Built ${relative(root, output)}`);
  console.log(`Built ${relative(root, checksumOutput)}`);
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
