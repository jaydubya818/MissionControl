import { describe, expect, it } from 'vitest';
import { createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes as nodeRandom, sign, verify } from 'node:crypto';
import {
  constantTimeEqual, ed25519Sign, ed25519Verify, fromBase64, fromHex, hmacSha256, parsePrivateKey, parsePublicKey, sha1Bytes, sha256Bytes, sha256Hex,
  toBase64, toBase64Url, toHex, utf8,
} from '../../packages/shared/src/pureCrypto';
import { signProtocolPayload, verifyProtocolPayload } from '../../packages/shared/src/factoryResult/factory-producer-signature';

// Cross-check: the pure-JS path must be byte-identical to the node:crypto path it replaced, in both directions.
const pair = () => { const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey, publicKey }; };

describe('pureCrypto vs node:crypto', () => {
  it('Ed25519: node signs -> pure verifies, pure signs -> node verifies, identical signatures and key ids', () => {
    for (let i = 0; i < 20; i++) {
      const k = pair(), message = utf8(`MYFACTORY_RESULT_V1\0${nodeRandom(1 + i * 7).toString('base64url')}`);
      const nodeSig = sign(null, Buffer.from(message), k.privateKey);
      const pub = parsePublicKey(k.publicPem), priv = parsePrivateKey(k.privatePem);
      if (pub.asymmetricKeyType !== 'ed25519' || priv.asymmetricKeyType !== 'ed25519') throw Error('parse');
      expect(ed25519Verify(Uint8Array.from(nodeSig), message, pub.raw)).toBe(true);
      const pureSig = ed25519Sign(message, priv.seed);
      expect(verify(null, Buffer.from(message), k.publicKey, Buffer.from(pureSig))).toBe(true);
      expect(toHex(pureSig)).toBe(nodeSig.toString('hex'));                              // Ed25519 is deterministic
      expect(sha256Hex(pub.spki)).toBe(createHash('sha256').update(k.publicKey.export({ type: 'spki', format: 'der' })).digest('hex'));
      const derived = parsePublicKey(k.privatePem);                                         // createPublicKey(privatePem)
      expect(derived.asymmetricKeyType === 'ed25519' && toHex(derived.spki)).toBe(createPublicKey(k.privatePem).export({ type: 'spki', format: 'der' }).toString('hex'));
      const tampered = Uint8Array.from(nodeSig); tampered[5] ^= 1;
      expect(ed25519Verify(tampered, message, pub.raw)).toBe(false);
    }
  });
  it('protocol signatures interoperate with KeyObject and PEM keys both ways', () => {
    const k = pair(), encoded = toBase64Url(utf8('{"a":1}'));
    const viaPem = signProtocolPayload('MYFACTORY_RESULT_V1', encoded, k.privatePem), viaKeyObject = signProtocolPayload('MYFACTORY_RESULT_V1', encoded, createPrivateKey(k.privatePem));
    expect(viaPem).toBe(viaKeyObject);
    expect(verify(null, Buffer.from(`MYFACTORY_RESULT_V1\0${encoded}`), k.publicKey, Buffer.from(viaPem, 'base64url'))).toBe(true);
    const nodeSig = sign(null, Buffer.from(`MYFACTORY_RECEIPT_V1\0${encoded}`), k.privateKey).toString('base64url');
    expect(verifyProtocolPayload('MYFACTORY_RECEIPT_V1', encoded, nodeSig, k.publicPem)).toBe(true);
    expect(verifyProtocolPayload('MYFACTORY_RECEIPT_V1', encoded, nodeSig, k.publicKey)).toBe(true);
    expect(verifyProtocolPayload('MYFACTORY_RECEIPT_V1', encoded + 'x', nodeSig, k.publicPem)).toBe(false);
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(verifyProtocolPayload('MYFACTORY_RECEIPT_V1', encoded, nodeSig, ec)).toBe(false);
    expect(parsePublicKey(ec).asymmetricKeyType).toBe('other');
  });
  it('hashes, HMAC, base64 and hex match node byte for byte (incl. Node lenient decoding)', () => {
    for (const len of [0, 1, 2, 3, 31, 64, 1000]) {
      const data = Uint8Array.from(nodeRandom(len)), text = Buffer.from(data).toString('latin1') + 'é✓';
      expect(sha256Hex(data)).toBe(createHash('sha256').update(data).digest('hex'));
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text).digest('hex'));
      expect(toHex(sha1Bytes('blob 3\0', data))).toBe(createHash('sha1').update('blob 3\0').update(data).digest('hex'));
      expect(toHex(sha256Bytes('tree 1\0', data))).toBe(createHash('sha256').update('tree 1\0').update(data).digest('hex'));
      expect(toHex(hmacSha256('secret-' + len, text))).toBe(createHmac('sha256', 'secret-' + len).update(text).digest('hex'));
      expect(toBase64(data)).toBe(Buffer.from(data).toString('base64'));
      expect(toBase64Url(data)).toBe(Buffer.from(data).toString('base64url'));
    }
    for (const s of ['', 'QQ', 'QQ==', 'QUJD', 'QU JD', 'Q*U=JD', '-_-_', '+/+/', 'YWJjZA=x', 'YQ', 'YR']) {
      expect(toHex(fromBase64(s))).toBe(Buffer.from(s, 'base64').toString('hex'));
      expect(toHex(fromBase64(s))).toBe(Buffer.from(s, 'base64url').toString('hex'));
    }
    for (const s of ['', 'ab', 'abc', 'zz', 'ABcd', 'abzz12']) expect(toHex(fromHex(s))).toBe(Buffer.from(s, 'hex').toString('hex'));
    expect(constantTimeEqual(utf8('abc'), utf8('abc'))).toBe(true);
    expect(constantTimeEqual(utf8('abc'), utf8('abd'))).toBe(false);
    expect(constantTimeEqual(utf8('abc'), utf8('ab'))).toBe(false);
  });
});
