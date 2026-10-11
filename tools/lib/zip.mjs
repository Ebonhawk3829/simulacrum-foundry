/**
 * Minimal ZIP reader/writer — no dependencies.
 *
 * Why hand-rolled: packaging a Foundry module needs a deflate-capable archive,
 * and the tools that provide one (`zip`, `unzip`) are not present on every
 * development machine. Node ships zlib, so the container format is the only
 * missing piece, and it is small enough to own outright. That also removes a
 * subprocess from the release path, which is what makes the packaging testable.
 *
 * Only what a module release requires is implemented:
 *   - deflate and store methods
 *   - UTF-8 names (flagged, so non-ASCII paths read correctly)
 *   - explicit directory entries, which is what released packages contain
 *   - the data descriptor (bit 3), used when a stream's size is not known up front
 *
 * Deliberately not implemented: Zip64. A module archive is a few megabytes; if
 * one ever exceeds the 4 GiB Zip64 threshold this throws rather than silently
 * writing a corrupt archive.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib';

/** Local file header signature: "PK\x03\x04" */
const LOCAL_SIG = 0x04034b50;
/** Central directory header signature: "PK\x01\x02" */
const CENTRAL_SIG = 0x02014b50;
/** End of central directory signature: "PK\x05\x06" */
const EOCD_SIG = 0x06054b50;
/** Data descriptor signature: "PK\x07\x08" */
const DATA_DESCRIPTOR_SIG = 0x08074b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** Bit 3: sizes and CRC follow the data instead of preceding it. */
const FLAG_DATA_DESCRIPTOR = 0x0008;
/** Bit 11: the name is UTF-8, not CP437. */
const FLAG_UTF8 = 0x0800;
/** Bit 1 for deflate: use the fastest algorithm rather than a tuned one. */
const FLAG_MAX_COMPRESSION = 0x0002;

const ZIP64_LIMIT = 0xffffffff;

/** CRC-32 table, built once. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

/**
 * CRC-32 of a buffer, as the ZIP format defines it.
 * @param {Buffer} buffer
 * @returns {number} Unsigned 32-bit checksum
 */
export function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Convert a JS Date to the packed MS-DOS date/time pair ZIP uses.
 * @param {Date} date
 * @returns {{time: number, date: number}}
 */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  // Seconds are stored in two-second units, so they are halved here.
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Normalise an entry name: forward slashes, no leading slash.
 * @param {string} name
 * @returns {string}
 */
function normaliseName(name) {
  return String(name).replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Build a ZIP archive in memory.
 *
 * Entry order is caller-controlled and preserved, so archives can be produced
 * deterministically by sorting the input: identical inputs then yield identical
 * bytes, which is what lets a test compare two builds.
 *
 * Compression is skipped for data that is already compressed or too small to
 * benefit, because deflating those makes the archive larger, not smaller.
 * @param {Array<{name: string, data: string|Buffer}>} entries
 * @param {object} [options]
 * @param {number} [options.mtime] - Fixed timestamp in ms, for reproducibility
 * @returns {Buffer} The complete archive
 */
/** Extensions that are already compressed, so deflating them only adds work. */
const PRESSURE_FREE = /\.(png|gif|jpg|jpeg|webp|zip|woff2?)$/i;

/**
 * Decide how to store one entry: deflate, or store as-is.
 *
 * Already-compressed formats gain nothing from deflate, and neither does a tiny
 * file, where the deflate header outweighs the saving. Fonts are NOT skipped:
 * TrueType compresses well and is a large part of a module archive.
 * @param {string} name
 * @param {number} size
 * @returns {{method: number, flags: number}}
 */
function chooseCompression(name, size) {
  const store = size < 128 || PRESSURE_FREE.test(name);
  return store
    ? { method: METHOD_STORE, flags: FLAG_DATA_DESCRIPTOR | FLAG_UTF8 }
    : {
        method: METHOD_DEFLATE,
        flags: FLAG_DATA_DESCRIPTOR | FLAG_UTF8 | FLAG_MAX_COMPRESSION,
      };
}

/**
 * Write a local file header.
 * @param {object} options
 * @returns {Buffer}
 */
function localHeader({ flags, method, stamp, checksum, compressedSize, size, nameLength }) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_SIG, 0);
  header.writeUInt16LE(20, 4); // version needed to extract: 2.0
  header.writeUInt16LE(flags, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(stamp.time, 10);
  header.writeUInt16LE(stamp.date, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameLength, 26);
  header.writeUInt16LE(0, 28); // extra field length
  return header;
}

/**
 * Write a central directory header.
 * @param {object} options
 * @returns {Buffer}
 */
function centralHeader(options) {
  const { flags, method, stamp, checksum, compressedSize, size, nameLength, offset } = options;

  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_SIG, 0);
  header.writeUInt16LE(20, 4); // version made by
  header.writeUInt16LE(20, 6); // version needed to extract
  header.writeUInt16LE(flags, 8);
  header.writeUInt16LE(method, 10);
  header.writeUInt16LE(stamp.time, 12);
  header.writeUInt16LE(stamp.date, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(nameLength, 28);
  header.writeUInt16LE(0, 30); // extra field length
  header.writeUInt16LE(0, 32); // comment length
  header.writeUInt16LE(0, 34); // disk number start
  header.writeUInt16LE(0, 36); // internal attributes
  // External attributes: unix mode in the high 16 bits, so tools that honour
  // permissions extract a usable tree.
  header.writeUInt32LE((options.isDirectory ? 0o40755 : 0o100644) * 0x10000, 38);
  header.writeUInt32LE(offset, 42);
  return header;
}

