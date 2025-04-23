pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/gates.circom";

template EuclideanDistance() {
    signal input x1;
    signal input y1;
    signal input x2;
    signal input y2;
    signal output distance;
    
    signal dx <== x1 - x2;
    signal dy <== y1 - y2;
    
    signal dx2 <== dx * dx;
    signal dy2 <== dy * dy;
    distance <== dx2 + dy2;
}

template AngleSimilarity() {
    signal input angle1;
    signal input angle2;
    signal output similar;
    
    signal diff <== angle1 - angle2;
    signal diffSquared <== diff * diff;
    
    component lt = LessThan(32);
    lt.in[0] <== diffSquared;
    lt.in[1] <== 100;
    similar <== lt.out;
}

template MinutiaMatch() {
    signal input minutia1[4];
    signal input minutia2[4];
    signal output matches;
    
    var X_TOLERANCE = 49;
    var Y_TOLERANCE = 49;
    
    component eucDist = EuclideanDistance();
    eucDist.x1 <== minutia1[0];
    eucDist.y1 <== minutia1[1];
    eucDist.x2 <== minutia2[0];
    eucDist.y2 <== minutia2[1];
    
    component angleSim = AngleSimilarity();
    angleSim.angle1 <== minutia1[2];
    angleSim.angle2 <== minutia2[2];
    
    component typeEq = IsEqual();
    typeEq.in[0] <== minutia1[3];
    typeEq.in[1] <== minutia2[3];
    
    component distLt = LessThan(32);
    distLt.in[0] <== eucDist.distance;
    distLt.in[1] <== X_TOLERANCE + Y_TOLERANCE;
    
    component and1 = AND();
    and1.a <== typeEq.out;
    and1.b <== distLt.out;

    component and2 = AND();
    and2.a <== and1.out;
    and2.b <== angleSim.similar;
    
    matches <== and2.out;
}

template MatchAccumulator(numMinutiae) {
    signal input publicFingerprint[numMinutiae][4];
    signal input privateFingerprint[numMinutiae][4];
    signal output matchSum;

    component matchers[numMinutiae * numMinutiae];
    signal accumulatedMatches[numMinutiae * numMinutiae + 1];
    accumulatedMatches[0] <== 0;

    var idx = 0;
    for (var j = 0; j < numMinutiae; j++) {
        for (var k = 0; k < numMinutiae; k++) {
            matchers[idx] = MinutiaMatch();
            for (var l = 0; l < 4; l++) {
                matchers[idx].minutia1[l] <== publicFingerprint[j][l];
                matchers[idx].minutia2[l] <== privateFingerprint[k][l];
            }
            accumulatedMatches[idx + 1] <== accumulatedMatches[idx] + matchers[idx].matches;
            idx++;
        }
    }
    matchSum <== accumulatedMatches[numMinutiae * numMinutiae];
}


template CheckMatchCount() {
    signal input matchCount;
    signal output isEnoughMatches;
    
    component gt = GreaterThan(32);
    gt.in[0] <== matchCount;
    gt.in[1] <== 12;
    
    isEnoughMatches <== gt.out;
}

template FingerprintMatch(numPrivateFingerprints, numMinutiae) {
    signal input publicFingerprint[numMinutiae][4];
    signal input privateFingerprints[numPrivateFingerprints][numMinutiae][4];
    signal output matched;
    
    signal matchCounts[numPrivateFingerprints];
    signal matchFlags[numPrivateFingerprints];
    
    component matchAccumulators[numPrivateFingerprints];
    component matchCountCheckers[numPrivateFingerprints];
    
    for (var i = 0; i < numPrivateFingerprints; i++) {
        matchAccumulators[i] = MatchAccumulator(numMinutiae);
        for (var j = 0; j < numMinutiae; j++) {
            for (var l = 0; l < 4; l++) {
                matchAccumulators[i].publicFingerprint[j][l] <== publicFingerprint[j][l];
                matchAccumulators[i].privateFingerprint[j][l] <== privateFingerprints[i][j][l];
            }
        }
        matchCounts[i] <== matchAccumulators[i].matchSum;

        matchCountCheckers[i] = CheckMatchCount();
        matchCountCheckers[i].matchCount <== matchCounts[i];
        matchFlags[i] <== matchCountCheckers[i].isEnoughMatches;
    }
    
    // Sum match flags using an intermediate signal
    signal sumMatchFlags_intermediate[numPrivateFingerprints + 1];
    sumMatchFlags_intermediate[0] <== 0;

    for (var i = 0; i < numPrivateFingerprints; i++) {
        sumMatchFlags_intermediate[i + 1] <== sumMatchFlags_intermediate[i] + matchFlags[i];
    }

    signal sumMatchFlags <== sumMatchFlags_intermediate[numPrivateFingerprints];
    
    // Determine if there's a match
    component hasMatch = GreaterThan(32);
    hasMatch.in[0] <== sumMatchFlags;
    hasMatch.in[1] <== 0;
    
    matched <== hasMatch.out;
}

component main {public [publicFingerprint]} = FingerprintMatch(20, 30);