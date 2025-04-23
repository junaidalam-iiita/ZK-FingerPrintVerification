#!/bin/bash
set -e # Exit script immediately if any command fails

# --- Configuration ---
# Circuit name (without .circom)
CIRCUIT_NAME=fingerprint_matcher
# Directory for compilation artifacts and intermediate files
BUILD_DIR=build
# Power for Powers of Tau ceremony (e.g., 16 means max 2^16 constraints)
# Adjust based on your circuit size complexity. Use `circom circuit.circom --inspect`
PTAU_POWER=16
# Location for the final phase 2 ptau file (can be shared across projects)
PTAU_DIR=ptau # Store it in a subdirectory for tidiness
PTAU_FINAL_PATH="${PTAU_DIR}/pot${PTAU_POWER}_final.ptau"

# --- Ensure Directories Exist ---
mkdir -p "$BUILD_DIR"
mkdir -p "$PTAU_DIR"
mkdir -p "$BUILD_DIR/${CIRCUIT_NAME}_js" # Ensure JS witness dir exists

# --- Phase 1: Compile Circuit ---
# This should run every time if the circuit might have changed
echo "1. Compiling circuit..."
circom ${CIRCUIT_NAME}.circom --r1cs --wasm --sym -o ${BUILD_DIR}
echo "Circuit compiled successfully."


# --- Phase 3: Generate Witness ---
echo "3. Generating witness..."
node ${BUILD_DIR}/${CIRCUIT_NAME}_js/generate_witness.js ${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm inputs.json ${BUILD_DIR}/witness.wtns
echo "Witness generated successfully."

# --- Phase 4: Powers of Tau (Conditional) ---
echo "4. Checking/Generating Powers of Tau file..."
if [ ! -f "$PTAU_FINAL_PATH" ]; then
    echo "  PTAU file not found at $PTAU_FINAL_PATH. Generating a new one (Phase 1)..."
    # 1. Start Powers of Tau ceremony (generate pot<power>_0000.ptau)
    snarkjs powersoftau new bn128 ${PTAU_POWER} ${BUILD_DIR}/pot${PTAU_POWER}_0000.ptau -v
    echo "  Contributing randomness (Phase 1)..."
    # 2. Contribute randomness (replace with real entropy source/MPC for production)
    snarkjs powersoftau contribute ${BUILD_DIR}/pot${PTAU_POWER}_0000.ptau ${BUILD_DIR}/pot${PTAU_POWER}_0001.ptau --name="First contribution" -v -e="$(date)"
    echo "  Preparing Phase 2..."
    # 3. Prepare for Phase 2 (produces the final ptau needed for setup)
    # Use a temporary name in build dir first
    snarkjs powersoftau prepare phase2 ${BUILD_DIR}/pot${PTAU_POWER}_0001.ptau ${BUILD_DIR}/pot_temp_final.ptau -v
    # Move the final ptau to the designated location
    mv ${BUILD_DIR}/pot_temp_final.ptau "$PTAU_FINAL_PATH"
    # Clean up intermediate files from build directory
    rm ${BUILD_DIR}/pot${PTAU_POWER}_0000.ptau ${BUILD_DIR}/pot${PTAU_POWER}_0001.ptau
    echo "  Generated and saved Powers of Tau file: $PTAU_FINAL_PATH"
else
    echo "  Found existing Powers of Tau file: $PTAU_FINAL_PATH"
fi

# --- Phase 5: Groth16 Setup (Circuit Specific) ---
# This needs the circuit R1CS and the final PTAU file
# We run this every time as the R1CS file might change if the circuit changed.
# If R1CS hasn't changed, re-running setup is redundant but usually quick.
echo "5. Setting up Groth16 (Phase 2)..."
snarkjs groth16 setup ${BUILD_DIR}/${CIRCUIT_NAME}.r1cs "$PTAU_FINAL_PATH" ${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey
echo "  Initial zkey created."
# Simulate contribution (for testing ONLY - use MPC for production)
echo "  Contributing to zkey (simulation)..."
snarkjs zkey contribute ${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey ${BUILD_DIR}/${CIRCUIT_NAME}_0001.zkey --name="1st Contributor" -v -e="$(date)"
echo "  Contribution added."
# Optionally apply beacon (more secure final key)
# echo "  Applying beacon (optional)..."
# Replace 0x... with a real recent unpredictable value (e.g., block hash)
# BEACON_HASH=0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
# snarkjs zkey beacon ${BUILD_DIR}/${CIRCUIT_NAME}_0001.zkey ${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey $BEACON_HASH 10 -n="Final Beacon" -v
# PROVING_KEY="${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey"
# Using the contributed key without beacon for this example
PROVING_KEY="${BUILD_DIR}/${CIRCUIT_NAME}_0001.zkey"
VERIFICATION_KEY="${BUILD_DIR}/verification_key.json"
echo "  Final proving key: $PROVING_KEY"

# --- Phase 6: Export Verification Key ---
echo "6. Exporting Verification Key..."
snarkjs zkey export verificationkey "$PROVING_KEY" "$VERIFICATION_KEY"
echo "  Verification key exported to $VERIFICATION_KEY"

# --- Phase 7: Generate Proof ---
echo "7. Generating Proof..."
snarkjs groth16 prove "$PROVING_KEY" ${BUILD_DIR}/witness.wtns ${BUILD_DIR}/proof.json ${BUILD_DIR}/public.json
echo "  Proof generated: ${BUILD_DIR}/proof.json"
echo "  Public signals: ${BUILD_DIR}/public.json"

# --- Phase 8: Verify Proof ---
echo "8. Verifying Proof..."
snarkjs groth16 verify "$VERIFICATION_KEY" ${BUILD_DIR}/public.json ${BUILD_DIR}/proof.json
echo "  Verification result above."

echo "Script finished."