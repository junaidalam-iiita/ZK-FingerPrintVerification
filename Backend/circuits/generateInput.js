// generate.js
const crypto = require("crypto");
const iden3Crypto = require("@iden3/js-crypto");
const fs = require('fs');

// --- Circuit Parameters ---
// ... (Keep as before) ...
const N_MINUTIAE = 5; const DB_SIZE = 5; const MAX_COORD = 50; const ANGLE_RANGE=90;

// --- Helper Functions using @iden3/js-crypto ---

// Destructure needed classes AND utils
const { Poseidon, Eddsa, utils } = iden3Crypto; // <<<< ADD 'utils' HERE

// generateEdDSAKeyPair (Should be correct now)
async function generateEdDSAKeyPair() {
    const privateKeyBuffer = crypto.randomBytes(31);
    // *** Correction: prv2pub IS the static method according to the source ***
    // const eddsa = new Eddsa(privateKeyBuffer); // Don't need instance just for static prv2pub
    // const publicKey = eddsa.publicKey;
    const publicKey = Eddsa.prv2pub(privateKeyBuffer); // <<< USE STATIC METHOD FROM SOURCE
    return {
        privateKey: privateKeyBuffer,
        publicKey: publicKey // publicKey is [BigInt, BigInt] as returned by prv2pub
    };
}


// ** CORRECTED signPoseidonHash using static Eddsa.signPoseidon **
async function signPoseidonHash(privateKeyBuffer /* Buffer(31) expected */, messageHash /* BigInt expected */) {
  if (!Buffer.isBuffer(privateKeyBuffer) || privateKeyBuffer.length !== 31) { /* Error */ }
  if (typeof messageHash !== 'bigint') { /* Error */ }

  console.log(`--- Debug: Calling Eddsa.signPoseidon (static method from source) ---`);
  console.log(`  Private Key Length: ${privateKeyBuffer.length}`);
  console.log(`  Hash to Sign (BigInt): ${messageHash.toString()}`);
  console.log(`-------------------------------------------------------------------`);

  try {
    // Call the static signPoseidon method as defined in the source code
    // It takes the private key buffer and the BigInt message hash
    const signature = Eddsa.signPoseidon(privateKeyBuffer, messageHash); // << STATIC CALL matches source

    // signature returns { R8: [bigint, bigint], S: bigint } according to source logic

    // We need R8[0], R8[1], and S as BigInts for the witness, which is what it returns
    const sigR8x = signature.R8[0];
    const sigR8y = signature.R8[1];
    const sigS = signature.S;

    return [sigR8x, sigR8y, sigS]; // Return array of BigInts

  } catch (error) {
      console.error(`*** Error occurred INSIDE/CALLING Eddsa.signPoseidon (static from source) ***`);
      console.error(` Inputs provided:`);
      console.error(`  Private Key Length: ${privateKeyBuffer.length}`);
      console.error(`  Hash Value (BigInt) : ${messageHash.toString()}`);
      console.error(` Original Error Message: ${error.message}`);
      console.error(error.stack);
      throw error;
  }
}

// hashFingerprint (Uses Poseidon.hash - Assuming Poseidon is correctly imported)
async function hashFingerprint(fpData) {
    const flattened = fpData.flat(); const expectedLength = N_MINUTIAE * 3; if (flattened.length !== expectedLength) { throw new Error("FP length mismatch"); }
    const inputs = flattened.map(BigInt);
    if (inputs.length <= 16) { // Use static Poseidon.hash if input count is low enough (common case)
        const hash = Poseidon.hash(inputs); return hash;
    } else { throw new Error("Too many inputs for Poseidon.hash - stateful needed"); }
}


// --- formatForJson, randomMinutia (Unchanged) ---
function formatForJson(data) { /* ... */ }
function randomMinutia() { /* ... */ }

