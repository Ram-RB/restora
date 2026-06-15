/**
 * BuildCast Test File Generator
 * Generates sample .BUILD files containing valid MP4 headers with:
 * 1. Simple rename (.BUILD instead of .mp4)
 * 2. Prepended firmware metadata (offset)
 * 3. XOR encryption
 * Run with: node generate_test_files.js
 */

const fs = require('fs');
const path = require('path');

// A minimal 1.5kB valid MP4 file encoded as base64 (plays a tiny blank video)
const mp4Base64 = 
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAtJtZGF0AAACrQYF//' +
  '+//vfJ78Cm6/X2tb9gAQD5AAADBm1vb3YAAABsbXZoZAAAAADgYBEw4GARMAAAA+gAAAPoAAEAA' +
  'AEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAIAAAIwdHJhawAAAFx0a2hkAAAAA+BgETDgYBEwAAAAAQAAAAAA' +
  'AAPoAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAA' +
  'UAAAAFAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAD6AAAAAAAAQAAAAABqG1kaWEAAAAgbW' +
  'RoZAAAAADgYBEw4GARMAAAQAAAAEAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAA' +
  'AAAAVmlkZW9IYW5kbGVyAAAAAVNtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxk' +
  'cmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAETc3RibAAAAK9zdHNkAAAAAAAAAAEAAACfYXZjMQAA' +
  'AAAAAAABAAAAAAAAAAAAAAAAAAAAAAAUABQASAAAAEgAAAAAAAAAARVMYXZjNTkuNTYuMTAwIGxp' +
  'YngyNjQAAAAAAAAAAAAAABj//wAAADVhdmNDAWQAM//hABhnZAAzrNlJeeeEAAADAAQAAAMACDxg' +
  'xlgBAAZo6+PLIsD9+PgAAAAAFGJ0cnQAAAAAAAAWUAAAFlAAAAAYc3R0cwAAAAAAAAABAAAAAQAA' +
  'QAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAACygAAAAEAAAAUc3Rj' +
  'bwAAAAAAAAABAAAAMAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBs' +
  'AAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTkuMzUuMTAw';

const mp4Bytes = Buffer.from(mp4Base64, 'base64');
const targetDir = __dirname;

console.log('Generating test .BUILD files in:', targetDir);

// 1. Simple Renamed File
const plainPath = path.join(targetDir, 'cam_door_plain.BUILD');
fs.writeFileSync(plainPath, mp4Bytes);
console.log(`- Created plain renamed file: ${path.basename(plainPath)} (${mp4Bytes.length} bytes)`);

// 2. Prepended Firmware Metadata Header
const headerText = 'FIRMWARE_V3.4_CAMERA_ID_098432_SYS_OK_TIMECODE_2026-06-15T07:00:00Z_PADDING_JUNK_DATA_FOR_ALIGNMENT________________________________________________________________________________________________________________________________________________________';
const headerBytes = Buffer.from(headerText);
const offsetBytes = Buffer.concat([headerBytes, mp4Bytes]);
const offsetPath = path.join(targetDir, 'cam_lobby_with_header.BUILD');
fs.writeFileSync(offsetPath, offsetBytes);
console.log(`- Created header-padded file: ${path.basename(offsetPath)} (${offsetBytes.length} bytes, offset is +${headerBytes.length} bytes)`);

// 3. XOR Encrypted File
const xorKey = 0x5A; // key = 90
const xorBytes = Buffer.alloc(mp4Bytes.length);
for (let i = 0; i < mp4Bytes.length; i++) {
  xorBytes[i] = mp4Bytes[i] ^ xorKey;
}
const xorPath = path.join(targetDir, 'cam_parking_xor_encrypted.BUILD');
fs.writeFileSync(xorPath, xorBytes);
console.log(`- Created XOR encrypted file: ${path.basename(xorPath)} (${xorBytes.length} bytes, key is 0x5A)`);

console.log('\nGeneration complete! You can open the index.html page and drag-and-drop these files to test.');
