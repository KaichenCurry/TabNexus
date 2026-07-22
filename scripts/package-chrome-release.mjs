#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const output = resolve(root, "artifacts", "release", `TabNexus-Chrome-v${packageJson.version}.zip`);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date("2026-07-22T00:00:00.000Z")) {
  return {
    date: ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2)
  };
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  const stamp = dosDateTime();
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

async function collectFiles(directory) {
  const entries = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, item.name);
    if (item.isDirectory()) entries.push(...await collectFiles(absolute));
    else if (!item.name.endsWith(".map")) {
      const name = relative(dist, absolute);
      const data = await readFile(absolute);
      entries.push({
        name,
        data: item.name.endsWith(".js")
          ? data.toString("utf8").replace(/\n?\/\/# sourceMappingURL=.*$/u, "")
          : data
      });
    }
  }
  return entries;
}

const instructions = `TabNexus Chrome 扩展｜两分钟安装\n\n1. 解压这个 ZIP。\n2. Chrome 打开 chrome://extensions，并开启“开发者模式”。\n3. 点击“加载已解压的扩展程序”，选择当前文件夹。\n4. 固定 TabNexus 图标并点击。\n\nEnglish: unzip, open chrome://extensions, enable Developer mode, choose Load unpacked, and select this folder.\n`;
const entries = await collectFiles(dist);
entries.push({ name: "INSTALL.txt", data: instructions });
entries.sort((left, right) => left.name.localeCompare(right.name));

if (!entries.some(({ name }) => name === "manifest.json")) throw new Error("Portable package is missing manifest.json");
for (const entry of entries) {
  const content = Buffer.isBuffer(entry.data) ? entry.data.toString("utf8") : String(entry.data);
  if (content.includes(root) || content.includes("<ABSOLUTE_PATH_TO_TABNEXUS>")) {
    throw new Error(`Portable package leaks a development path in ${entry.name}`);
  }
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, createStoredZip(entries));
console.log(`Built ${relative(root, output)} (${entries.length} files)`);