// --- Main Input Generation Logic ---
async function generateInputs() {
    console.log("Generating key pairs (using @iden3/js-crypto)...");
    const querierKeys = await generateEdDSAKeyPair(); // .privateKey=Buffer, .publicKey=[BigInt, BigInt]
    const dbEntryKeys = [];
    for (let i = 0; i < DB_SIZE; i++) { dbEntryKeys.push(await generateEdDSAKeyPair()); }
    console.log("Key pairs generated.");

    // Generate PUBLIC Inputs
    const queryFp = [ [10, 15, 20], [25, 30, 45], [40, 10, 80], [ 5, 45,  5], [20, 20, 70] ];
    console.log("\nHashing and signing public query fingerprint...");
    const queryFpHash = await hashFingerprint(queryFp); let querySignature; // Will be [BigInt,BigInt,BigInt]
    try { querySignature = await signPoseidonHash(querierKeys.privateKey, queryFpHash); console.log("Public query fingerprint signed."); }
    catch(e) { console.error(">>>> Failed to sign query fingerprint!"); throw e; }

    // Public Keys are already [BigInt, BigInt] format from generateEdDSAKeyPair
    const queryPublicKey = querierKeys.publicKey;
    const dbPublicKeys = dbEntryKeys.map(keys => keys.publicKey);

    // Generate PRIVATE Inputs
    let dbFpArray = []; let dbSignatures = []; console.log("\nGenerating private database entries and signatures...");
    const matchingIndex = 1;
    for (let i = 0; i < DB_SIZE; i++) {
        let currentDbFp; if (i === matchingIndex) { currentDbFp = [[11, 16, 22], [28, 28, 40], [39, 12, 88],[48, 48, 85], [10, 10, 10]]; console.log(` - Created match data ${i}`);} else { currentDbFp = Array.from({ length: N_MINUTIAE }, randomMinutia); console.log(` - Created random data ${i}`);} dbFpArray.push(currentDbFp);
        const dbFpHash_i = await hashFingerprint(currentDbFp); let dbSignature_i_bigints;
        try { console.log(` Signing DB Index ${i} Hash: ${dbFpHash_i.toString()}`); dbSignature_i_bigints = await signPoseidonHash(dbEntryKeys[i].privateKey, dbFpHash_i); dbSignatures.push(dbSignature_i_bigints); console.log(` - Signed data ${i}`); }
        catch(e) { console.error(`>>>> Failed to sign fingerprint for DB index ${i}!`); throw e; }
    }
    console.log("\nPrivate DB entries generated.");

    // Assemble Final Inputs (Signatures/Keys are now BigInts directly)
    const inputs = {
        "queryFp": queryFp,
        "querySignature": querySignature,
        "queryPublicKey": queryPublicKey,
        "dbPublicKeys": dbPublicKeys,
        "dbFpArray": dbFpArray,
        "dbSignatures": dbSignatures
    };

    // Format (handles BigInts -> Strings) & Output
    const formattedInputs = formatForJson(inputs);
    const jsonString = JSON.stringify(formattedInputs, null, 2);
    console.log("\n--- inputs.json ---");
    if (!process.stdout.isTTY) { console.log(jsonString); }
    else { console.log("(JSON view inputs.json)"); }
    fs.writeFileSync('inputs.json', jsonString);
    console.log("\ninputs.json generated successfully.");
}

// ----- Include helpers -----
function formatForJson(data) { if (typeof data === 'bigint') { return data.toString(); } else if (Array.isArray(data)) { return data.map(formatForJson); } else if (typeof data === 'object' && data !== null) { const formattedObj = {}; for (const key in data) { formattedObj[key] = formatForJson(data[key]); } return formattedObj; } else { return data; } }
function randomMinutia() { return [ Math.floor(Math.random() * (MAX_COORD + 1)), Math.floor(Math.random() * (MAX_COORD + 1)), Math.floor(Math.random() * (ANGLE_RANGE + 1)), ]; }

// --- Run ---
generateInputs().catch(err => { console.error("\n<<< Error during input generation >>>", err.message); process.exit(1); });