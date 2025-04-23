pragma circom 2.0.0;

// Import necessary libraries (ensure these are correct for your circomlib version)
include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/eddsa.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom"; // Potentially needed by comparators or other helpers
include "node_modules/circomlib/circuits/gates.circom";  // Needed for IsEqual if used directly (or indirectly via comparators.circom)
include "node_modules/circomlib/circuits/eddsaposeidon.circom"; 
include "node_modules/circomlib/circuits/mux1.circom"; // Mux1 is often within gates.circom or comparators.circom depending on version, adjust if needed. Usually comparators is enough.


// Template: EuclideanDistanceSquared
template EuclideanDistanceSquared(nBits) {
    signal input x1, y1, x2, y2;
    signal output distSq;
    signal deltaX; deltaX <-- x1 - x2;
    signal deltaY; deltaY <-- y1 - y2;
    distSq <-- deltaX * deltaX + deltaY * deltaY;
}



/*
 * @template AngleSimilarity
 * Checks if two angles are similar within a given tolerance, considering wrap-around.
 * @param angleBits Number of bits to represent the angles (ensure sufficient for max angle value).
 * @param range The maximum possible angle value (e.g., 90 for range [0, 90]). The range size is calculated as range + 1.
 * @param tolerance The maximum allowed difference (inclusive) for angles to be considered similar.
 * @input angle1 First angle value.
 * @input angle2 Second angle value.
 * @output isSimilar 1 if abs_circular_diff(angle1, angle2) <= tolerance, 0 otherwise.
 */
template AngleSimilarity(angleBits, range, tolerance) {
    signal input angle1;
    signal input angle2;
    signal output isSimilar; // 1 if similar, 0 otherwise

    // --- Parameters and Constants ---
    // Calculate the total size of the range (number of distinct values)
    // If range parameter is 90 (meaning values 0..90), then rangeSize is 91.
    var rangeSize = range + 1;
    // Bits needed for comparisons involving rangeSize or tolerance+1.
    // Choose a safe upper bound, e.g., angleBits + log2(small_constant) + 1
    // If angleBits=7 (up to 127) and range=90, tolerance=10, differences won't exceed range.
    // Using angleBits + 1 is likely safe for comparisons up to rangeSize or tolerance+1.
    var compBits = angleBits + 1;

    // --- Step 1: Calculate Absolute Difference (Ignoring Wrap-Around) ---

    // Determine which angle is greater
    component angleComp = GreaterEqThan(angleBits);
    angleComp.in[0] <== angle1;
    angleComp.in[1] <== angle2;
    signal angle1_ge_angle2 <== angleComp.out; // 1 if angle1 >= angle2

    // Calculate potential positive differences using field arithmetic.
    // If angle1 >= angle2, use angle1 - angle2.
    // If angle2 > angle1, use angle2 - angle1.
    signal diff1 <== angle1 - angle2;
    signal diff2 <== angle2 - angle1;

    // Use Mux1 to select the correct positive difference
    component diffMux = Mux1();
    diffMux.c[0] <== diff2;             // Select diff2 (angle2 - angle1) if angle1_ge_angle2 is 0
    diffMux.c[1] <== diff1;             // Select diff1 (angle1 - angle2) if angle1_ge_angle2 is 1
    diffMux.s <== angle1_ge_angle2;
    signal absDiff <== diffMux.out;     // absDiff now holds |angle1 - angle2|

    // --- Step 2: Calculate Wrapped-Around Difference ---
    // wrappedDiff = rangeSize - absDiff
    signal wrappedDiff;
    wrappedDiff <-- rangeSize - absDiff; // Use intermediate assignment <--

    // --- Step 3: Find Minimum Difference (Shortest Path) ---

    // Compare absDiff and wrappedDiff
    component minDiffComp = LessThan(compBits); // Use compBits for safety
    minDiffComp.in[0] <== absDiff;
    minDiffComp.in[1] <== wrappedDiff;
    signal abs_is_smaller <== minDiffComp.out; // 1 if absDiff < wrappedDiff

    // Use Mux1 to select the smaller difference
    component minDiffMux = Mux1();
    minDiffMux.c[0] <== wrappedDiff;    // Select wrappedDiff if abs_is_smaller is 0 (absDiff >= wrappedDiff)
    minDiffMux.c[1] <== absDiff;        // Select absDiff if abs_is_smaller is 1 (absDiff < wrappedDiff)
    minDiffMux.s <== abs_is_smaller;
    signal minDiff <== minDiffMux.out;  // minDiff holds the shortest distance

    // --- Step 4: Compare Minimum Difference with Tolerance ---
    // Check if minDiff <= tolerance. Equivalent to minDiff < (tolerance + 1).
    component toleranceCheck = LessThan(compBits); // Use compBits
    toleranceCheck.in[0] <== minDiff;           // The shortest calculated distance
    toleranceCheck.in[1] <== tolerance + 1;     // Compare against tolerance + 1

    // Assign the final output
    isSimilar <== toleranceCheck.out; // Output 1 if minDiff <= tolerance, 0 otherwise
}


