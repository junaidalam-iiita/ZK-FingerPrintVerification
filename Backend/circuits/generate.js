// generate.js
const crypto = require("crypto");
const iden3Crypto = require("@iden3/js-crypto");
const fs = require('fs');
const path = require('path');

// --- Circuit Parameters ---
const N_MINUTIAE = 5;
const DB_SIZE = 5;
const MAX_COORD = 60; // Ensure this matches circuit limits if any
const ANGLE_RANGE = 90; // Ensure this matches circuit limits if any

// --- Helper Functions ---
const { Poseidon, Eddsa } = iden3Crypto; // Ensure Eddsa is imported

// generateEdDSAKeyPair (unchanged)
async function generateEdDSAKeyPair() {
    const privateKeyBuffer = crypto.randomBytes(31);
    const publicKey = Eddsa.prv2pub(privateKeyBuffer);
    return { privateKey: privateKeyBuffer, publicKey: publicKey };
}

// signPoseidonHash (unchanged)
async function signPoseidonHash(privateKeyBuffer, messageHash) {
    // ... (input validation as before) ...
    try {
        const signature = Eddsa.signPoseidon(privateKeyBuffer, messageHash);
        // Signature format: { R8: [bigint, bigint], S: bigint }
        return signature; // Return the whole signature object for verification ease
    } catch (error) {
        console.error(`Error during Poseidon signing: ${error.message}\n${error.stack}`);
        throw error;
    }
}

// hashFingerprint (unchanged)
async function hashFingerprint(fpData) {
    // ... (input validation and hashing as before) ...
    if (!Array.isArray(fpData) || !fpData.every(Array.isArray)) { throw new Error("Invalid fingerprint data format: Expected array of arrays."); }
    const flattened = fpData.flat();
    const expectedLength = N_MINUTIAE * 3;
    if (flattened.length !== expectedLength) { throw new Error(`Invalid fingerprint data length. Expected ${expectedLength} numbers (flattened), got ${flattened.length}.`); }
    const inputs = flattened.map(num => BigInt(num));
    if (inputs.length <= 16) { return Poseidon.hash(inputs); }
    else { throw new Error("Fingerprint data results in too many inputs (> 16) for Poseidon.hash function."); }
}

// formatForJson (modified slightly to handle signature object if needed)
// OR just format the specific array structure circuit needs later
function formatSignatureForCircuit(signature) {
    // Expected circuit input: [R8x, R8y, S]
    return [signature.R8[0], signature.R8[1], signature.S];
}

function formatForJson(data) {
    if (typeof data === 'bigint') { return data.toString(); }
    else if (Array.isArray(data)) { return data.map(formatForJson); }
    // Specific handling for signature objects might not be needed if formatted before this call
    else if (typeof data === 'object' && data !== null) {
         // Add check for signature structure if necessary, otherwise general object handling
         const formattedObj = {};
         for (const key in data) { formattedObj[key] = formatForJson(data[key]); }
         return formattedObj;
     }
    else { return data; }
}


// generateRandomFingerprint (unchanged)
function generateRandomFingerprint() {
    const fingerprint = [];
    for (let i = 0; i < N_MINUTIAE; i++) {
        const x = Math.floor(Math.random() * (MAX_COORD + 1));
        const y = Math.floor(Math.random() * (MAX_COORD + 1));
        const angle = Math.floor(Math.random() * ANGLE_RANGE);
        fingerprint.push([x, y, angle]);
    }
    return fingerprint;
}