/**
 * Encode one entry: its payload, and the three records that frame it.
 * @param {object} options
 * @returns {{local: Buffer, nameBytes: Buffer, payload: Buffer, descriptor: Buffer, central: Buffer}}
 */
function encodeEntry({ name, data, stamp, offset }) {
  const nameBytes = Buffer.from(name, 'utf8');
  const isDirectory = name.endsWith('/');

  const { method, flags } = chooseCompression(name, data.length);
  const payload = method === METHOD_DEFLATE ? deflateRawSync(data, { level: 9 }) : data;
  const checksum = crc32(data);

  const local = localHeader({
    flags,
    method,
    stamp,
    checksum,
    compressedSize: payload.length,
    size: data.length,
    nameLength: nameBytes.length,
  });

  // The data descriptor repeats the sizes and checksum after the payload. Both
  // places are written: the flag says a reader may trust the descriptor, and a
  // reader that ignores it still finds correct sizes in the directory.
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(DATA_DESCRIPTOR_SIG, 0);
  descriptor.writeUInt32LE(checksum, 4);
  descriptor.writeUInt32LE(payload.length, 8);
  descriptor.writeUInt32LE(data.length, 12);

  const central = centralHeader({
    flags,
    method,
    stamp,
    checksum,
    compressedSize: payload.length,
    size: data.length,
    nameLength: nameBytes.length,
    offset,
    isDirectory,
  });

  return { local, nameBytes, payload, descriptor, central };
}

/**
 * Build a ZIP archive in memory.
 *
 * Entry order is caller-controlled and preserved, so archives can be produced
 * deterministically by sorting the input: identical inputs then yield identical
 * bytes, which is what lets a test compare two builds.
 * @param {Array<{name: string, data: string|Buffer}>} entries
 * @param {object} [options]
 * @param {number} [options.mtime] - Fixed timestamp in ms, for reproducibility
 * @returns {Buffer} The complete archive
 */
export function createZip(entries, { mtime } = {}) {
  const stamp = dosDateTime(mtime ? new Date(mtime) : new Date());

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = normaliseName(entry.name);
    const isDirectory = name.endsWith('/');
    const data = isDirectory
      ? Buffer.alloc(0)
      : Buffer.isBuffer(entry.data)
        ? entry.data
        : Buffer.from(String(entry.data), 'utf8');

    if (data.length > ZIP64_LIMIT) {
      throw new Error(
        `Entry "${name}" exceeds the 4 GiB Zip64 limit; this writer does not support Zip64.`
      );
    }

    const { local, nameBytes, payload, descriptor, central } = encodeEntry({
      name,
      data,
      stamp,
      offset,
    });

    localParts.push(local, nameBytes, payload, descriptor);
    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + payload.length + descriptor.length;
  }

  const centralDirectory = Buffer.concat(centralParts);

  if (entries.length > 0xffff) {
    throw new Error('Archive has more than 65535 entries; this writer does not support Zip64.');
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // this disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

/**
 * Find the end of central directory record, scanning back from the end.
 * @param {Buffer} buffer
 * @returns {number} Offset of the record, or -1
 */
function findEocd(buffer) {
  // The record is 22 bytes plus up to 65535 of comment, so scan that far back.
  const floor = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * Read a ZIP archive into its entries.
 *
 * Reads the central directory rather than walking local headers, because the
 * central directory is the authoritative index: it carries names and offsets
 * that stay valid even when a local header is written with a data descriptor.
 * @param {Buffer} buffer
 * @returns {Array<{name: string, data: Buffer, isDirectory: boolean, method: number}>}
 */
export function readZip(buffer) {
  const eocdOffset = findEocd(buffer);
  if (eocdOffset === -1) throw new Error('Not a ZIP archive: no end of central directory record.');

  const count = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);

  if (cursor === ZIP64_LIMIT) {
    throw new Error('Zip64 archives are not supported by this reader.');
  }

  const entries = [];

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIG) {
      throw new Error(`Corrupt central directory at entry ${i}.`);
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`Corrupt local header for "${name}".`);
    }

    // Read the sizes from the LOCAL header: when the data descriptor flag is
    // set, the central directory copies are correct but the local ones are the
    // ones that locate the payload.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === METHOD_STORE) {
      data = Buffer.from(raw);
    } else if (method === METHOD_DEFLATE) {
      data = inflateRawSync(raw);
    } else {
      throw new Error(`Unsupported compression method ${method} for "${name}".`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(
        `Entry "${name}" inflated to ${data.length} bytes but the directory says ${uncompressedSize}.`
      );
    }

    entries.push({ name, data, isDirectory: name.endsWith('/'), method });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Convenience wrapper: the set of names in an archive. */
export function listZip(buffer) {
  return readZip(buffer).map(entry => entry.name);
}

/** Convenience wrapper: read one entry's contents as UTF-8 text. */
export function readZipText(buffer, name) {
  const entry = readZip(buffer).find(e => e.name === name);
  return entry ? entry.data.toString('utf8') : null;
}
