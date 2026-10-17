// Minimal compound Word fixture with a real directory/FAT layout.
export function legacyDocFixture(streamName = 'WordDocument') {
  const data=Buffer.alloc(2048);
  Buffer.from('d0cf11e0a1b11ae1','hex').copy(data);
  data.writeUInt16LE(3,26);data.writeUInt16LE(0xfffe,28);data.writeUInt16LE(9,30);data.writeUInt16LE(6,32);
  data.writeUInt32LE(1,44);data.writeUInt32LE(0,48);data.writeUInt32LE(0xfffffffe,60);data.writeUInt32LE(0xfffffffe,68);
  data.fill(0xff,76,512);data.writeUInt32LE(1,76);
  function entry(offset,name,type) { const encoded=Buffer.from(name+'\0','utf16le');encoded.copy(data,offset);data.writeUInt16LE(encoded.length,offset+64);data[offset+66]=type; }
  entry(512,'Root Entry',5);entry(640,streamName,2);data.writeUInt32LE(2,756);data.writeUInt32LE(512,760);
  data.fill(0xff,1024,1536);data.writeUInt32LE(0xfffffffe,1024);data.writeUInt32LE(0xfffffffd,1028);data.writeUInt32LE(0xfffffffe,1032);
  data.writeUInt16LE(0xa5ec,1536);return data;
}