// --- Main Logic - WITH SIGNATURE VERIFICATION ---
async function generateAndProcessCircuitInputs() {
    console.log("Starting circuit input generation with random data...");

    // --- 1. Generate Random Fingerprint Data ---
    console.log("Generating random fingerprint data...");
    const rawQueryFp = generateRandomFingerprint();
    const rawDbFpArray = [];
    for (let i = 0; i < DB_SIZE; i++) { rawDbFpArray.push(generateRandomFingerprint()); }
    console.log("Random fingerprint data generated.");

    // --- 2. Generate Keys ---
    console.log("Generating required EdDSA key pairs...");
    const querierKeys = await generateEdDSAKeyPair();
    const dbEntryKeys = [];
    for (let i = 0; i < DB_SIZE; i++) { dbEntryKeys.push(await generateEdDSAKeyPair()); }
    console.log(`${1 + DB_SIZE} key pairs generated.`);

    const queryPublicKey = querierKeys.publicKey;
    const dbPublicKeys = dbEntryKeys.map(keys => keys.publicKey);
    const querierPrivateKey = querierKeys.privateKey; // Keep private keys only for signing/verification here
    const dbPrivateKeys = dbEntryKeys.map(keys => keys.privateKey);

    // --- 3. Process Query Fingerprint ---
    console.log("\nHashing, signing, and VERIFYING query fingerprint...");
    const queryFpHash = await hashFingerprint(rawQueryFp);
    const querySignatureObject = await signPoseidonHash(querierPrivateKey, queryFpHash); // Get {R8, S} object
    console.log("  - Query signature generated.");

    // *** Verification Step for Query ***
    const isQuerySigValid = Eddsa.verifyPoseidon(queryFpHash, querySignatureObject, queryPublicKey);
    console.log(`  - Verifying query signature... Valid: ${isQuerySigValid}`);
    if (!isQuerySigValid) {
        // This should theoretically not happen if library is correct, but good check
        throw new Error("FATAL: Generated query signature FAILED verification!");
    }
    // Format for circuit AFTER verification
    const querySignatureForCircuit = formatSignatureForCircuit(querySignatureObject);
    console.log("Query fingerprint processed and verified.");


    // --- 4. Process Database Fingerprints ---
    const dbSignaturesForCircuit = []; // Store formatted signatures for circuit input
    console.log("\nHashing, signing, and VERIFYING database fingerprints...");
    for (let i = 0; i < DB_SIZE; i++) {
        console.log(` Processing Random DB Index ${i}...`);
        try {
            const dbFpHash_i = await hashFingerprint(rawDbFpArray[i]);
            const dbSignatureObject_i = await signPoseidonHash(dbPrivateKeys[i], dbFpHash_i); // Get {R8, S} object
            console.log(`  - DB index ${i} signature generated.`);

            // *** Verification Step for DB Entry ***
            const isDbSigValid = Eddsa.verifyPoseidon(dbFpHash_i, dbSignatureObject_i, dbPublicKeys[i]);
            console.log(`  - Verifying DB index ${i} signature... Valid: ${isDbSigValid}`);
            if (!isDbSigValid) {
                throw new Error(`FATAL: Generated signature for DB index ${i} FAILED verification!`);
            }

            // Format for circuit AFTER verification
            dbSignaturesForCircuit.push(formatSignatureForCircuit(dbSignatureObject_i));
            console.log(`  - Verified and stored signature for DB index ${i}.`);

        } catch(e) {
            console.error(`\n!!! FAILED processing DB index ${i}: ${e.message} !!!`);
            throw e;
        }
    }
    console.log("\nAll database entries processed and verified.");

    // --- 5. Assemble Separate Public and Private Inputs ---
    const publicCircuitInputs = {
        "queryFp": rawQueryFp,
        "queryPublicKey": queryPublicKey,
        "dbPublicKeys": dbPublicKeys
    };

    const privateCircuitInputs = {
        "dbFpArray": rawDbFpArray,
        "querySignature": querySignatureForCircuit,  // Use formatted signature
        "dbSignatures": dbSignaturesForCircuit     // Use formatted signatures
    };

    // --- 6. Format & Output to Separate JSON Files ---
    const outputPublicFile = 'public.json';
    const outputPrivateFile = 'private.json';
    console.log("\n--- Generating circuit input files ---");

    const formattedPublic = formatForJson(publicCircuitInputs);
    fs.writeFileSync(outputPublicFile, JSON.stringify(formattedPublic, null, 2));
    console.log(`Successfully generated public circuit inputs -> '${outputPublicFile}'`);

    const formattedPrivate = formatForJson(privateCircuitInputs);
    fs.writeFileSync(outputPrivateFile, JSON.stringify(formattedPrivate, null, 2));
    console.log(`Successfully generated private circuit inputs -> '${outputPrivateFile}'`);

    console.log("\nGeneration process complete.");
}


// --- Script Execution ---
console.log("Running data generation script with internal verification...");
generateAndProcessCircuitInputs().catch(err => {
    console.error("\n<<< Critical error during data generation and processing >>>");
    console.error(err.message);
    process.exit(1);
});