// Template: MinutiaMatch
template MinutiaMatch(coordBits, angleBits, distThresholdSq, angleTolerance, angleRange, distSqBits) {
    signal input x1, y1, angle1;
    signal input x2, y2, angle2;
    signal output isMatch; // 1 if match, 0 otherwise

    component distCalc = EuclideanDistanceSquared(coordBits);
    distCalc.x1 <== x1; distCalc.y1 <== y1;
    distCalc.x2 <== x2; distCalc.y2 <== y2;

    component distCheck = LessThan(distSqBits); // Check dist^2 < threshold^2
    distCheck.in[0] <== distCalc.distSq;
    distCheck.in[1] <== distThresholdSq;
    signal distOK <== distCheck.out;

    component angleCheck = AngleSimilarity(angleBits, angleRange, angleTolerance);
    angleCheck.angle1 <== angle1;
    angleCheck.angle2 <== angle2;
    signal angleOK <== angleCheck.isSimilar;

    isMatch <== distOK * angleOK; // Match = distOK AND angleOK
}

// Template: FingerprintMatcher
template FingerprintMatcher(nMinutiae, matchThreshold, coordBits, angleBits, distThresholdSq, angleTolerance, angleRange, distSqBits, countBits) {
    signal input fp1[nMinutiae][3]; // [N][x, y, angle]
    signal input fp2[nMinutiae][3];
    signal output isMatch; // 1 if enough minutiae match, 0 otherwise

    // Array for minutia matchers
    component minutiaMatchers[nMinutiae];
    // Array for individual match results
    signal matches[nMinutiae];

    // ** Array to hold the accumulated count at each step **
    // Size is nMinutiae + 1: Holds the initial value (0) and the count after each addition.
    signal matchCountSteps[nMinutiae + 1];

    // ** Initialize the starting point of the accumulation **
    // Use <-- for initial intermediate assignment (and implicit constraint count[0] === 0)
    matchCountSteps[0] <-- 0;

    // Loop through each minutia comparison
    for (var i = 0; i < nMinutiae; i++) {
        // Instantiate and connect the i-th matcher
        minutiaMatchers[i] = MinutiaMatch(coordBits, angleBits, distThresholdSq, angleTolerance, angleRange, distSqBits);
        minutiaMatchers[i].x1 <== fp1[i][0];
        minutiaMatchers[i].y1 <== fp1[i][1];
        minutiaMatchers[i].angle1 <== fp1[i][2];
        minutiaMatchers[i].x2 <== fp2[i][0];
        minutiaMatchers[i].y2 <== fp2[i][1];
        minutiaMatchers[i].angle2 <== fp2[i][2];

        // Assign the boolean result of the i-th match to the matches array.
        // Use <== as this defines the final value/constraint for matches[i].
        matches[i] <== minutiaMatchers[i].isMatch;

        // ** Calculate the count for the next step using <-- **
        // The count after considering minutia 'i' (stored at index i+1)
        // is the count before considering it (at index i) plus the match result (matches[i]).
        // This defines the computation trace and the constraint: matchCountSteps[i+1] === matchCountSteps[i] + matches[i]
        matchCountSteps[i+1] <-- matchCountSteps[i] + matches[i];
    }

    // ** The final accumulated count is the last element in the steps array **
    // Use <== to assign this final computed value to a named signal if desired, or use directly.
    signal finalMatchCount <== matchCountSteps[nMinutiae];

    // ** Compare the FINAL accumulated count against the threshold **
    component comp = GreaterEqThan(countBits);
    // Use <== to connect the final count signal to the comparator input
    comp.in[0] <== finalMatchCount; // Use the final result of the accumulation
    comp.in[1] <== matchThreshold;

    // Assign the output of the comparison to the template's output signal using <==
    isMatch <== comp.out;
}

// Template: EuclideanDistanceSquared(nBits) { ... }
// Template: AngleSimilarity(angleBits, range, tolerance) { ... } // Make sure TODO is completed
// Template: MinutiaMatch(coordBits, angleBits, distThresholdSq, angleTolerance, angleRange, distSqBits) { ... }
// Template: FingerprintMatcher(nMinutiae, matchThreshold, ..., countBits) { ... using accumulator array for matchCount ... }

