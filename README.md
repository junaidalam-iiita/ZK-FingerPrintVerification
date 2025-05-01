
## Prerequisites

*   **Node.js:** v16 or later recommended (check snarkjs/circom compatibility).
*   **npm:** v7 or later recommended.
*   **Circom:** Follow the official installation instructions: [https://docs.circom.io/getting-started/installation/](https://docs.circom.io/getting-started/installation/)
*   **SnarkJS:** Install globally or ensure it's available in the backend's environment: `npm install -g snarkjs`

## Backend Setup

1.  **Navigate to Backend Directory:**
    ```bash
    cd backend
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Circom Circuit Setup:**
    *   **Place Circuit:** Ensure your primary Circom circuit file (e.g., `<Your Circuit Name>.circom`) is inside the `backend/circuits/` directory.
    *   **Compile & Setup:** You need to perform the Circom compilation and Groth16 trusted setup *once*. This involves:
        *   Compiling the circuit to get R1CS and WASM/JS witness generators.
        *   Using a Powers of Tau file (Phase 1). You can download one or generate it (time-consuming).
        *   Generating the Phase 2 `.zkey` files (final requires a contribution, `0001` is often used for testing).
        *   Exporting the `verification_key.json`.
    *   **Example Setup Script (`run_full_setup.sh`):** Adapt the provided example script `backend/circuits/run_full_setup.sh` (or create your own) to perform these steps. It likely needs a Powers of Tau file (e.g., `powersOfTau28_hez_final_18.ptau`, download it and place in `circuits/`).
        ```bash
        cd circuits
        # Download powersOfTau file if needed
        # Example: wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_18.ptau
        bash run_full_setup.sh # Execute your setup script
        cd ..
        ```
    *   **Verification:** After setup, verify that the build/ directory exists inside backend/circuits/ and contains the .wasm, generate_witness.js, .zkey (e.g., `<Your Circuit Name>_0001.zkey`), and verification_key.json.
    *   **ZKey Name:** Verify that the `ZKEY_FILENAME` constant in `backend/src/server.ts` **matches** the actual `.zkey` filename generated in the `build/` directory.
    *   **Script Permissions:** Make the execution script executable:
        ```bash
        chmod +x circuits/execute_proof.sh
        ```

4.  **Compile TypeScript:**
    ```bash
    npm run build
    ```
    (This compiles `src/**/*.ts` to JavaScript in the `dist/` directory)

5.  **Run the Backend Server:**
    *   **Development (with auto-reload):**
        ```bash
        npm run dev
        ```
    *   **Production/Standard Run (after build):**
        ```bash
        npm start
        ```
    *   The server should start (default: `http://localhost:5001`) and perform prerequisite checks for necessary files.

## Frontend Setup

1.  **Navigate to Frontend Directory:**
    ```bash
    cd ../frontend # Or your frontend directory name
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Backend URL (Optional but Recommended):**
    *   Create a `.env` file in the `frontend/` root directory (if it doesn't exist).
    *   Add the following line, adjusting the URL/port if your backend runs elsewhere:
        ```env
        # For Vite:
        VITE_BACKEND_URL=http://localhost:5001
        ```
    *   The frontend code (`UploadFingerprints.tsx`) uses this environment variable first, falling back to `http://localhost:5001`.

4.  **Run the Frontend Development Server:**
    ```bash
    npm run dev # Vite standard command
    ```
    *   The development server will usually start on `http://localhost:3000` or another port.

## Usage

1.  Ensure both the backend and frontend servers are running.
2.  Open your browser and navigate to the frontend URL (e.g., `http://localhost:3000`).
3.  You should see the "Privacy-Preserving Fingerprint Check" interface.
4.  Prepare two JSON files representing your fingerprint inputs:
    *   **Private Input JSON:** This file contains the private/witness data needed by the circuit (e.g., the database fingerprints, signatures). Example structure:
        ```json
        // Example: private_data.json
        {
          "dbFpArray": [ /* array of database fingerprint arrays */ ],
          "querySignature": [ /* R8x, R8y, S */ ],
          "dbSignatures": [ /* array of db signatures */ ]
          // ... any other private signals ...
        }
        ```
    *   **Public Input JSON:** This file contains the public data (e.g., the query fingerprint itself, public keys). Example structure:
        ```json
        // Example: public_data.json
        {
           "queryFp": [ /* query fingerprint array */ ],
           "queryPublicKey": [ /* Pkx, Pky */ ],
           "dbPublicKeys": [ /* array of db public keys */ ]
           // ... any other public signals ...
        }
        ```
    *   **(Optional) Generation:** You can use the `backend/circuits/generate.js` script (run with `node generate.js`) to create sample `public.json` and `private.json` files based on random data, which can be used for testing uploads.
5.  Use the "Browse" / "Choose File" buttons to select your prepared `private.json` file for the "Private Fingerprints File" input and your `public.json` file for the "Public Fingerprints File" input.
6.  Click the "Verify Match" button.
7.  The files will be uploaded to the backend. The backend will merge them, run the ZK proving process via the shell script, and return the verification result (`Verified: true/false`) along with status messages or error details.

## Important Notes

*   **Circuit Logic:** The specific structure expected within the uploaded JSON files **must match** the `signal input` and `signal private input` definitions in your Circom circuit (`backend/circuits/<Your Circuit Name>.circom`).
*   **Error Handling:** The backend attempts to provide informative error messages based on the stage of failure (parsing, witness generation, proof, verification). Check both the browser UI and the backend terminal logs for detailed errors.
*   **Performance:** ZK proof generation can be computationally intensive and may take significant time depending on the circuit complexity and input size. The UI indicates loading during this process.
*   **Security:** This is a demonstration project. For production use, consider:
    *   Robust input validation and sanitization.
    *   File size limits.
    *   Rate limiting.
    *   More sophisticated authentication/authorization if needed.
    *   Secure management of trusted setup artifacts.
    *   Stricter CORS policies for the backend.

## Contributing

[Optional: Add guidelines if others will contribute]

---

Modify this template to accurately reflect your specific circuit names, setup procedures, and any other unique aspects of your project.
