import express, { Request, Response, Application } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { exec, ExecException } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

// --- Custom Request Type ---
declare global {
    namespace Express {
        interface Request {
            uniqueDir?: string;
        }
    }
}

// --- Configuration ---
const PROJECT_ROOT = path.join(__dirname, '..');
const port: number = parseInt(process.env.PORT || '5001', 10);
const CIRCUITS_DIR = path.join(PROJECT_ROOT, 'circuits');
const EXECUTE_SCRIPT = path.join(CIRCUITS_DIR, 'execute_proof.sh');
const PRECOMPILED_DIR = path.join(CIRCUITS_DIR, 'build');
const ZKEY_FILENAME = "fingerprint_matcher_0001.zkey"; // Keep updated
const UPLOADS_DIR = path.join(PROJECT_ROOT, 'uploads');

// --- Types ---
interface CircomInput { // Adjust as needed
    [key: string]: any;
}
interface CommandResult { stdout: string; stderr: string; }
interface CommandError extends ExecException { stdout?: string; stderr?: string; }

// --- Express App ---
const app: Application = express();
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(console.error);

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({ /* ... unchanged ... */
    destination: async (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        const uniqueDir = path.join(UPLOADS_DIR, uuidv4());
        req.uniqueDir = uniqueDir;
        try {
            await fs.mkdir(uniqueDir, { recursive: true });
            cb(null, uniqueDir);
        } catch (err: any) {
            cb(err instanceof Error ? err : new Error(String(err)), '');
        }
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ // JSON filter and limits
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json') { cb(null, true); }
        else { cb(new Error('Invalid file type. Only JSON files (.json) are allowed.')); }
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

// --- Helper: Run Command ---
function runCommand(command: string): Promise<CommandResult> { // Simplified version
    console.log(`[Node Backend] Executing command: ${command}`);
    return new Promise((resolve, reject) => {
        exec(command, (error: ExecException | null, stdout: string, stderr: string) => {
             console.log(`[Shell Command STDOUT]:\n${stdout}`); // Always log
             console.error(`[Shell Command STDERR]:\n${stderr}`); // Always log
            if (error) { // Non-zero exit code
                console.error(`[Node Backend] Command failed: ${command} (Exit Code: ${error.code})`);
                const commandError: CommandError = { ...error, stderr, stdout };
                return reject(commandError); // Reject promise with enriched error object
            }
             // Exit code 0
            resolve({ stdout, stderr }); // Resolve with output
        });
    });
}

// --- API Endpoint with Enhanced Error Handling ---
app.post('/api/match', upload.fields([{ name: 'privateFile', maxCount: 1 }, { name: 'publicFile', maxCount: 1 }]), async (req: Request, res: Response): Promise<void> => {
    console.log(`[Node Backend] Received /api/match request with JSON files...`);
    const uniqueDir = req.uniqueDir;

    // Initial validation
    if (!req.files || typeof req.files !== 'object' || !('privateFile' in req.files) || !('publicFile' in req.files)) {
        if (uniqueDir) await fs.rm(uniqueDir, { recursive: true, force: true }).catch(console.error);
        res.status(400).json({ verified: false, message: 'Both private and public JSON files are required.' });
        return;
    }
    const files = req.files as { privateFile: Express.Multer.File[], publicFile: Express.Multer.File[] };
    if (!uniqueDir) { /* ... handle missing uniqueDir ... */
        console.error('[Node Backend] Internal error: Unique directory path missing.');
        res.status(500).json({ verified: false, message: 'Server setup error: Failed to create temporary directory.' });
        return;
    }

    const privateFilePath = files.privateFile[0].path;
    const publicFilePath = files.publicFile[0].path;
    const finalInputJsonPath = path.join(uniqueDir, 'input.json');

    console.log(`[Node Backend] Temp dir: ${uniqueDir}, Private file: ${privateFilePath}, Public file: ${publicFilePath}`);

    try {
        // --- 1. Parse and Merge ---
        console.log('[Node Backend] Reading, parsing, and merging JSON files...');
        let privateJsonData: any;
        let publicJsonData: any;
        try { // Parse Private
            privateJsonData = JSON.parse(await fs.readFile(privateFilePath, 'utf-8'));
        } catch (parseError: any) {
            throw new Error(`Invalid format in private file. Ensure it's valid JSON. (${parseError.message})`); // Will result in 400
        }
        try { // Parse Public
            publicJsonData = JSON.parse(await fs.readFile(publicFilePath, 'utf-8'));
        } catch (parseError: any) {
            throw new Error(`Invalid format in public file. Ensure it's valid JSON. (${parseError.message})`); // Will result in 400
        }

        // --- 2. Write Merged input.json ---
        const finalInputData: CircomInput = { ...privateJsonData, ...publicJsonData };
        const replacer = (key: string, value: any) => typeof value === 'bigint' ? value.toString() : value;
        console.log(`[Node Backend] Writing final merged input.json to: ${finalInputJsonPath}`);
        await fs.writeFile(finalInputJsonPath, JSON.stringify(finalInputData, replacer, 2));

        // --- 3. Execute Script ---
        console.log(`[Node Backend] Executing verification script...`);
        const command = `bash "${EXECUTE_SCRIPT}" "${finalInputJsonPath}" "${uniqueDir}"`;
        const scriptResult = await runCommand(command); // Throws on non-zero exit

        // --- 4. Handle Success ---
        // If runCommand resolved, the script exited 0. Assume success based on script design.
        // Optionally check scriptResult.stdout for specific "OK!" message if script guarantees it on success.
        console.log('[Node Backend] Script execution successful (exit code 0).');
        res.json({
            verified: true,
            message: 'Fingerprint match verification successful.',
        });

    } catch (error: any) {
        // --- Enhanced Error Handling ---
        console.error('[Node Backend] Error during processing:', error.message || error);
        let statusCode = 500; // Default to internal server error
        let failureMessage = 'Processing failed unexpectedly.';
        let errorDetails = "Check server logs for more details."; // Default detail

        if (error instanceof Error && error.message.startsWith('Invalid format')) {
            // Error during JSON parsing (Bad user input)
            statusCode = 400;
            failureMessage = "Invalid Input File Format";
            errorDetails = error.message; // Get specific parsing error
        }
        else if (error && typeof error === 'object' && 'stderr' in error && typeof error.code === 'number' && error.code !== 0 ) {
            // Error from runCommand (script failed with non-zero exit code)
            statusCode = 500; // Script execution failure is a server-side problem
            const stderrContent = (error.stderr as string || '').toLowerCase(); // Lowercase for easier matching
            const stdoutContent = (error.stdout as string || ''); // May contain useful info too

            // Attempt to determine the stage of failure from stderr/stdout
            if (stderrContent.includes('witness generation failed')) {
                failureMessage = 'Verification process failed: Witness computation error.';
                 // Try to extract the core constraint/assert reason
                 const assertMatch = stderrContent.match(/error: assert failed.*?line: (\d+)/s); // Try to get line number
                 const constraintMatch = stderrContent.match(/constraint not satisfied/);
                 if (assertMatch) {
                     errorDetails = `Circuit assertion failed (around line ${assertMatch[1]}). Check input ranges/values.`;
                 } else if (constraintMatch) {
                     errorDetails = `Circuit constraint not satisfied. Check input values correspond to circuit logic.`;
                 } else {
                      errorDetails = `Witness generator script failed. Check circuit inputs and logs.`;
                 }

            } else if (stderrContent.includes('proof generation failed')) { // Assuming script logs this
                failureMessage = 'Verification process failed: Proof generation error.';
                 // Provide generic detail unless specific snarkjs error can be found
                 errorDetails = `Proof generation script failed. This might be due to setup or resource issues.`;

            } else if (stderrContent.includes('verification failed') || stderrContent.includes('invalid proof')) { // Assuming script logs this OR snarkjs outputs it
                 // Distinguish from script failure, potentially meaning inputs pass basic checks but don't match ZK rules
                failureMessage = 'Verification Failed: Proof invalid.';
                statusCode = 400; // Arguably, invalid proof relates to the provided inputs not matching
                errorDetails = `The generated proof did not verify against the public inputs. The fingerprints likely do not match according to the circuit logic.`;

             } else if (error.code === 137) { // Exit code 137 often means process killed (e.g., OOM)
                 failureMessage = 'Processing failed: Resource Limit Exceeded.';
                 errorDetails = 'The verification process likely ran out of memory (OOM Killed). Try with smaller inputs or increase server memory.';
             } else {
                // Default script failure if specific stage not identified
                failureMessage = `Verification script failed unexpectedly (Exit code ${error.code}).`;
                 // Provide first few lines of stderr as details
                 errorDetails = stderrContent.split('\n').slice(0,5).join('\n').substring(0, 500) || "No specific error details available from script.";
             }

        } else if (error instanceof Error) {
             // Other FS errors or general errors during setup before script execution
             statusCode = 500;
             failureMessage = 'Server Error During Processing';
             errorDetails = error.message;
        }

        // Log the structured error before sending
        console.error(`[Node Backend] Sending error response - Status: ${statusCode}, Message: ${failureMessage}, Details: ${errorDetails.substring(0,200)}...`);

        res.status(statusCode).json({
            verified: false,
            message: failureMessage,
            error: errorDetails, // Send the determined details
        });

    } finally {
        // --- Cleanup ---
        if (uniqueDir) {
            console.log(`[Node Backend] Cleaning up temporary directory: ${uniqueDir}`);
            await fs.rm(uniqueDir, { recursive: true, force: true }).catch((err: any) => {
                console.error(`[Node Backend] Failed to remove temporary directory ${uniqueDir}:`, err);
            });
        }
        console.log(`[Node Backend] Request to /api/match finished.`);
    }
});

// --- Startup Checks ---
// (checkPrerequisites remains the same)
async function checkPrerequisites(): Promise<void> { /* ... unchanged ... */ }

// --- Server Start ---
app.listen(port, async () => {
    console.log(`[Node Backend] Server listening at http://localhost:${port}`);
    console.log(`[Node Backend] Enhanced error handling enabled.`);
    // ... other startup logs ...
    await checkPrerequisites();
});