// src/lib/mongodb.ts
import { MongoClient, ServerApiVersion } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
  // Throw error during build or server start if URI is missing
  // Avoid doing this at runtime in API routes if possible, handle connection errors there
  if (process.env.NODE_ENV !== 'production' || process.env.BUILD_TIME) {
      console.warn('MONGODB_URI environment variable is not defined. Database connectivity will fail.');
      // In a build step, you might want to throw an error:
      // throw new Error('Please define the MONGODB_URI environment variable inside .env');
  }
}

// Define MongoClientOptions with specific settings
const options = {
  serverApi: {
    version: ServerApiVersion.v1, // Use Stable API
    strict: true,
    deprecationErrors: true,
  },
  // Recommended settings for serverless environments:
  maxPoolSize: 10, // Adjust pool size based on expected concurrency
  minPoolSize: 1,
  connectTimeoutMS: 5000, // 5 seconds connection timeout
  socketTimeoutMS: 30000, // 30 seconds socket timeout
};


let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

/**
 * Establishes or returns a cached connection to the MongoDB database.
 * Handles connection logic for both development (with HMR) and production.
 * Includes basic error handling for the initial connection attempt.
 *
 * @returns A Promise resolving to the connected MongoClient instance.
 * @throws An error if the MONGODB_URI is not defined or if the connection fails.
 */
const connectToDatabase = async (): Promise<MongoClient> => {
   if (!uri) {
       // It's better to throw this error here if the URI is definitively missing at runtime
       // Or handle it gracefully in the API routes/hooks that call this function.
       throw new Error('MongoDB URI is not configured. Please set the MONGODB_URI environment variable.');
   }

  if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    let globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>
    };

    if (!globalWithMongo._mongoClientPromise) {
      try {
        client = new MongoClient(uri, options);
        globalWithMongo._mongoClientPromise = client.connect();
        console.log("MongoDB: Establishing new connection (development)...");
      } catch (error) {
        console.error("MongoDB: Failed to create client (development):", error);
        // Clear the promise to allow retrying on next call
        globalWithMongo._mongoClientPromise = null;
        throw new Error("Failed to initialize MongoDB client."); // Re-throw for callers
      }
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    if (!clientPromise) {
       try {
           client = new MongoClient(uri, options);
           clientPromise = client.connect();
           console.log("MongoDB: Establishing new connection (production)...");
       } catch (error) {
           console.error("MongoDB: Failed to create client (production):", error);
           clientPromise = null; // Clear the promise
           throw new Error("Failed to initialize MongoDB client."); // Re-throw
       }
    }
  }

  try {
    // Wait for the connection promise to resolve
    const connectedClient = await clientPromise;
    // Optional: Send a ping to confirm connection only on first connect?
    // This adds latency, might be better to rely on successful operation calls.
    // await connectedClient.db("admin").command({ ping: 1 });
    // console.log("MongoDB: Connection successful.");
    return connectedClient;
  } catch (error) {
    console.error("MongoDB: Connection failed:", error);
    // Reset the promise so the next call attempts to reconnect.
    clientPromise = null;
    if (process.env.NODE_ENV === 'development') {
        (global as any)._mongoClientPromise = null;
    }
    throw new Error("Failed to connect to MongoDB."); // Re-throw the error
  }
};

export default connectToDatabase;