template FingerprintSystem(nMinutiae, dbSize, matchThreshold, coordBits, angleBits, distThresholdSq, angleTolerance, angleRange, distSqBits, countBits, dbSumBits) {

    // --- Public Inputs ---
    signal input queryFp[nMinutiae][3];
    signal input querySignature[3];
    signal input queryPublicKey[2];
    signal input dbPublicKeys[dbSize][2];

    // --- Private Inputs (Witness) ---
    signal input dbFpArray[dbSize][nMinutiae][3];
    signal input dbSignatures[dbSize][3];

    // --- Output ---
    signal output overallMatchResult;

    // --- Constants and Intermediate Calculations ---
    var numFingerprintInputs = nMinutiae * 3;
    var poseidonInputNum = numFingerprintInputs;

    // --- Component Instances (Declare arrays OUTSIDE loops) ---
    component poseidonHasherQuery = Poseidon(poseidonInputNum);
    component querySigVerifier = EdDSAPoseidonVerifier();
    component poseidonHasherDb[dbSize];
    component dbSigVerifier[dbSize];
    component fpMatcher[dbSize];

    // --- Signal Arrays (Declared OUTSIDE loops) ---
    signal isMatch[dbSize];
    signal isValidSignedMatch[dbSize];
    signal dbFpHashes[dbSize]; // <<<<< ARRAY FOR DB HASHES
    signal totalValidMatchesSteps[dbSize + 1];

    // --- 1. Verify Public Query Fingerprint Authenticity ---
    signal queryFpHash; // Assign output below
    for (var i=0; i<nMinutiae; i++) {
        poseidonHasherQuery.inputs[i*3 + 0] <== queryFp[i][0];
        poseidonHasherQuery.inputs[i*3 + 1] <== queryFp[i][1];
        poseidonHasherQuery.inputs[i*3 + 2] <== queryFp[i][2];
    }
    queryFpHash <== poseidonHasherQuery.out;

    querySigVerifier.enabled <== 1;
    querySigVerifier.Ax <== queryPublicKey[0];
    querySigVerifier.Ay <== queryPublicKey[1];
    querySigVerifier.R8x <== querySignature[0];
    querySigVerifier.R8y <== querySignature[1];
    querySigVerifier.S <== querySignature[2];
    querySigVerifier.M <== queryFpHash;

    // --- 2. Iterate Through Private Database, Verify Signatures, and Match ---
    totalValidMatchesSteps[0] <-- 0; // Initialize accumulator

    for (var i = 0; i < dbSize; i++) {

        // -- Step 2a: Verify Signature of the i-th Private DB Fingerprint --
        poseidonHasherDb[i] = Poseidon(poseidonInputNum);
        for (var j=0; j<nMinutiae; j++) {
            poseidonHasherDb[i].inputs[j*3 + 0] <== dbFpArray[i][j][0];
            poseidonHasherDb[i].inputs[j*3 + 1] <== dbFpArray[i][j][1];
            poseidonHasherDb[i].inputs[j*3 + 2] <== dbFpArray[i][j][2];
        }
        // ** Assign output to the i-th element of the array **
        dbFpHashes[i] <== poseidonHasherDb[i].out; // <<<<< ASSIGN TO ARRAY ELEMENT

        dbSigVerifier[i] = EdDSAPoseidonVerifier();
        dbSigVerifier[i].enabled <== 1;
        dbSigVerifier[i].Ax <== dbPublicKeys[i][0];
        dbSigVerifier[i].Ay <== dbPublicKeys[i][1];
        dbSigVerifier[i].R8x <== dbSignatures[i][0];
        dbSigVerifier[i].R8y <== dbSignatures[i][1];
        dbSigVerifier[i].S <== dbSignatures[i][2];
        // ** Use the i-th hash from the array for verification **
        dbSigVerifier[i].M <== dbFpHashes[i];        // <<<<< USE ARRAY ELEMENT

        // -- Step 2b: Perform Fingerprint Match for the i-th entry --
        fpMatcher[i] = FingerprintMatcher(nMinutiae, matchThreshold, coordBits, angleBits, distThresholdSq, angleTolerance, angleRange, distSqBits, countBits);
        fpMatcher[i].fp1 <== queryFp;
        fpMatcher[i].fp2 <== dbFpArray[i];
        isMatch[i] <== fpMatcher[i].isMatch;

        // -- Step 2c: Determine if this is a valid, signed match --
        isValidSignedMatch[i] <== isMatch[i]; // Signature check is implicit

        // -- Step 2d: Accumulate the count of valid signed matches --
        totalValidMatchesSteps[i+1] <-- totalValidMatchesSteps[i] + isValidSignedMatch[i];
    }

    // --- 3. Determine Final Output Based on Accumulated Matches ---
    signal finalTotalValidMatches <== totalValidMatchesSteps[dbSize];

    component checkNonZero = IsZero(); // Ensure IsZero is imported correctly
    checkNonZero.in <== finalTotalValidMatches;
    signal isTotalZero <== checkNonZero.out;

    overallMatchResult <== 1 - isTotalZero; // 1 if count > 0, 0 if count == 0
}

// ================================================================
// --- Main Component Instantiation                             ---
// ================================================================
component main {public [queryFp, querySignature, queryPublicKey, dbPublicKeys]} = FingerprintSystem(
    5,  // nMinutiae
    5,  // dbSize
    3,  // matchThreshold
    7,  // coordBits
    7,  // angleBits
    50, // distThresholdSq
    10, // angleTolerance
    90, // angleRange
    13, // distSqBits
    3,  // countBits (for FingerprintMatcher)
    4   // dbSumBits (for accumulator totalValidMatchesSteps & IsZero)
);