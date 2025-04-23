// src/components/UploadFingerprints.tsx (Example Path)

import React, { useState, ChangeEvent, FormEvent } from 'react'; // Use specific event types
import axios from 'axios'; // Using axios for potentially simpler request setup, but fetch is also fine

// Define the expected response structure from the backend
interface ApiResponse {
    verified?: boolean; // Optional, as it might not be present on errors
    message: string;
    error?: string; // Optional error details
}

const UploadFingerprints: React.FC = () => { // Use React.FC for functional components
    const [privateFile, setPrivateFile] = useState<File | null>(null);
    const [publicFile, setPublicFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [responseMessage, setResponseMessage] = useState<string | null>(null);
    const [isVerified, setIsVerified] = useState<boolean | null>(null); // Track verification status: null, true, or false

    // ---- Configuration ----
    // IMPORTANT: Replace with your actual backend URL
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
    const API_ENDPOINT = `${BACKEND_URL}/api/match`; // Use the correct endpoint

    const handleFileChange = (
        e: ChangeEvent<HTMLInputElement>,
        setter: React.Dispatch<React.SetStateAction<File | null>>
    ) => {
        if (e.target.files && e.target.files.length > 0) {
            setter(e.target.files[0]);
            // Reset status on new file selection
            setResponseMessage(null);
            setIsVerified(null);
        } else {
            setter(null); // Clear if selection is cancelled
        }
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => { // Use FormEvent
        e.preventDefault();
        if (!privateFile || !publicFile) {
            setResponseMessage("Please select both private and public files before submitting.");
            setIsVerified(null);
            return;
        }

        setIsLoading(true);
        setResponseMessage('Uploading and processing... This may take a while.');
        setIsVerified(null);

        const formData = new FormData();
        formData.append('privateFile', privateFile); // Key matches backend 'privateFile'
        formData.append('publicFile', publicFile);   // Key matches backend 'publicFile'

        try {
            // Using Axios:
            const response = await axios.post<ApiResponse>(API_ENDPOINT, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                // Optional timeout for long ZK operations (e.g., 5 minutes)
                // timeout: 300000
            });

            const data = response.data;
            setResponseMessage(data.message || 'Processing completed.');
            setIsVerified(data.verified ?? null); // Use nullish coalescing for verified status

          
            if (data.verified !== undefined) { // Or check response.status === 200
              setPrivateFile(null);
              setPublicFile(null);
            }

        } catch (error: any) { // Catch 'any' or 'unknown' type
            console.error('Submission error:', error);
            let errMsg = 'An error occurred during submission.';
            if (axios.isAxiosError(error) && error.response) {
                 // Handle Axios error with response
                const errData = error.response.data as Partial<ApiResponse>;
                 errMsg = `Error ${error.response.status}: ${errData.message || error.message} ${errData.error ? `(${errData.error})` : ''}`;
            } else if (error instanceof Error) {
                 // Handle generic Error
                 errMsg = `Error: ${error.message}`;
            }
             setResponseMessage(errMsg);
             setIsVerified(false); // Assume failure on error
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to determine border color based on verification status
    const getBorderColor = () => {
        if (isVerified === true) return 'border-green-500';
        if (isVerified === false) return 'border-red-500';
        return 'border-gray-300'; // Default or before result
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <form
                className="bg-white p-6 md:p-8 rounded-xl shadow-lg w-full max-w-lg" // Responsive width
                onSubmit={handleSubmit}
                // Use key prop to force re-render and clear inputs visually if state is nullified
                // key={privateFile || publicFile ? 'files-selected' : 'no-files'}
            >
                <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
                    Privacy-Preserving Fingerprint Check
                </h2>

                {/* Private File Input */}
                <div className="mb-5">
                    <label htmlFor="privateFile" className="block text-sm font-medium text-gray-700 mb-1">
                        Private Fingerprints File (.json) {/* Updated Label */}
                    </label>
                    <input
                        id="privateFile" // Add id for label association
                        type="file"
                        accept=".json" // IMPORTANT: Set to expected file type (e.g., .txt for hashes)
                        onChange={(e) => handleFileChange(e, setPrivateFile)}
                        className={`block w-full text-sm text-gray-500 p-2 border ${getBorderColor()} rounded-md shadow-sm
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-full file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-violet-50 file:text-violet-700
                                    hover:file:bg-violet-100
                                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500`} // Added focus style
                    />
                    {privateFile && <span className="text-xs text-gray-500 mt-1 block">Selected: {privateFile.name}</span>}
                </div>

                {/* Public File Input */}
                <div className="mb-6">
                    <label htmlFor="publicFile" className="block text-sm font-medium text-gray-700 mb-1">
                        Public Fingerprints File (.json) {/* Corrected Label */}
                    </label>
                    <input
                        id="publicFile" // Add id for label association
                        type="file"
                        accept=".json" // IMPORTANT: Set to expected file type (e.g., .txt)
                        onChange={(e) => handleFileChange(e, setPublicFile)}
                        className={`block w-full text-sm text-gray-500 p-2 border ${getBorderColor()} rounded-md shadow-sm
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-full file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-violet-50 file:text-violet-700
                                    hover:file:bg-violet-100
                                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500`} // Added focus style
                    />
                    {publicFile && <span className="text-xs text-gray-500 mt-1 block">Selected: {publicFile.name}</span>}
                </div>

                {/* Submit Button */}
                <div className="text-center mb-4">
                    <button
                        type="submit"
                        disabled={isLoading || !privateFile || !publicFile}
                        className="bg-violet-600 text-white px-8 py-2.5 rounded-full font-medium hover:bg-violet-700 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto" // Responsive button width
                    >
                        {isLoading ? 'Processing...' : 'Verify Match'}
                    </button>
                </div>

                {/* Loading Indicator */}
                {isLoading && (
                    <div className="flex items-center justify-center mt-4 text-sm text-violet-600">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-violet-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing request...
                    </div>
                )}

                {/* Response Message Area */}
                {responseMessage && (
                    <div className={`mt-4 p-3 rounded-md text-sm text-center border ${getBorderColor()} ${isVerified === true ? 'bg-green-50 text-green-800' : isVerified === false ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
                         {isVerified === true ? '✅ ' : isVerified === false ? '❌ ' : ''}
                        {responseMessage}
                    </div>
                )}
            </form>
        </div>
    );
};

export default UploadFingerprints;